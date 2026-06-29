import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

const BodySchema = z.object({
  fileUrl: z.string().trim().url("fileUrl অবৈধ").max(2000),
  mimeType: z.string().trim().max(100).optional(),
  question: z.string().trim().max(2000).optional(),
  fileName: z.string().trim().max(255).optional(),
});

// Analyze a document (PDF/image) with Gemini via Lovable AI gateway
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "ইনপুট ভ্যালিডেশন ব্যর্থ", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { fileUrl, mimeType, question, fileName } = parsed.data;

  const mt = mimeType || "application/pdf";
  if (!ALLOWED_MIMES.includes(mt)) {
    return json({ error: "শুধু PDF / JPG / PNG / WEBP সাপোর্ট করা হয়।" }, 400);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI সার্ভিস কনফিগার করা হয়নি।" }, 503);

  try {
    // Download the file with size cap and timeout
    const ctrl = new AbortController();
    const dlTimer = setTimeout(() => ctrl.abort(), 30_000);
    let fr: Response;
    try {
      fr = await fetch(fileUrl, { signal: ctrl.signal });
    } catch (e) {
      console.error("file download error:", e);
      return json({ error: "ফাইল ডাউনলোড করা যায়নি। URL ঠিক আছে কিনা দেখুন।" }, 400);
    } finally {
      clearTimeout(dlTimer);
    }
    if (!fr.ok) return json({ error: "ফাইল ডাউনলোড করা যায়নি।" }, 400);

    const contentLength = Number(fr.headers.get("content-length") || "0");
    if (contentLength && contentLength > MAX_BYTES) {
      return json({ error: "ফাইল ২০MB এর বেশি — ছোট ফাইল আপলোড করুন।" }, 413);
    }

    const arr = await fr.arrayBuffer();
    if (arr.byteLength > MAX_BYTES) {
      return json({ error: "ফাইল ২০MB এর বেশি — ছোট ফাইল আপলোড করুন।" }, 413);
    }
    const buf = new Uint8Array(arr);
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const dataUrl = `data:${mt};base64,${b64}`;

    const userQ = question?.trim() || `এই ডকুমেন্টটির ('${fileName || "file"}') মূল বিষয়বস্তু সংক্ষেপে ব্যাখ্যা করো এবং গুরুত্বপূর্ণ পয়েন্টগুলো তুলে ধরো।`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are Shahed AI. Analyze documents and answer in Bengali (বাংলা)." },
          { role: "user", content: [
            { type: "text", text: userQ },
            { type: "image_url", image_url: { url: dataUrl } },
          ]},
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("doc analyze gateway error:", resp.status, t.slice(0, 500));
      if (resp.status === 429) return json({ error: "AI সার্ভিস ব্যস্ত। একটু পর চেষ্টা করুন।" }, 429);
      if (resp.status === 402) return json({ error: "AI কোটা শেষ। অ্যাডমিনকে জানান।" }, 402);
      if (resp.status === 401 || resp.status === 403) return json({ error: "AI সার্ভিস অনুমোদন ত্রুটি।" }, 503);
      return json({ error: "ডকুমেন্ট বিশ্লেষণ ব্যর্থ। আবার চেষ্টা করুন।" }, 502);
    }
    const data = await resp.json();
    const answer: string = data?.choices?.[0]?.message?.content || "";
    if (!answer.trim()) return json({ error: "AI কোনো উত্তর দিতে পারেনি। প্রশ্ন আরও স্পষ্ট করে দিন।" }, 502);
    return json({ answer });
  } catch (e) {
    console.error("analyze-document unexpected:", e);
    return json({ error: "অপ্রত্যাশিত সার্ভার ত্রুটি।" }, 500);
  }
});
