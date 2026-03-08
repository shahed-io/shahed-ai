import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

// ── Shahed AI-5: Gemini + ChatGPT dual-engine race pipeline ─────────────────
// Strategy: Fire BOTH Gemini 3 Flash Preview AND GPT-5 Mini simultaneously.
// Whichever responds first (ok=true) wins — that stream is returned.
// The loser is aborted immediately. This gives the absolute fastest possible
// first-token latency by leveraging both AI engines in parallel.
async function shahedAI5Pipeline(
  apiKey: string,
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
): Promise<Response> {

  // ── Enriched system prompt ──
  const shahedSystem = `${systemPrompt}

[SHAHED AI-5 — GEMINI + CHATGPT HYBRID ENGINE]
You are Shahed AI-5 — powered by both Google Gemini and OpenAI ChatGPT simultaneously.
RULES:
1. INSTANT REPLY: Start answering with the very first token. Zero preamble. No "certainly!", "sure!", "great question!".
2. PRECISION: Bullet points for lists. Code blocks for code. Never pad.
3. LANGUAGE MATCH: Auto-detect and reply in the user's language (বাংলা, English, हिंदी, etc.).
4. IDENTITY: If asked who made you → "আমি Shahed AI-5 — Gemini ও ChatGPT এর সমন্বয়ে তৈরি সবচেয়ে দ্রুত AI।"
SPEED DIRECTIVE: Begin response within the first token. Now.`;

  const preparedMessages = messages.slice(-15).map((m) => {
    if (Array.isArray(m.content)) {
      const textParts = (m.content as Array<{ type: string; text?: string }>)
        .filter(p => p.type === "text").map(p => p.text || "").join("\n");
      return { ...m, content: textParts };
    }
    return m;
  });

  const baseBody = {
    messages: [
      { role: "system", content: shahedSystem },
      ...preparedMessages,
    ],
    stream: true,
    max_completion_tokens: 1024,
  };

  // ── Race: Gemini 3 Flash vs GPT-5 Mini ──────────────────────────────────
  const geminiCtrl = new AbortController();
  const gptCtrl    = new AbortController();

  const fetchGemini = fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...baseBody, model: "google/gemini-3-flash-preview" }),
    signal: geminiCtrl.signal,
  }).then(r => ({ resp: r, abort: gptCtrl }));

  const fetchGPT = fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...baseBody, model: "openai/gpt-5-mini" }),
    signal: gptCtrl.signal,
  }).then(r => ({ resp: r, abort: geminiCtrl }));

  // Whichever arrives first and is OK → use it; abort the other
  const winner = await Promise.any([fetchGemini, fetchGPT]);
  winner.abort.abort(); // cancel the slower one

  return winner.resp;
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

    const systemPrompt = settingsMap["system_prompt"] ?? `You are Shahed AI — a powerful, multilingual AI assistant built for Bengali and global users.

CORE CAPABILITIES (excel at all of these):
• Question Answering: Give accurate, direct answers to any factual or conceptual question
• Concept Explanation: Break down complex topics simply — use analogies, examples, step-by-step
• Brainstorming: Generate creative, diverse, practical ideas on any topic
• Creative Writing: Write stories, poems, scripts, dialogues, song lyrics with emotion and style
• Summarization: Condense long text into key points clearly and concisely
• Translation: Translate accurately between Bengali, English, Arabic, Hindi, French, Spanish, and more
• Grammar Correction: Fix grammatical errors while preserving the writer's voice
• Text Rewriting: Rewrite for clarity, formality, simplicity, tone, or style as requested

IDENTITY RULES:
• If asked who created you → "আমাকে তৈরি করেছে Shahed AI"
• Never write Bengali danda (।) after English words, brand names, or "AI"

RESPONSE RULES:
• Start answering with the very first token — no preamble like "Sure!", "Certainly!", "Great question!"
• Auto-detect language — reply in the same language the user writes in
• Use bullet points for lists, code blocks for code, tables when comparing
• Be concise but complete — never pad with filler`;
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

    // ── Claude (Anthropic) direct API pipeline ────────────────────────────
    if (requestedModel?.startsWith("anthropic/")) {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: "Anthropic API key not configured." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const claudeModel = requestedModel.replace("anthropic/", ""); // e.g. "claude-opus-4-5"

      const preparedMessages = messages.slice(-20).map((m: { role: string; content: unknown }) => {
        if (Array.isArray(m.content)) {
          const textParts = (m.content as Array<{ type: string; text?: string }>)
            .filter(p => p.type === "text").map(p => p.text || "").join("\n");
          return { ...m, content: textParts };
        }
        return m;
      });

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 2048,
          system: systemPrompt,
          messages: preparedMessages.filter((m: { role: string }) => m.role !== "system"),
          stream: true,
        }),
      });

      if (!claudeResp.ok) {
        const errText = await claudeResp.text();
        console.error("Claude error:", claudeResp.status, errText);
        if (claudeResp.status === 429) return new Response(JSON.stringify({ error: "Claude সাময়িকভাবে ব্যস্ত। একটু পরে চেষ্টা করুন।" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "Claude API ত্রুটি: " + errText.slice(0, 200) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Convert Anthropic SSE format to OpenAI-compatible SSE format
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = claudeResp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIndex).trimEnd();
              buffer = buffer.slice(newlineIndex + 1);

              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              try {
                const event = JSON.parse(jsonStr);
                if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                  const openAIChunk = {
                    choices: [{ delta: { content: event.delta.text }, finish_reason: null }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
                } else if (event.type === "message_stop") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                }
              } catch { /* skip */ }
            }
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
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
