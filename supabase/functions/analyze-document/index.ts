import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Analyze a document (PDF/image) with Gemini via Lovable AI gateway
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { fileUrl, mimeType, question, fileName } = await req.json();
    if (!fileUrl) return new Response(JSON.stringify({ error: "fileUrl required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // Download the file and base64-encode
    const fr = await fetch(fileUrl);
    if (!fr.ok) throw new Error("ফাইল ডাউনলোড করা যায়নি");
    const buf = new Uint8Array(await fr.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const mt = mimeType || "application/pdf";
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
      const t = await resp.text();
      console.error("doc analyze gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
