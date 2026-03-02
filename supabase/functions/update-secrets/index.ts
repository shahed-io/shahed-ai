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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Admin only
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = roleData?.some(r => r.role === "admin");
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { key, value } = await req.json();
    if (!key || typeof value !== "string") {
      return new Response(JSON.stringify({ error: "key and value required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allowed keys only
    const ALLOWED_KEYS = ["llm_api_key", "llm_base_url", "llm_model", "llm_provider"];
    if (!ALLOWED_KEYS.includes(key.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Key not allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Save to settings table (admin-only access via RLS)
    await supabase.from("settings").upsert({ key, value }, { onConflict: "key" });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("update-secrets error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
