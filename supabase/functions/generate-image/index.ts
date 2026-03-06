import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt } = await req.json();

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Image gen error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ছবি তৈরি করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const text = data.choices?.[0]?.message?.content ?? "";

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "ছবি তৈরি হয়নি। অন্য প্রম্পট দিয়ে চেষ্টা করুন।" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageUrl, text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
