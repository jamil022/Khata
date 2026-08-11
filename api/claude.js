// Serverless proxy for Anthropic API calls made by the frontend (Advisor,
// Insights analysis, live savings-rate lookup). Keeps the API key server-side
// only — see ANTHROPIC_API_KEY in the deployment platform's env vars.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: "Server is missing ANTHROPIC_API_KEY." } });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (e) {
    res.status(502).json({ error: { message: "Upstream request failed: " + (e.message || "unknown error") } });
  }
}
