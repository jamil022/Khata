// Serverless AI proxy — holds provider API keys server-side, never exposed
// to the browser. Supports two providers, selectable per-request:
//   - "gemini"    Google Gemini (has a genuine free tier — GEMINI_API_KEY)
//   - "anthropic" Claude (paid, better quality — ANTHROPIC_API_KEY)
// The frontend always speaks the Anthropic Messages request/response shape;
// Gemini requests/responses are translated to/from that shape here so the
// rest of the app never branches on provider.
//
// Also enforces the app's manual-billing plan gate and a per-user rate
// limit, using the caller's own Supabase access token (forwarded as a
// Bearer header) so these checks run under real RLS — a request can only
// ever see/act on its own subscription and usage rows.

import { createClient } from "@supabase/supabase-js";

const GEMINI_MODEL = "gemini-2.5-flash";
const ANTHROPIC_MODEL_DEFAULT = "claude-sonnet-4-6";

// Free/trialing users get a modest daily cap; Pro is generous but not
// unlimited (cost + abuse control, per the spec).
const RATE_LIMITS = { free: 15, trialing: 15, pro: 200 };

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));
}

async function callGemini(apiKey, { messages, max_tokens, tools }) {
  const wantsWebSearch = Array.isArray(tools) && tools.some((t) => t.type === "web_search_20250305");
  const body = {
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: max_tokens || 1600 },
  };
  if (wantsWebSearch) body.tools = [{ google_search: {} }];

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const json = await upstream.json();
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, message: json?.error?.message || "Gemini API error" };
  }
  const candidate = json?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || "").filter(Boolean).join("\n");
  return { ok: true, content: [{ type: "text", text }], stop_reason: candidate?.finishReason || "end_turn" };
}

async function callAnthropic(apiKey, { model, messages, max_tokens, tools }) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: model || ANTHROPIC_MODEL_DEFAULT, max_tokens, messages, tools }),
  });
  const json = await upstream.json();
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, message: json?.error?.message || "Anthropic API error" };
  }
  return { ok: true, content: json.content, stop_reason: json.stop_reason };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const { provider = "gemini", model, max_tokens, messages = [], tools } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: { message: "messages is required" } });
    return;
  }

  // ── Plan gate + rate limit (best-effort: only enforced when the request
  // carries a Supabase session and Supabase is configured; the standalone
  // no-backend mode has no accounts to gate) ──────────────────────────────
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (accessToken && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        res.status(401).json({ error: { message: "Invalid session." } });
        return;
      }
      const userId = userData.user.id;

      const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
      const trialActive = sub?.status === "trialing" && sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date();
      const isPro = sub?.status === "active" && sub?.plan !== "free";
      if (sub && !isPro && !trialActive) {
        res.status(402).json({ error: { message: "Your free trial has ended. Upgrade to keep using the AI features — see Setup." } });
        return;
      }

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayAgo);
      const limit = isPro ? RATE_LIMITS.pro : RATE_LIMITS.free;
      if ((count || 0) >= limit) {
        res.status(429).json({ error: { message: `Daily AI usage limit reached (${limit}/day on your plan). Try again tomorrow, or upgrade for a higher limit.` } });
        return;
      }

      await supabase.from("ai_usage").insert({ user_id: userId });
    } catch (e) {
      // Gating is best-effort — if the check itself fails, don't block a
      // paying user's request over an infra hiccup; just skip the gate.
    }
  }

  // ── Call the selected provider ──────────────────────────────────────────
  try {
    let result;
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: { message: "Server is missing ANTHROPIC_API_KEY." } }); return; }
      result = await callAnthropic(apiKey, { model, messages, max_tokens, tools });
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) { res.status(500).json({ error: { message: "Server is missing GEMINI_API_KEY." } }); return; }
      result = await callGemini(apiKey, { messages, max_tokens, tools });
    }

    if (!result.ok) {
      res.status(result.status || 502).json({ error: { message: result.message } });
      return;
    }
    res.status(200).json({ content: result.content, stop_reason: result.stop_reason });
  } catch (e) {
    res.status(502).json({ error: { message: "Upstream request failed: " + (e.message || "unknown error") } });
  }
}
