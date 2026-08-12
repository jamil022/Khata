// Serverless proxy for AI calls made by the frontend (Advisor, Insights
// analysis, live savings-rate lookup). Backed by the Google Gemini API,
// which has a free tier (no billing required) at normal personal-use
// volumes — see GEMINI_API_KEY in the deployment platform's env vars.
// Get a free key at https://aistudio.google.com/apikey
//
// The frontend still speaks the Anthropic Messages request/response shape
// (it was written against Claude), so this handler translates both ways
// and the UI code needed no changes.

const GEMINI_MODEL = "gemini-2.5-flash";

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: "Server is missing GEMINI_API_KEY." } });
    return;
  }

  const { messages = [], max_tokens, tools } = req.body || {};

  const wantsWebSearch = Array.isArray(tools) && tools.some((t) => t.type === "web_search_20250305");

  const geminiBody = {
    contents: toGeminiContents(messages),
    generationConfig: {
      maxOutputTokens: max_tokens || 1600,
    },
  };
  if (wantsWebSearch) {
    geminiBody.tools = [{ google_search: {} }];
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );

    const upstreamJson = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: { message: upstreamJson?.error?.message || "Gemini API error" },
      });
      return;
    }

    const candidate = upstreamJson?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((p) => p.text || "")
      .filter(Boolean)
      .join("\n");

    // Re-shape into the Anthropic Messages response format the frontend expects.
    res.status(200).json({
      content: [{ type: "text", text }],
      stop_reason: candidate?.finishReason || "end_turn",
    });
  } catch (e) {
    res.status(502).json({ error: { message: "Upstream request failed: " + (e.message || "unknown error") } });
  }
}
