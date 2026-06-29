import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  query: z.string().trim().min(3, "প্রশ্নটি খুব ছোট").max(2000, "প্রশ্নটি অনেক বড় (সর্বোচ্চ ২০০০ অক্ষর)"),
});

// Multi-step Deep Research using Gemini Pro reasoning
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "ইনপুট ভ্যালিডেশন ব্যর্থ", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { query } = parsed.data;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI সার্ভিস কনফিগার করা হয়নি।" }, 503);

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

  try {
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
      const t = await resp.text().catch(() => "");
      console.error("deep-research gateway error:", resp.status, t.slice(0, 500));
      if (resp.status === 429) return json({ error: "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পর চেষ্টা করুন।" }, 429);
      if (resp.status === 402) return json({ error: "AI কোটা শেষ। অ্যাডমিনকে জানান।" }, 402);
      if (resp.status === 401 || resp.status === 403) return json({ error: "AI সার্ভিস অনুমোদন ত্রুটি।" }, 503);
      return json({ error: "ডিপ রিসার্চ ব্যর্থ। আবার চেষ্টা করুন।" }, 502);
    }
    return new Response(resp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    console.error("deep-research unexpected:", e);
    return json({ error: "অপ্রত্যাশিত সার্ভার ত্রুটি।" }, 500);
  }
});
