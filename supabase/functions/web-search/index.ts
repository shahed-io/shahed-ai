import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, messages } = await req.json();

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are Shahed AI — a powerful web-search-enabled AI assistant.
You have access to real-time web information. When answering:
• Provide up-to-date, accurate information from the web
• Always cite the sources you found naturally in your answer
• Format: Use markdown with headings, bullet points, and links where helpful
• Language: Reply in the same language the user writes in (Bengali/English/etc.)
• Start immediately — no preamble like "Sure!" or "Certainly!"
• For Bengali queries: respond in Bengali
• Add a "📚 সূত্র" or "📚 Sources" section at the end with relevant links if available`;

    const userQuery = query || (messages && messages[messages.length - 1]?.content) || "";

    const payload = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        ...(messages || [{ role: "user", content: userQuery }]),
      ],
      stream: true,
      max_tokens: 2048,
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
      console.error("Web search error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ওয়েব সার্চ ব্যর্থ হয়েছে।" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("web-search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
