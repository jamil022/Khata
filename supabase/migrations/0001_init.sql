-- Bahi Khata — core relational schema, replacing the prototype's single
-- khata_kv JSON-blob table. Every user-owned table is scoped by user_id and
-- protected by Row Level Security — RLS is the real tenant boundary, not
-- application-level filtering.
--
-- Billing is MANUAL for now: no Stripe. `subscriptions.plan`/`status` are
-- set by you (the operator) via SQL after you receive payment out of band.
-- See supabase/migrations/README.md for the exact commands.

create extension if not exists pgcrypto;

-- ── Profiles: one row per auth user, app-level settings ──────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  theme           text not null default 'light' check (theme in ('light','dark')),
  ai_provider     text not null default 'gemini' check (ai_provider in ('gemini','anthropic')),
  advisor_persona text,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row on signup.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Subscriptions: MANUAL billing, no Stripe ──────────────────────────────
create table public.subscriptions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  plan        text not null default 'free' check (plan in ('free','pro_monthly','pro_yearly')),
  status      text not null default 'trialing' check (status in ('trialing','active','past_due','canceled','expired')),
  trial_ends_at    timestamptz not null default (now() + interval '14 days'),
  current_period_end timestamptz,
  notes       text,               -- operator notes, e.g. "paid via bank transfer 2026-08-12"
  updated_at  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
-- Users may read their own row (to show plan status in Setup) but never write it —
-- only the operator, via the Supabase dashboard / service role, changes plan/status.
create policy "read own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

-- ── Accounts ───────────────────────────────────────────────────────────
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('bank','wallet','cash','investment','loan','other')),
  tag             text,                 -- e.g. 'current','savings','salary account','closed'
  color           text not null,
  icon            text,
  opening_balance numeric(14,2) not null default 0,
  rate_pct        numeric(6,3),         -- manual override for savings/investment yield
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.accounts enable row level security;
create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Categories: system defaults (user_id null, readable by all) + user-owned ──
create table public.categories (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users(id) on delete cascade,
  name      text not null,
  kind      text not null check (kind in ('expense','income')),
  icon      text,
  is_system boolean not null default false
);

alter table public.categories enable row level security;
create policy "read system or own categories" on public.categories
  for select using (is_system or auth.uid() = user_id);
create policy "insert own categories" on public.categories
  for insert with check (auth.uid() = user_id and is_system = false);
create policy "update own categories" on public.categories
  for update using (auth.uid() = user_id and is_system = false);
create policy "delete own categories" on public.categories
  for delete using (auth.uid() = user_id and is_system = false);

insert into public.categories (name, kind, icon, is_system) values
  ('Utility bills',        'expense', '💡', true),
  ('Subscriptions',        'expense', '🔁', true),
  ('Food & groceries',     'expense', '🍽',  true),
  ('Transport',            'expense', '🚗', true),
  ('Family remittances',   'expense', '🏠', true),
  ('Loan payments',        'expense', '🏦', true),
  ('Zakat & charity',      'expense', '🤲', true),
  ('Rent',                 'expense', '🔑', true),
  ('Healthcare',           'expense', '⚕',  true),
  ('Education',            'expense', '📚', true),
  ('Shopping',             'expense', '🛍', true),
  ('Other expense',        'expense', '•',  true),
  ('Salary',               'income',  '💰', true),
  ('Freelance/business',   'income',  '💼', true),
  ('Gift',                 'income',  '🎁', true),
  ('Other income',         'income',  '•',  true);

-- ── Transactions ───────────────────────────────────────────────────────
-- category is a plain text label (not an FK) so it can be one of the system
-- defaults above, a user-defined one, or ad-hoc text — matching how the
-- reference prototype treats categories as free-form names, not ids.
--
-- from_account_id / to_account_id mirror the app's own tx.from / tx.to:
-- expense debits from_account_id, income credits to_account_id, transfer
-- and balance-correction adjustments use whichever side applies.
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  type              text not null check (type in ('expense','income','transfer','adjustment')),
  amount            numeric(14,2) not null check (amount >= 0),
  occurred_at       date not null,
  description       text,
  category          text,
  from_account_id   uuid references public.accounts(id) on delete cascade,
  to_account_id     uuid references public.accounts(id) on delete cascade,
  is_adjustment     boolean not null default false,
  created_at        timestamptz not null default now(),
  check (from_account_id is not null or to_account_id is not null)
);

alter table public.transactions enable row level security;
create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index transactions_user_date_idx on public.transactions (user_id, occurred_at desc);

-- Derived balances — the reconciliation source of truth. The frontend may
-- also compute this client-side for snappy UI, but this view is what an
-- audit / support investigation should trust.
create view public.account_balances as
select
  a.id as account_id,
  a.user_id,
  a.opening_balance
    + coalesce(sum(case
        when t.from_account_id = a.id then -t.amount
        when t.to_account_id = a.id then t.amount
        else 0
      end), 0) as balance
from public.accounts a
left join public.transactions t
  on t.from_account_id = a.id or t.to_account_id = a.id
group by a.id, a.user_id, a.opening_balance;

-- ── Savings goals ──────────────────────────────────────────────────────
create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  label         text not null default 'Emergency buffer',
  target_amount numeric(14,2) not null default 0,
  milestones    jsonb not null default '[3,6]'
);

alter table public.savings_goals enable row level security;
create policy "own savings goals" on public.savings_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Advisor chat ───────────────────────────────────────────────────────
create table public.advisor_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table public.advisor_messages enable row level security;
create policy "own advisor messages" on public.advisor_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index advisor_messages_user_created_idx on public.advisor_messages (user_id, created_at);

-- ── AI usage log — backs per-user rate limiting in api/ai.js ──────────────
create table public.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.ai_usage enable row level security;
create policy "own ai usage" on public.ai_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at);
