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
- **Storage: wired to Supabase, with a localStorage mock fallback.** With the
  same env vars set, ledger data (accounts, transactions, categories, theme,
  advisor chat) is read from and written to a Supabase `khata_kv` table, synced
  across devices and backed up. Without them, data stays in browser localStorage
  only. See "Supabase setup" below for the table + RLS policy to create.
- **AI features (Advisor, live savings-rate fetch, insights) call the Anthropic API
  directly from the browser** using the same request shape the Claude.ai artifact
  used. This works today but **exposes no API key in this code** — see "AI features"
  below for what you need to do to make these work outside Claude.ai.

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
│   ├── App.jsx        # entire app — components, auth, storage, AI calls
│   └── main.jsx        # React root
├── index.html
├── package.json
├── vite.config.js
├── .env.example         # copy to .env once you have Supabase/AdSense credentials
└── README.md
```

Everything currently lives in one file (`App.jsx`, ~1,800 lines) because it was
extracted directly from a single-file Claude artifact. It runs correctly as-is.
Splitting it into multiple files/components is a reasonable next step but not
required to deploy — see "Suggested next steps" if you want Claude Code to do that.

## Supabase setup

Auth (`AUTH_BACKEND` in `src/App.jsx`) and data storage (`ss()`/`sl()`) both
already point at Supabase — you just need a project and a table.

### 1. Create a project and set env vars

Create a project at [supabase.com](https://supabase.com), grab its URL and
anon key from Settings → API, then:

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

With those unset, the app runs standalone against localStorage and a mock
auth layer instead — useful for local exploration without a Supabase project.

### 2. Create the `khata_kv` table

Run this in the Supabase SQL editor:

```sql
create table khata_kv (
  key text primary key,
  value jsonb not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table khata_kv enable row level security;

create policy "Users manage their own kv rows"
  on khata_kv for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

The app namespaces every key with the user's id via `skFor()` already
(`khata:<userId>:<name>:v4`), so a single shared table works fine — RLS via
`user_id` is what actually keeps one user's rows invisible to another. A more
"proper" relational schema (separate `accounts`, `transactions`, `categories`
tables) is a good follow-up but not required to launch.

### 3. Email confirmation

By default Supabase requires email confirmation before a session is issued —
`signUp` will throw "check your email to confirm" until the user clicks the
confirmation link, then `signIn` works normally. Turn this off in
Authentication → Providers → Email if you want instant sign-up during testing.

## AI features (Advisor, live savings rate, Insights analysis)

These call `api/claude.js`, a Vercel serverless function that proxies to the
Google Gemini API server-side — the frontend never sees or ships an API key.
Gemini has a free tier, so this runs at no cost for normal personal-use
volumes. All you need to do is set the key as a server env var:

1. Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   (no credit card required).
2. In your Vercel project → Settings → Environment Variables, add
   `GEMINI_API_KEY` (no `VITE_` prefix — this one must stay server-only, never
   exposed to the browser).
3. Redeploy. The Advisor, live savings-rate lookup, and Insights analysis will
   start working immediately.

Locally, `npm run dev` (plain Vite) doesn't run `api/` serverless functions — use
`vercel dev` instead if you want to test these features on your machine, with
`GEMINI_API_KEY` set in your local `.env`.

Note: the free tier has rate limits (requests per minute/day). If you outgrow
them, Gemini's paid tier is far cheaper than Claude for this workload, or you
can point `api/claude.js` back at the Anthropic API.

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
