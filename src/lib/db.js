// Relational data access layer — replaces the prototype's single khata_kv
// JSON-blob table with real per-row reads/writes against Postgres tables
// protected by RLS (see supabase/migrations/0001_init.sql). Row shapes are
// translated to/from the in-memory shape App.jsx's reducer already expects
// (tx.from/tx.to as account ids, category as a plain name, etc.) so the UI
// and reducer logic didn't need to change.

function txFromRow(r) {
  return {
    id: r.id,
    date: r.occurred_at,
    desc: r.description || "",
    amount: Number(r.amount),
    type: r.type,
    category: r.category || "Miscellaneous",
    from: r.from_account_id,
    to: r.to_account_id,
    isAdj: r.is_adjustment,
  };
}
function txToRow(userId, t) {
  return {
    id: t.dbId,             // undefined on insert — Postgres generates one
    user_id: userId,
    type: t.type,
    amount: Math.abs(Number(t.amount)),
    occurred_at: t.date,
    description: t.desc || null,
    category: t.category || null,
    from_account_id: t.from || null,
    to_account_id: t.to || null,
    is_adjustment: !!t.isAdj,
  };
}
function accFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    balance: Number(r.opening_balance), // recalc() folds transactions on top
    opening: Number(r.opening_balance),
    color: r.color,
    icon: r.icon,
    type: r.type,
    tag: r.tag,
    rate: r.rate_pct !== null ? Number(r.rate_pct) : undefined,
  };
}
function accToRow(userId, a) {
  return {
    id: a.dbId,
    user_id: userId,
    name: a.name,
    type: a.type,
    tag: a.tag || null,
    color: a.color,
    icon: a.icon || null,
    opening_balance: a.opening ?? a.balance ?? 0,
    rate_pct: a.rate ?? null,
  };
}

// Every account/transaction the UI creates gets both a fast client-side id
// (used everywhere in the reducer/render code, unchanged) and a `dbId` once
// the insert round-trips — see attachDbId below.

export async function loadLedger(supabase, userId) {
  const [accRes, txRes, profRes, subRes] = await Promise.all([
    supabase.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at"),
    supabase.from("transactions").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(5000),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (accRes.error) throw accRes.error;
  if (txRes.error) throw txRes.error;

  const accounts = (accRes.data || []).map((r) => ({ ...accFromRow(r), dbId: r.id }));
  const txs = (txRes.data || []).map((r) => ({ ...txFromRow(r), dbId: r.id }));

  return {
    accounts,
    txs,
    profile: profRes.data || null,
    subscription: subRes.data || null,
  };
}

export async function insertAccount(supabase, userId, acc) {
  const { data, error } = await supabase.from("accounts").insert(accToRow(userId, acc)).select().single();
  if (error) throw error;
  return { ...accFromRow(data), dbId: data.id };
}

export async function deleteAccount(supabase, dbId) {
  const { error } = await supabase.from("accounts").delete().eq("id", dbId);
  if (error) throw error;
}

export async function insertTransaction(supabase, userId, tx) {
  const { data, error } = await supabase.from("transactions").insert(txToRow(userId, tx)).select().single();
  if (error) throw error;
  return { ...txFromRow(data), dbId: data.id };
}

export async function updateTransaction(supabase, userId, tx) {
  const { error } = await supabase.from("transactions").update(txToRow(userId, tx)).eq("id", tx.dbId);
  if (error) throw error;
}

export async function deleteTransaction(supabase, dbId) {
  const { error } = await supabase.from("transactions").delete().eq("id", dbId);
  if (error) throw error;
}

export async function setAccountOpeningBalance(supabase, dbId, opening) {
  const { error } = await supabase.from("accounts").update({ opening_balance: opening }).eq("id", dbId);
  if (error) throw error;
}

export async function loadCategories(supabase, userId) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .or(`is_system.eq.true,user_id.eq.${userId}`)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function insertCategory(supabase, userId, { name, kind, icon }) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name, kind, icon: icon || null, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(supabase, userId, name) {
  const { error } = await supabase.from("categories").delete().eq("user_id", userId).eq("name", name).eq("is_system", false);
  if (error) throw error;
}

export async function saveProfile(supabase, userId, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function loadAdvisorMessages(supabase, userId) {
  const { data, error } = await supabase
    .from("advisor_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at")
    .limit(200);
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, role: r.role, content: r.content }));
}

export async function insertAdvisorMessage(supabase, userId, role, content) {
  const { error } = await supabase.from("advisor_messages").insert({ user_id: userId, role, content });
  if (error) throw error;
}

export async function clearAdvisorMessages(supabase, userId) {
  const { error } = await supabase.from("advisor_messages").delete().eq("user_id", userId);
  if (error) throw error;
}
