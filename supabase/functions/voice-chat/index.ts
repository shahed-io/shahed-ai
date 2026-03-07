import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `তুমি Shahed AI — একজন বাংলা ভয়েস সহকারী।

গুরুত্বপূর্ণ নিয়ম:
১. সবসময় শুধুমাত্র বাংলায় উত্তর দাও — অন্য কোনো ভাষা ব্যবহার করবে না।
২. উত্তর ছোট রাখো (২-৪ বাক্য) — এটি মুখে বলা হবে।
৩. কোনো markdown ব্যবহার করবে না — ** # বুলেট পয়েন্ট কিছু না।
৪. স্বাভাবিক কথোপকথনের ভাষায় কথা বলো।
৫. যদি জিজ্ঞেস করা হয় তুমি কে → "আমি Shahed AI, আপনার বাংলা AI সহকারী।"
৬. ব্যবহারকারী ইংরেজিতে বললেও বাংলায় উত্তর দাও।`;

    const payload = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...(messages || []).slice(-8),
      ],
      stream: true,
      max_completion_tokens: 200,
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "অজানা ত্রুটি" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
