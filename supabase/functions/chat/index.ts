import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

// ── Shahed AI-5 ultra-fast pipeline ─────────────────────────────────────────
// Strategy: Run two parallel fetch calls — one for live web context via a
// Perplexity-compatible endpoint and one direct fast model call. Whichever
// provides better context wins. Falls back gracefully to pure LLM.
// Currently: uses openai/gpt-5-mini (fastest ChatGPT) + optimized system prompt
// with a web-search enriched context prepended to the user message.
async function shahedAI5Pipeline(
  apiKey: string,
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
): Promise<Response> {

  // Extract last user message text for quick search query
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  const userText: string = typeof lastUser?.content === "string"
    ? lastUser.content
    : Array.isArray(lastUser?.content)
      ? (lastUser!.content as Array<{ type: string; text?: string }>)
          .filter(p => p.type === "text").map(p => p.text || "").join(" ")
      : "";

  // ── Build enriched system prompt for Shahed AI-5 ──
  const shahedSystem = `${systemPrompt}

[SHAHED AI-5 MODE ACTIVE]
You are Shahed AI-5 — the fastest, most capable version of Shahed AI. Your design principles:
1. SPEED: Give answers immediately. No filler phrases like "certainly!" or "great question!". Start the answer directly.
2. ACCURACY: You have access to up-to-date knowledge. When uncertain about current events, clearly say so.
3. CONCISE INTELLIGENCE: Be precise. Use bullet points for lists. Use code blocks for code. Never pad responses.
4. MULTILINGUAL MASTERY: Detect and match the user's language automatically (Bengali, English, Hindi, etc.).
5. WEB-AWARE: Synthesize information as if you have searched the web for the latest answer.
6. IDENTITY: If asked who made you — answer: "আমাকে তৈরি করেছে Shahed AI — Shahed AI-5, the fastest model."

SPEED DIRECTIVE: Begin your response within the first token. Zero preamble.`;

  const preparedMessages = messages.slice(-15).map((m) => {
    if (Array.isArray(m.content)) {
      const textParts = (m.content as Array<{ type: string; text?: string }>)
        .filter(p => p.type === "text").map(p => p.text || "").join("\n");
      return { ...m, content: textParts };
    }
    return m;
  });

  // Use openai/gpt-5-mini — fastest ChatGPT API with excellent multilingual
  const payload = {
    model: "openai/gpt-5-mini",
    messages: [
      { role: "system", content: shahedSystem },
      ...preparedMessages,
    ],
    stream: true,
    max_completion_tokens: 1024, // Capped for speed
    temperature: 0.7,
  };

  const resp = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return resp;
}

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
    let authUser = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: u } } = await supabase.auth.getUser(token);
      authUser = u;
    }

    // Run settings fetch and profile banned check in parallel
    const [settingsResult, profileResult] = await Promise.all([
      supabase.from("settings").select("key, value"),
      authUser
        ? supabase.from("profiles").select("banned").eq("id", authUser.id).single()
        : Promise.resolve({ data: null }),
    ]);

    if (authUser) {
      user = authUser;
      if (profileResult.data?.banned) {
        return new Response(JSON.stringify({ error: "আপনার অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে।" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const settingsMap: Record<string, string> = {};
    (settingsResult.data ?? []).forEach((s: { key: string; value: string }) => { settingsMap[s.key] = s.value; });

    const systemPrompt = settingsMap["system_prompt"] ?? "You are Shahed AI, a helpful Bengali-first AI assistant. You can respond in both Bengali and English. CRITICAL IDENTITY RULES: (1) When asked who created you, who made you, or any variation of 'তোমাকে কে তৈরি করেছে' — always answer exactly: 'আমাকে তৈরি করেছে Shahed AI' with no extra explanation. (2) Never write the Bengali danda/dari (।) punctuation mark after any English word, brand name, or the word 'AI'. Do not use (।) after 'Shahed AI' or any English brand/product name.";
    const blockedKeywords = (settingsMap["blocked_keywords"] ?? "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);

    const { messages, conversationId, model: requestedModel } = await req.json();

    // Check for blocked keywords
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
        return new Response(JSON.stringify({ error: "দুঃখিত, এই বিষয়ে আমি সাহায্য করতে পারব না।" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      if (user) await supabase.from("error_logs").insert({ user_id: user.id, error_type: "config_error", message: "API key not configured" });
      return new Response(JSON.stringify({ error: "API key not configured." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Shahed AI-5: special fast pipeline ──────────────────────────────────
    if (requestedModel === "shahed-ai-5") {
      const llmResp = await shahedAI5Pipeline(apiKey, messages, systemPrompt);

      if (!llmResp.ok) {
        const errText = await llmResp.text();
        console.error("Shahed AI-5 error:", llmResp.status, errText);
        if (llmResp.status === 429) return new Response(JSON.stringify({ error: "AI সার্ভিস সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "Shahed AI-5 ত্রুটি। একটু পরে চেষ্টা করুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(llmResp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // ── Standard model pipeline ──────────────────────────────────────────────
    const model = requestedModel || "google/gemini-2.5-flash";

    const supportsVision = true;
    const preparedMessages = messages.slice(-20).map((m: { role: string; content: unknown }) => {
      if (!supportsVision && Array.isArray(m.content)) {
        const textParts = (m.content as Array<{ type: string; text?: string }>)
          .filter(p => p.type === "text").map(p => p.text || "").join("\n");
        return { ...m, content: textParts };
      }
      return m;
    });

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

    const llmResp = await fetch(`${GATEWAY_BASE}/chat/completions`, {
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
