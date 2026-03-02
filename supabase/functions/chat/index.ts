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

    const { data: settings } = await supabase.from("settings").select("key, value");
    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((s: { key: string; value: string }) => { settingsMap[s.key] = s.value; });
    
    const systemPrompt = settingsMap["system_prompt"] ?? "You are Shahed AI, a helpful Bengali-first AI assistant. You can respond in both Bengali and English.";
    const blockedKeywords = (settingsMap["blocked_keywords"] ?? "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);

    const { messages, conversationId } = await req.json();
    
    // Check for blocked keywords in last user message (handle both string and array content)
    const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
    if (lastUserMsg && blockedKeywords.length > 0) {
      const textContent = typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg.content)
          ? lastUserMsg.content.filter((p: { type: string }) => p.type === "text").map((p: { text: string }) => p.text).join(" ")
          : "";
      const msgLower = textContent.toLowerCase();
      const hasBlocked = blockedKeywords.some((kw: string) => kw && msgLower.includes(kw));
      if (hasBlocked) {
        return new Response(JSON.stringify({ error: "দুঃখিত, এই বিষয়ে আমি সাহায্য করতে পারব না। অনুগ্রহ করে অন্য কোনো বিষয়ে জিজ্ঞেস করুন।" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Call LLM — settings থেকে provider পড়ো, না থাকলে LLM_API_KEY দিয়ে DeepSeek, একদম fallback Lovable AI
    const envLlmKey = Deno.env.get("LLM_API_KEY");
    const settingsApiKey = settingsMap["llm_api_key"];
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    let provider = settingsMap["llm_provider"] || "";
    let baseUrl = settingsMap["llm_base_url"] || Deno.env.get("LLM_BASE_URL") || "";
    let model = settingsMap["llm_model"] || Deno.env.get("LLM_MODEL") || "";
    let apiKey: string | undefined;

    if (settingsApiKey && provider) {
      // Admin panel থেকে configured custom provider
      apiKey = settingsApiKey;
      if (!baseUrl) {
        if (provider === "gemini") baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
        else if (provider === "deepseek") baseUrl = "https://api.deepseek.com/v1";
        else if (provider === "anthropic") baseUrl = "https://api.anthropic.com/v1";
        else baseUrl = "https://api.openai.com/v1";
      }
      if (!model) {
        if (provider === "gemini") model = "gemini-2.0-flash";
        else if (provider === "deepseek") model = "deepseek-chat";
        else model = "gpt-4o";
      }
    } else if (envLlmKey) {
      // Env-তে LLM_API_KEY আছে → DeepSeek (sk- prefix না থাকলে OpenAI fallback)
      apiKey = envLlmKey;
      provider = "deepseek";
      baseUrl = baseUrl || "https://api.deepseek.com/v1";
      model = model || "deepseek-chat";
    } else {
      // সবশেষ fallback: Lovable AI Gateway
      apiKey = lovableApiKey;
      baseUrl = "https://ai.gateway.lovable.dev/v1";
      model = model || "google/gemini-2.5-flash";
    }

    if (!apiKey) {
      await supabase.from("error_logs").insert({ user_id: user.id, error_type: "config_error", message: "API key not configured" });
      return new Response(JSON.stringify({ error: "API key not configured. দয়া করে সেটআপ গাইড দেখুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // DeepSeek doesn't support image_url content type — strip images for non-vision providers
    const supportsVision = provider === "openai" || provider === "gemini" || baseUrl?.includes("lovable.dev") || baseUrl?.includes("openai.com") || baseUrl?.includes("googleapis.com");
    const preparedMessages = messages.slice(-20).map((m: { role: string; content: unknown }) => {
      if (!supportsVision && Array.isArray(m.content)) {
        // Keep only text parts
        const textParts = (m.content as Array<{ type: string; text?: string }>)
          .filter(p => p.type === "text")
          .map(p => p.text || "")
          .join("\n");
        return { ...m, content: textParts };
      }
      return m;
    });

    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...preparedMessages,
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
