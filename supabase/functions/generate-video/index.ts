import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt } = await req.json();
    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser(token ?? "");
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: job, error } = await supabase
      .from("video_generation_queue")
      .insert({ user_id: user.id, prompt, status: "pending" })
      .select().single();
    if (error) throw error;

    // Fire-and-forget background processing
    EdgeRuntime.waitUntil((async () => {
      try {
        await supabase.from("video_generation_queue").update({ status: "processing" }).eq("id", job.id);
        const apiToken = Deno.env.get("REPLICATE_API_TOKEN");
        if (!apiToken) throw new Error("REPLICATE_API_TOKEN not configured");

        // Use Wan 2.2 fast text-to-video (cheap, ~5s clip)
        const createResp = await fetch("https://api.replicate.com/v1/models/wavespeedai/wan-2.2-t2v-fast/predictions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", Prefer: "wait=60" },
          body: JSON.stringify({ input: { prompt, num_frames: 81, fps: 16 } }),
        });
        const created = await createResp.json();
        if (!createResp.ok) throw new Error(created?.detail || "Replicate error");

        let prediction = created;
        let tries = 0;
        while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled" && tries < 60) {
          await new Promise(r => setTimeout(r, 3000));
          const pr = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${apiToken}` } });
          prediction = await pr.json();
          tries++;
        }

        if (prediction.status !== "succeeded") {
          const err = prediction.error || "ভিডিও তৈরি ব্যর্থ";
          await supabase.from("video_generation_queue").update({ status: "failed", error_message: String(err) }).eq("id", job.id);
          return;
        }
        const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        await supabase.from("video_generation_queue").update({ status: "completed", video_url: videoUrl }).eq("id", job.id);
      } catch (e) {
        console.error("video bg error:", e);
        await supabase.from("video_generation_queue").update({ status: "failed", error_message: e instanceof Error ? e.message : "Unknown" }).eq("id", job.id);
      }
    })());

    return new Response(JSON.stringify({ jobId: job.id, status: "queued" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-video error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
