# Bahi Khata

A personal finance ledger for Pakistan — accounts, transactions, an emergency-buffer
tracker, live Islamic-savings-rate lookups, charts, and an AI advisor that reads your
actual data. Built as a South Asian ledger-book ("bahi khata") aesthetic: hairline
rules, tabular monospace figures, paper palette with light/dark mode.

This repo was exported from a Claude.ai artifact prototype and packaged as a
standalone Vite + React app, ready to run locally, push to GitHub, and deploy.

## Current state — read this first

- **Frontend: complete.** All screens work — accounts, transactions (add/edit/delete),
  emergency buffer, Insights/analytics with charts, an AI Advisor chat, light/dark
  theme, Google AdSense placement slots (inactive until you add a client ID).
- **Auth: wired to Supabase, with a localStorage mock fallback.** Set
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`) and the
  app uses real Supabase email/password auth. Leave them unset and it falls back
  to a mock, browser-only auth (non-cryptographic hash) — fine for local
  exploration, **not real security**, and not synced across devices.
- **Storage: a real relational schema, RLS-enforced, with a localStorage mock
  fallback.** With Supabase configured, accounts/transactions/categories/advisor
  chat live in their own Postgres tables (`supabase/migrations/0001_init.sql`),
  each scoped to `user_id` and protected by Row Level Security — not a single
  JSON blob. Without Supabase, data stays in browser localStorage only, for
  standalone local exploration.
- **AI: dual-provider, server-side proxy.** `api/claude.js` holds provider keys
  server-side and is called from the frontend — never a browser-exposed key.
  Users pick Gemini (free tier, default) or Claude (better quality) per-account
  in Setup. See "AI features" below.
- **Billing: manual, no Stripe.** New users get a 14-day free trial automatically;
  after that, AI features gate on `subscriptions.status`/`plan`, which *you* set
  by hand via SQL after receiving payment out of band. See
  `supabase/migrations/README.md` for the exact commands. There is no checkout
  flow and no card is ever collected by this app.

## Quick start

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Sign up with any email/password (6+ characters) —
this creates a local mock account and takes you straight into your ledger.

## Project structure

```
bahi-khata/
├── src/
│   ├── App.jsx          # UI, reducer, auth, AI calls
│   ├── lib/db.js         # relational data-access layer (Supabase mode)
│   └── main.jsx          # React root
├── api/
│   └── claude.js         # server-side AI proxy — dual provider + billing gate
├── supabase/
│   ├── migrations/0001_init.sql   # schema + RLS
│   └── migrations/README.md       # manual billing commands
├── index.html
├── package.json
├── vite.config.js
├── .env.example         # copy to .env once you have Supabase/AI credentials
└── README.md
```

Most UI still lives in one file (`App.jsx`) because it was extracted from a
single-file Claude artifact prototype; storage and billing, however, are now
real (see below). Splitting the UI into multiple component files is a
reasonable next step but not required to deploy.

## Supabase setup

### 1. Create a project and set env vars

Create a project at [supabase.com](https://supabase.com), grab its URL and
anon key from Settings → API, then:

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

With those unset, the app runs standalone against localStorage and a mock
auth layer instead — useful for local exploration without a Supabase project.

### 2. Run the schema migration

In the Supabase SQL editor, paste and run `supabase/migrations/0001_init.sql`.
This creates `profiles`, `subscriptions`, `accounts`, `categories`,
`transactions`, `savings_goals`, `advisor_messages`, and `ai_usage`, each with
Row Level Security scoped to `user_id` — that's the real tenant boundary, not
anything enforced in the frontend. It also seeds a default Pakistan-relevant
category list and creates a trigger so every new signup gets a `profiles` row
and a 14-day-trial `subscriptions` row automatically.

### 3. Manual billing

There's no Stripe integration by design — you handle payment and account
upgrades yourself. See `supabase/migrations/README.md` for the exact SQL to
run when a user pays you (bank transfer, cash, whatever) to mark them Pro, or
to expire access. `api/claude.js` checks this table server-side before every
AI call, so the gate can't be bypassed from the browser.

### 3. Email confirmation

By default Supabase requires email confirmation before a session is issued —
`signUp` will throw "check your email to confirm" until the user clicks the
confirmation link, then `signIn` works normally. Turn this off in
Authentication → Providers → Email if you want instant sign-up during testing.

## AI features (Advisor, live savings rate, Insights analysis)

These call `api/claude.js`, a Vercel serverless function that proxies to
whichever provider the user picked in Setup — never a key exposed to the
browser. Two providers are supported, both configured with their own key:

1. **Gemini** (default) — free tier, no billing required. Get a key at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and set
   `GEMINI_API_KEY` in Vercel → Settings → Environment Variables.
2. **Claude** (optional, better quality) — paid. Get a key at
   [console.anthropic.com](https://console.anthropic.com) and set
   `ANTHROPIC_API_KEY` the same way. Users switch to it from Setup → AI
   provider; if the key isn't set, that request fails clearly rather than
   silently falling back.

Set whichever you want to offer (or both), then redeploy — no `VITE_` prefix
on either, they must stay server-only.

Locally, `npm run dev` (plain Vite) doesn't run `api/` serverless functions — use
`vercel dev` instead if you want to test these features on your machine, with
the relevant key(s) in your local `.env`.

Every AI call is gated server-side against the caller's `subscriptions` row
(free/trialing users get a daily cap, expired accounts are blocked with a
clear "upgrade" message) and logged to `ai_usage` for rate limiting — both
enforced using the caller's own Supabase session, under RLS, not a
client-supplied user id.

## Google AdSense

Ad slots are already placed (Home, Ledger, Insights — top and bottom of each).
They render as labeled placeholders until you set a client ID. Search for
`ADSENSE_CLIENT` in `App.jsx`, set it to your publisher id (`ca-pub-...`), give each
`<AdSlot>` a real slot id from your AdSense dashboard, and add the AdSense loader
script tag to `index.html`. Details are in the comment block above `AdSlot` in the
source.

## Suggested next steps, roughly in order

1. Push this to GitHub (see below).
2. Set up a Supabase project and the `khata_kv` table (see "Supabase setup" above) —
   auth and storage are already wired, just add your env vars.
3. Add one serverless function (Vercel/Netlify/Supabase Edge Function all work) to
   proxy Anthropic API calls server-side, and point the three `fetch` calls at it.
4. Deploy the frontend (Vercel or Netlify both deploy a Vite app with zero config
   once the repo is pushed).
5. Optional: split `App.jsx` into multiple files/components for maintainability —
   not required functionally, just easier to work in long-term.
6. Optional: add AdSense client ID once you have a live domain (AdSense requires a
   real, reviewed site before it serves ads).

## Creating the GitHub repo and deploying

This environment can't create a GitHub repo or deploy directly — that needs to run
from your machine (or Claude Code, which has your GitHub credentials). From your
terminal, in this project folder:

```bash
git init
git add .
git commit -m "Initial commit — Bahi Khata ledger app"
gh repo create bahi-khata --private --source=. --remote=origin --push
```

(`gh` is the GitHub CLI — `brew install gh` / `apt install gh`, then `gh auth login`
once, if you don't have it.)

For deployment, both Vercel and Netlify will deploy this with zero configuration
once it's on GitHub — connect the repo, framework preset "Vite", and it builds with
`npm run build` and serves `dist/`. Add your `.env` variables (Supabase URL/key etc.)
in the platform's dashboard once step 2 above is done.
