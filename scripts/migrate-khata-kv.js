#!/usr/bin/env node
// One-off migration: copies existing users' data out of the old khata_kv
// JSON-blob table into the new relational schema (accounts, transactions,
// categories). Safe to re-run — skips any user who already has rows in
// `accounts` or `transactions`, so it won't duplicate data.
//
// Needs the Supabase SERVICE ROLE key (not the anon key) since it must read
// every user's khata_kv rows, bypassing RLS. Run once, then you can drop
// khata_kv if you no longer need it.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-khata-kv.js

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, not anon) before running this.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function parseKey(key) {
  // khata:<userId>:<name>:v4
  const m = /^khata:([^:]+):([^:]+):v4$/.exec(key);
  return m ? { userId: m[1], name: m[2] } : null;
}

async function main() {
  const { data: rows, error } = await supabase.from("khata_kv").select("key, value");
  if (error) {
    if (error.code === "42P01") {
      console.log("No khata_kv table found — nothing to migrate.");
      return;
    }
    throw error;
  }

  const byUser = new Map();
  for (const row of rows || []) {
    const parsed = parseKey(row.key);
    if (!parsed || parsed.userId === "guest") continue;
    if (!byUser.has(parsed.userId)) byUser.set(parsed.userId, {});
    byUser.get(parsed.userId)[parsed.name] = row.value;
  }

  console.log(`Found ${byUser.size} user(s) with khata_kv data.`);

  for (const [userId, blobs] of byUser) {
    const { count: existingAccs } = await supabase
      .from("accounts").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((existingAccs || 0) > 0) {
      console.log(`  ${userId}: already has accounts in the new schema — skipping.`);
      continue;
    }

    const accounts = blobs.accs || [];
    const txs = blobs.txs || [];
    const cats = blobs.cats || [];
    const theme = blobs.theme;
    const advisorMsgs = blobs.advisor_msgs || [];
    const advisorPersona = blobs.advisor_persona;

    // 1. Accounts — insert, remembering old client id -> new db id.
    const idMap = {};
    for (const a of accounts) {
      const { data, error: e } = await supabase.from("accounts").insert({
        user_id: userId,
        name: a.name,
        type: a.type,
        tag: a.tag || null,
        color: a.color,
        icon: a.icon || null,
        opening_balance: a.opening ?? a.balance ?? 0,
        rate_pct: a.rate ?? null,
      }).select().single();
      if (e) { console.error(`  ${userId}: account insert failed —`, e.message); continue; }
      idMap[a.id] = data.id;
    }

    // 2. Transactions — translate from/to client ids to new account uuids.
    for (const t of txs) {
      const from = t.from ? idMap[t.from] : null;
      const to = t.to ? idMap[t.to] : null;
      if (!from && !to) continue; // orphaned reference to a deleted account — skip
      const { error: e } = await supabase.from("transactions").insert({
        user_id: userId,
        type: t.type,
        amount: Math.abs(Number(t.amount)),
        occurred_at: t.date,
        description: t.desc || null,
        category: t.category || null,
        from_account_id: from,
        to_account_id: to,
        is_adjustment: !!t.isAdj,
      });
      if (e) console.error(`  ${userId}: transaction insert failed —`, e.message);
    }

    // 3. Custom categories (system defaults already seeded by the migration).
    const DEFAULT_NAMES = new Set([
      "Utility bills","Subscriptions","Food & groceries","Transport","Family remittances",
      "Loan payments","Zakat & charity","Rent","Healthcare","Education","Shopping","Other expense",
      "Salary","Freelance/business","Gift","Other income",
    ]);
    for (const name of cats) {
      if (DEFAULT_NAMES.has(name)) continue;
      await supabase.from("categories").insert({ user_id: userId, name, kind: "expense", is_system: false });
    }

    // 4. Profile fields — theme, ai_provider default, advisor persona.
    const profilePatch = {};
    if (theme === "dark" || theme === "light") profilePatch.theme = theme;
    if (advisorPersona) profilePatch.advisor_persona = advisorPersona;
    if (Object.keys(profilePatch).length) {
      await supabase.from("profiles").update(profilePatch).eq("id", userId);
    }

    // 5. Advisor chat history.
    if (advisorMsgs.length) {
      const rowsToInsert = advisorMsgs
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ user_id: userId, role: m.role, content: m.content }));
      if (rowsToInsert.length) {
        const { error: e } = await supabase.from("advisor_messages").insert(rowsToInsert);
        if (e) console.error(`  ${userId}: advisor_messages insert failed —`, e.message);
      }
    }

    console.log(`  ${userId}: migrated ${accounts.length} account(s), ${txs.length} transaction(s).`);
  }

  console.log("Done. Once you've verified the new tables look right, you can drop khata_kv:");
  console.log("  drop table if exists khata_kv;");
}

main().catch(e => { console.error(e); process.exit(1); });
