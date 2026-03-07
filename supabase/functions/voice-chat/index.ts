import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, lang } = await req.json();

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect language from lang code
    const isBengali = lang?.startsWith("bn");
    const isHindi = lang?.startsWith("hi");

    const systemPrompt = `You are Shahed AI — a voice assistant. You are currently in a VOICE CONVERSATION.

CRITICAL VOICE RULES:
1. Keep replies SHORT (2-4 sentences max) — this is spoken aloud, not text.
2. NO markdown — no **, no #, no bullet points, no code blocks.
3. NO long lists — speak naturally as if talking to a person.
4. Reply in the EXACT language the user spoke in.
${isBengali ? "5. User is speaking in Bengali — reply in natural conversational Bengali (বাংলায় সংক্ষিপ্ত উত্তর দাও)." : ""}
${isHindi ? "5. User is speaking in Hindi — reply in natural conversational Hindi." : ""}
5. Be warm, conversational, and direct.
6. If asked who you are → "আমি Shahed AI, আপনার AI সহকারী।" (in Bengali) or "I am Shahed AI, your AI assistant." (in English)`;

    // Use GPT-5 Mini — fast, conversational, excellent for voice
    const payload = {
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...(messages || []).slice(-8),
      ],
      stream: true,
      max_completion_tokens: 256, // Short responses for voice
    };

    const response = await fetch(`${GATEWAY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Voice chat error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI ক্রেডিট শেষ। Workspace-এ ক্রেডিট যোগ করুন।" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ভয়েস AI ত্রুটি। একটু পরে চেষ্টা করুন।" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("voice-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
