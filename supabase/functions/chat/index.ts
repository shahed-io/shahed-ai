import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Check banned
    const { data: profile } = await supabase.from("profiles").select("banned").eq("id", user.id).single();
    if (profile?.banned) return new Response(JSON.stringify({ error: "আপনার অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে।" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Daily limit check
    const today = new Date().toISOString().split("T")[0];
    const { data: settings } = await supabase.from("settings").select("key, value");
    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((s: { key: string; value: string }) => { settingsMap[s.key] = s.value; });
    
    const freeLimit = parseInt(settingsMap["free_daily_limit"] ?? "20", 10);
    const systemPrompt = settingsMap["system_prompt"] ?? "You are Shahed AI, a helpful Bengali-first AI assistant. You can respond in both Bengali and English.";
    const blockedKeywords = (settingsMap["blocked_keywords"] ?? "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);

    const { data: usageRow } = await supabase.from("usage_daily").select("message_count").eq("user_id", user.id).eq("date", today).single();
    const currentCount = usageRow?.message_count ?? 0;
    
    if (currentCount >= freeLimit) {
      return new Response(JSON.stringify({ error: `দৈনিক সীমা (${freeLimit}) শেষ হয়েছে। আগামীকাল আবার চেষ্টা করুন।` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, conversationId } = await req.json();
    
    // Check for blocked keywords in last user message
    const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
    if (lastUserMsg) {
      const msgLower = lastUserMsg.content.toLowerCase();
      const hasBlocked = blockedKeywords.some((kw: string) => kw && msgLower.includes(kw));
      if (hasBlocked) {
        return new Response(JSON.stringify({ error: "দুঃখিত, এই বিষয়ে আমি সাহায্য করতে পারব না। অনুগ্রহ করে অন্য কোনো বিষয়ে জিজ্ঞেস করুন।" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Update usage counter
    await supabase.from("usage_daily").upsert(
      { user_id: user.id, date: today, message_count: currentCount + 1 },
      { onConflict: "user_id,date" }
    );

    // Call LLM
    const apiKey = Deno.env.get("LLM_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
    const baseUrl = Deno.env.get("LLM_BASE_URL") ?? "https://ai.gateway.lovable.dev/v1";
    const model = Deno.env.get("LLM_MODEL") ?? "google/gemini-3-flash-preview";

    if (!apiKey) {
      await supabase.from("error_logs").insert({ user_id: user.id, error_type: "config_error", message: "LLM_API_KEY not configured" });
      return new Response(JSON.stringify({ error: "API key not configured. দয়া করে সেটআপ গাইড দেখুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.slice(-20), // Keep last 20 messages for context
      ],
      stream: true,
      max_tokens: 2048,
    };

    const llmResp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!llmResp.ok) {
      const errText = await llmResp.text();
      console.error("LLM error:", llmResp.status, errText);
      await supabase.from("error_logs").insert({ user_id: user.id, error_type: "llm_error", message: `HTTP ${llmResp.status}: ${errText.slice(0, 200)}`, context: { status: llmResp.status } });
      
      if (llmResp.status === 429) return new Response(JSON.stringify({ error: "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI সার্ভিস ত্রুটি। একটু পরে চেষ্টা করুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(llmResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });

  } catch (e) {
    console.error("chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      await supabase.from("error_logs").insert({ error_type: "server_error", message: msg });
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: "সার্ভার ত্রুটি: " + msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
