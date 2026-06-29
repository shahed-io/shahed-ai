import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  text: z.string().trim().min(1, "text খালি").max(5000, "text অনেক বড় (সর্বোচ্চ ৫০০০ অক্ষর)"),
  voiceId: z.string().trim().min(1).max(100).optional(),
});

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
  const { text, voiceId } = parsed.data;

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return json({ error: "ভয়েস সার্ভিস কনফিগার করা হয়নি। অ্যাডমিনকে জানান।" }, 503);

  const vid = voiceId || "EXAVITQu4vr4xnSDxMaL";
  const trimmed = text.slice(0, 4500);

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("ElevenLabs error:", r.status, errText.slice(0, 500));
      if (r.status === 401 || r.status === 403) return json({ error: "ভয়েস সার্ভিস অনুমোদন ব্যর্থ। অ্যাডমিনকে জানান।" }, 503);
      if (r.status === 429) return json({ error: "ভয়েস সার্ভিস ব্যস্ত। কিছুক্ষণ পর চেষ্টা করুন।" }, 429);
      if (r.status === 402) return json({ error: "ভয়েস কোটা শেষ। অ্যাডমিনকে জানান।" }, 402);
      return json({ error: "ভয়েস তৈরি করা যাচ্ছে না।" }, 502);
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg" } });
  } catch (e) {
    console.error("TTS unexpected:", e);
    return json({ error: "অপ্রত্যাশিত সার্ভার ত্রুটি।" }, 500);
  }
});
