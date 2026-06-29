import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  prompt: z.string().trim().min(3, "প্রম্পট খুব ছোট").max(1500, "প্রম্পট অনেক বড় (সর্বোচ্চ ১৫০০ অক্ষর)"),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  // Parse + validate body
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "ইনপুট ভ্যালিডেশন ব্যর্থ", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { prompt } = parsed.data;

  // Authenticate
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE env");
    return json({ error: "সার্ভার কনফিগারেশন ত্রুটি।" }, 503);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let user;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
    user = data.user;
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }

  // Insert queue row
  let job;
  try {
    const { data, error } = await supabase
      .from("video_generation_queue")
      .insert({ user_id: user.id, prompt, status: "pending" })
      .select().single();
    if (error || !data) throw error || new Error("Queue insert failed");
    job = data;
  } catch (e) {
    console.error("queue insert error:", e);
    return json({ error: "ভিডিও কিউতে যোগ করা যায়নি।" }, 500);
  }

  // Fire-and-forget background processing
  EdgeRuntime.waitUntil((async () => {
    const markFailed = async (msg: string) => {
      try {
        await supabase.from("video_generation_queue").update({ status: "failed", error_message: msg }).eq("id", job.id);
      } catch (err) { console.error("failed-status update error:", err); }
    };
    try {
      await supabase.from("video_generation_queue").update({ status: "processing" }).eq("id", job.id);
      const apiToken = Deno.env.get("REPLICATE_API_TOKEN");
      if (!apiToken) { await markFailed("REPLICATE_API_TOKEN কনফিগার করা হয়নি"); return; }

      // Use Wan 2.2 fast text-to-video (cheap, ~5s clip)
      const createResp = await fetch("https://api.replicate.com/v1/models/wavespeedai/wan-2.2-t2v-fast/predictions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", Prefer: "wait=60" },
        body: JSON.stringify({ input: { prompt, num_frames: 81, fps: 16 } }),
      });
      const created = await createResp.json().catch(() => ({}));
      if (!createResp.ok) {
        const detail = created?.detail || created?.error || `Replicate error ${createResp.status}`;
        if (createResp.status === 401 || createResp.status === 403) { await markFailed("Replicate অনুমোদন ব্যর্থ — অ্যাডমিনকে জানান"); return; }
        if (createResp.status === 402) { await markFailed("Replicate কোটা শেষ — অ্যাডমিনকে জানান"); return; }
        if (createResp.status === 429) { await markFailed("Replicate ব্যস্ত — পরে চেষ্টা করুন"); return; }
        await markFailed(String(detail).slice(0, 300));
        return;
      }

      let prediction = created;
      let tries = 0;
      while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled" && tries < 60) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pr = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${apiToken}` } });
          prediction = await pr.json();
        } catch (err) {
          console.error("poll error:", err);
        }
        tries++;
      }

      if (prediction.status !== "succeeded") {
        const err = prediction.error || "ভিডিও তৈরি ব্যর্থ";
        await markFailed(String(err).slice(0, 300));
        return;
      }
      const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!videoUrl) { await markFailed("Replicate কোনো video URL ফেরত দেয়নি"); return; }
      await supabase.from("video_generation_queue").update({ status: "completed", video_url: videoUrl }).eq("id", job.id);
    } catch (e) {
      console.error("video bg error:", e);
      await markFailed(e instanceof Error ? e.message : "Unknown");
    }
  })());

  return json({ jobId: job.id, status: "queued" });
});
