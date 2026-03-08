import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const jobId = body?.jobId;

    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase
      .from("image_generation_queue")
      .update({ status: "processing" })
      .eq("id", jobId)
      .eq("status", "pending");

    // Fetch the job
    const { data: job, error: fetchErr } = await supabase
      .from("image_generation_queue")
      .select("*")
      .eq("id", jobId)
      .single();

    if (fetchErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

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
            role: "system",
            content: "You are a creative AI artist. Generate stunning, high-quality, detailed images based on the user's description.",
          },
          { role: "user", content: job.prompt },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Image gen error:", response.status, errText);
      const errMsg = response.status === 429
        ? "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।"
        : "ছবি তৈরি করতে ব্যর্থ হয়েছে।";

      await supabase
        .from("image_generation_queue")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", jobId);

      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      await supabase
        .from("image_generation_queue")
        .update({ status: "failed", error_message: "ছবি তৈরি হয়নি। অন্য প্রম্পট দিয়ে চেষ্টা করুন।" })
        .eq("id", jobId);

      return new Response(JSON.stringify({ error: "No image returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update job as completed
    await supabase
      .from("image_generation_queue")
      .update({ status: "completed", image_url: imageUrl })
      .eq("id", jobId);

    return new Response(JSON.stringify({ success: true, imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-image-queue error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
