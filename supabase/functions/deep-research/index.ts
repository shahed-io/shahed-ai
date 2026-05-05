import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Multi-step Deep Research using Gemini Pro reasoning
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query } = await req.json();
    if (!query?.trim()) return new Response(JSON.stringify({ error: "query required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const systemPrompt = `You are Shahed AI Deep Research — a meticulous research analyst.
Workflow:
1. **প্রশ্ন বিশ্লেষণ**: প্রথমে প্রশ্নটি ৩-৫টি sub-question এ ভাঙো
2. **গবেষণা**: প্রতিটি sub-question এ গভীরভাবে তথ্য সংগ্রহ করো
3. **synthesis**: সব তথ্য একসাথে করে একটি comprehensive report তৈরি করো
4. **সূত্র**: শেষে relevant sources সহ একটি "📚 সূত্র" section দাও

Format:
## 🔍 প্রশ্ন বিশ্লেষণ
(sub-questions list)

## 📊 বিস্তারিত গবেষণা
(headings, sub-headings, bullet points সহ)

## ✨ সারাংশ
(key takeaways - bullet points)

## 📚 সূত্র
(numbered list)

Reply in Bengali. Be thorough — minimum 800 শব্দ.`;

    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        stream: true,
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("deep-research error:", resp.status, t);
      return new Response(JSON.stringify({ error: "Deep research failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(resp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
