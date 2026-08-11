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
- **Auth: UI complete, backend is a mock.** Sign-up/login/logout screens exist and
  work, but accounts and password hashes are currently stored in the browser
  (localStorage) with a placeholder, non-cryptographic hash — **not real security**.
  See "Wiring a real backend" below before you let real users sign up.
- **Storage: works, but is per-browser until a backend is wired.** Every user's
  ledger data is saved locally (browser localStorage) today. It survives refreshes
  and closing the tab, but does not sync across devices and is not backed up
  anywhere until you connect Supabase (or another backend).
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

## Wiring a real backend (Supabase — recommended)

The whole app is already structured for this. Two things need real backends:
**auth** and **data storage**. Both funnel through small, named integration points.

### 1. Auth

Open `src/App.jsx` and find `AUTH_BACKEND` (search for `AUTH_BACKEND = {`). It has
exactly three functions: `signUp`, `signIn`, `signOut`, plus `currentSession`.
Replace their bodies with real Supabase Auth calls:

```bash
npm install @supabase/supabase-js
```

```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AUTH_BACKEND = {
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return { id: data.user.id, email: data.user.email };
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { id: data.user.id, email: data.user.email };
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async currentSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return { id: data.session.user.id, email: data.session.user.email };
  },
};
```

Everything downstream — `Workspace`, `Advisor`, per-user storage namespacing via
`skFor(userId, ...)` — already expects `userId`/`userEmail` as plain values and
doesn't care where they came from. No other changes needed for auth to go live.

### 2. Data storage (accounts, transactions, categories, theme, advisor chat)

Right now `ss()`/`sl()` (search for `async function ss(`) read and write
`localStorage`. Replace their bodies with Supabase table reads/writes, e.g.:

```js
async function ss(k, v) {
  await supabase.from('khata_kv').upsert({ key: k, value: v });
}
async function sl(k) {
  const { data } = await supabase.from('khata_kv').select('value').eq('key', k).single();
  return data?.value ?? null;
}
```

A simple `khata_kv (key text primary key, value jsonb)` table with row-level
security scoped to `auth.uid()` is enough — the app already namespaces every key
with the user's id via `skFor()`, so a single shared table works fine. A more
"proper" relational schema (separate `accounts`, `transactions`, `categories`
tables) is a good follow-up but not required to launch.

## AI features (Advisor, live savings rate, Insights analysis)

These call `https://api.anthropic.com/v1/messages` directly from the browser using
`fetch`. **That only worked inside the Claude.ai artifact sandbox**, which injects
its own authenticated proxy — it will not work as-is once deployed, because there is
no API key in this code (correctly — never put one in frontend code, it would be
public).

To make these features work in production, add a small backend endpoint (a single
serverless function is enough) that:
1. Receives the prompt from the frontend,
2. Calls the real Anthropic API server-side using an API key stored as a server
   secret (get one at console.anthropic.com),
3. Returns the response to the frontend.

Then update the three `fetch("https://api.anthropic.com/v1/messages", ...)` calls
in `App.jsx` (search for `callClaude` and `fetchLive`) to call your own endpoint
instead. Everything else — prompts, JSON parsing, retry logic — stays the same.

This is the single biggest piece of real backend work left. Everything else
(auth, storage) is a fairly mechanical swap; this needs an actual server function.

## Google AdSense

Ad slots are already placed (Home, Ledger, Insights — top and bottom of each).
They render as labeled placeholders until you set a client ID. Search for
`ADSENSE_CLIENT` in `App.jsx`, set it to your publisher id (`ca-pub-...`), give each
`<AdSlot>` a real slot id from your AdSense dashboard, and add the AdSense loader
script tag to `index.html`. Details are in the comment block above `AdSlot` in the
source.

## Suggested next steps, roughly in order

1. Push this to GitHub (see below).
2. Set up a Supabase project — get URL + anon key, wire `AUTH_BACKEND` and `ss`/`sl`
   as above.
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
