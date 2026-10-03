// =====================================================================
// Omni — "Ask Omni" server function (Supabase Edge Function, Deno)
//
// The AI key lives HERE, as a secret on the server, never in the app:
//   supabase secrets set OPENAI_API_KEY=sk-...        (required)
//   supabase secrets set AI_MODEL=gpt-4o-mini          (optional)
//   supabase secrets set ALLOWED_ORIGIN=https://your-site.example (optional, recommended)
// Deploy:  supabase functions deploy ask-omni
// Then put https://<project>.supabase.co/functions/v1/ask-omni in config.js → AI_ENDPOINT.
//
// Only SIGNED-IN Omni users can use it: assistant.js sends the user's sign-in
// token and step 0 below checks it with Supabase Auth (so strangers can't
// spend your AI credit). SUPABASE_URL and SUPABASE_ANON_KEY are provided to
// Edge Functions automatically.
// It works with any OpenAI-compatible chat API: set AI_API_URL to change it.
// =====================================================================

const SYSTEM_PROMPT = `You are "Ask Omni", a friendly helper inside Omni, a chat app used by kids, teens, parents and teachers.
Rules you always follow:
- Assume you may be talking to a child aged 8-17. Be kind, encouraging, clear and age-appropriate.
- Help with homework by explaining and giving hints and steps, not just final answers. Help with coding (HTML, CSS, JavaScript) with short examples.
- Never ask for, store or repeat personal information (full name, address, school, phone, passwords, photos, location). If the user shares some, gently remind them not to share personal info online.
- Refuse anything violent, sexual, hateful, dangerous, illegal, or about self-harm, drugs, alcohol, gambling or weapons. Offer a safe alternative topic instead.
- If someone seems upset, unsafe, bullied or in danger, encourage them to talk to a parent, teacher or trusted adult, and mention that in an emergency they should contact local emergency services.
- Don't pretend to be a human. Don't claim to be a parent, teacher or friend. Never arrange to meet anyone.
- No links to websites except well-known educational ones (e.g. Wikipedia, MDN, Khan Academy).
- Keep answers short (under 200 words) unless asked for more. Use simple language.`;

// Worrying topics get a caring, human answer straight away (no AI involved)
const NEEDS_A_HUMAN = /\b(suicid\w*|kill (my ?self|me)|self[- ]?harm\w*|hurt(ing)? my ?self|want to die|being abused|someone is hurting me)\b/i;
const HUMAN_REPLY = "I'm really glad you told me. This is something to talk about with a real person who can help: a parent, teacher, school counsellor or another adult you trust. If you're in danger right now, contact your local emergency number. You're not alone.";

const MAX_MESSAGES = 10;
const MAX_CHARS = 600;

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

Deno.serve(async (req: Request) => {
  const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers });

  // 0. Who is asking? Must be a signed-in Omni user.
  const userCheck = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: req.headers.get("Authorization") ?? "", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  }).catch(() => null);
  if (!userCheck?.ok) return new Response(JSON.stringify({ error: "Please sign in to Omni online to use Ask Omni." }), { status: 401, headers });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "Ask Omni isn't set up yet (missing server secret)." }), { status: 500, headers });

  // 1. Read and tidy the conversation (only user/assistant text, short, last few turns)
  let body: { messages?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers }); }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "Ask a question first" }), { status: 400, headers });
  }

  if (NEEDS_A_HUMAN.test(messages[messages.length - 1].content)) return new Response(JSON.stringify({ reply: HUMAN_REPLY }), { headers });

  const apiUrl = Deno.env.get("AI_API_URL") ?? "https://api.openai.com/v1";
  const auth = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  // 2. Safety check the question with the moderation API (OpenAI only; skipped for other providers)
  if (apiUrl.includes("api.openai.com")) {
    try {
      const mod = await fetch(`${apiUrl}/moderations`, { method: "POST", headers: auth, body: JSON.stringify({ model: "omni-moderation-latest", input: messages[messages.length - 1].content }) });
      const result = await mod.json();
      if (result?.results?.[0]?.flagged) {
        return new Response(JSON.stringify({ reply: "I can't help with that one. If something is worrying you, please talk to a parent, teacher or another adult you trust." }), { headers });
      }
    } catch { /* if moderation is down, the system prompt still applies */ }
  }

  // 3. Ask the AI
  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      model: Deno.env.get("AI_MODEL") ?? "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 400,
      temperature: 0.5,
    }),
  });
  if (!res.ok) return new Response(JSON.stringify({ error: `The AI service said ${res.status}` }), { status: 502, headers });
  const data = await res.json();
  const reply = String(data?.choices?.[0]?.message?.content ?? "").trim() || "Sorry, I don't have an answer for that.";
  return new Response(JSON.stringify({ reply }), { headers });
});
