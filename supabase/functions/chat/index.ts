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
    // Auth check — allow guest access
    const authHeader = req.headers.get("Authorization");
    let user: { id: string } | null = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (authUser) {
        user = authUser;
        // Check banned for authenticated users
        const { data: profile } = await supabase.from("profiles").select("banned").eq("id", authUser.id).single();
        if (profile?.banned) return new Response(JSON.stringify({ error: "আপনার অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে।" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: settings } = await supabase.from("settings").select("key, value");
    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((s: { key: string; value: string }) => { settingsMap[s.key] = s.value; });
    
    const systemPrompt = settingsMap["system_prompt"] ?? "You are Shahed AI, a helpful Bengali-first AI assistant. You can respond in both Bengali and English.";
    const blockedKeywords = (settingsMap["blocked_keywords"] ?? "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);

    const { messages, conversationId, model: requestedModel } = await req.json();
    
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

    // Always use Lovable AI Gateway (supports Gemini + ChatGPT models)
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const baseUrl = "https://ai.gateway.lovable.dev/v1";
    const model = requestedModel || "google/gemini-2.5-flash";

    if (!apiKey) {
      if (user) await supabase.from("error_logs").insert({ user_id: user.id, error_type: "config_error", message: "API key not configured" });
      return new Response(JSON.stringify({ error: "API key not configured. দয়া করে সেটআপ গাইড দেখুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Gemini & GPT both support vision via Lovable AI Gateway
    const supportsVision = true;
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

    // openai/gpt-5 and newer OpenAI models use max_completion_tokens instead of max_tokens
    const isNewOpenAI = model.startsWith("openai/gpt-5") || model.startsWith("openai/o");
    const tokenLimit = isNewOpenAI ? { max_completion_tokens: 2048 } : { max_tokens: 2048 };

    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...preparedMessages,
      ],
      stream: true,
      ...tokenLimit,
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
      if (user) await supabase.from("error_logs").insert({ user_id: user.id, error_type: "llm_error", message: `HTTP ${llmResp.status}: ${errText.slice(0, 200)}`, context: { status: llmResp.status } });
      
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
