# Migrations & manual billing

Run `0001_init.sql` once against your Supabase project (SQL Editor → paste →
Run, or `supabase db push` if you use the CLI).

## Manual billing — no Stripe

There is no automated checkout. When a user pays you out of band (bank
transfer, cash, whatever), grant access yourself with SQL in the Supabase
SQL Editor:

```sql
-- Grant Pro (monthly) after receiving payment
update public.subscriptions
set plan = 'pro_monthly',
    status = 'active',
    current_period_end = now() + interval '1 month',
    notes = 'paid via bank transfer 2026-08-12'
where user_id = '<their-auth-user-id>';
```

```sql
-- Grant Pro (yearly)
update public.subscriptions
set plan = 'pro_yearly',
    status = 'active',
    current_period_end = now() + interval '1 year',
    notes = 'paid via bank transfer 2026-08-12'
where user_id = '<their-auth-user-id>';
```

```sql
-- Cancel / expire access
update public.subscriptions
set status = 'expired'
where user_id = '<their-auth-user-id>';
```

Find a user's id: Supabase dashboard → Authentication → Users, or:

```sql
select id, email from auth.users where email = 'someone@example.com';
```

New signups get a `subscriptions` row automatically (`plan='free'`,
`status='trialing'`, 14-day trial — see the `handle_new_user` trigger) so
they can try the app before you ever touch this table.

The `api/ai.js` proxy checks this table server-side before every AI call —
free/expired users get a clear "upgrade to continue" error instead of being
silently blocked or, on the other end, silently given unlimited paid usage.
