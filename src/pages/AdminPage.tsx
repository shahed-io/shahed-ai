import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, BarChart2, Settings, AlertTriangle,
  Ban, CheckCircle, Key, Eye, EyeOff, CheckCircle2, Loader2,
  RefreshCw, Wifi, WifiOff, TrendingUp, MessageSquare, UserPlus,
  Activity, Shield, Brain, ArrowLeft, ChevronRight, Zap,
  Search, Filter, Clock, Cpu, Globe, Database, Server,
  XCircle, Star, AlertCircle, Hash, Trash2, ChevronDown, ChevronUp
} from "lucide-react";

interface Profile { id: string; name: string | null; email: string | null; banned: boolean; created_at: string; }
interface UsageRow { user_id: string; date: string; message_count: number; token_estimate: number; }
interface ErrorLog { id: string; error_type: string; message: string; created_at: string; user_id: string | null; context?: any; }

type AdminSection = "dashboard" | "users" | "usage" | "apikeys" | "settings" | "logs" | "system";

const AI_PROVIDERS = [
  { id: "lovable", name: "Lovable AI (Built-in)", models: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "google/gemini-3-flash-preview", "openai/gpt-5", "openai/gpt-5-mini"], baseUrl: "https://ai.gateway.lovable.dev/v1", keyPlaceholder: "lovable-api-key", keyHint: "Lovable AI Gateway — কোনো আলাদা API key লাগে না, LOVABLE_API_KEY স্বয়ংক্রিয়ভাবে সেট থাকে" },
  { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"], baseUrl: "https://api.openai.com/v1", keyPlaceholder: "sk-...", keyHint: "OpenAI API Keys: platform.openai.com/api-keys" },
  { id: "gemini", name: "Google Gemini", models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro"], baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyPlaceholder: "AIza...", keyHint: "Gemini API Keys: aistudio.google.com/app/apikey" },
  { id: "deepseek", name: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"], baseUrl: "https://api.deepseek.com/v1", keyPlaceholder: "sk-...", keyHint: "DeepSeek API Keys: platform.deepseek.com/api_keys" },
  { id: "anthropic", name: "Anthropic Claude", models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-opus-20240229"], baseUrl: "https://api.anthropic.com/v1", keyPlaceholder: "sk-ant-...", keyHint: "Claude API Keys: console.anthropic.com/settings/keys" },
  { id: "custom", name: "Custom OpenAI-compatible", models: [], baseUrl: "", keyPlaceholder: "API Key...", keyHint: "যেকোনো OpenAI-compatible API endpoint" },
];

const SECTION_META: Record<AdminSection, { icon: any; label: string; description: string }> = {
  dashboard: { icon: LayoutDashboard, label: "ড্যাশবোর্ড", description: "সামগ্রিক পরিসংখ্যান" },
  users: { icon: Users, label: "ব্যবহারকারী", description: "ব্যবহারকারী ব্যবস্থাপনা" },
  usage: { icon: BarChart2, label: "ব্যবহার", description: "ব্যবহার বিশ্লেষণ" },
  apikeys: { icon: Key, label: "API কনফিগ", description: "AI প্রদানকারী সেটআপ" },
  settings: { icon: Settings, label: "সেটিংস", description: "সিস্টেম কনফিগারেশন" },
  logs: { icon: AlertTriangle, label: "লগ", description: "ত্রুটি ও কার্যক্রম" },
  system: { icon: Server, label: "সিস্টেম", description: "সিস্টেম স্বাস্থ্য" },
};

// Mini sparkline bar chart
function SparkBar({ values, color = "hsl(var(--primary))" }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all"
          style={{ height: `${Math.max(8, (v / max) * 32)}px`, background: color, opacity: i === values.length - 1 ? 1 : 0.4 + (i / values.length) * 0.5 }}
        />
      ))}
    </div>
  );
}

// Stat card
function StatCard({
  icon: Icon, label, value, sub, trend, color = "text-primary", bg = "bg-primary/10",
  spark
}: {
  icon: any; label: string; value: string | number; sub?: string; trend?: string; color?: string; bg?: string; spark?: number[];
}) {
  return (
    <div className="p-4 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-xl", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        {trend && (
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{trend}</span>
        )}
      </div>
      <p className="text-2xl font-bold mb-0.5">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
      {spark && spark.length > 0 && (
        <div className="mt-3">
          <SparkBar values={spark} />
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [section, setSection] = useState<AdminSection>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [blockedKeywords, setBlockedKeywords] = useState("");
  const [freeLimit, setFreeLimit] = useState("20");
  const [saving, setSaving] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveEvents, setLiveEvents] = useState<{ text: string; time: Date; type: "user" | "message" | "error" }[]>([]);
  const [logFilter, setLogFilter] = useState<string>("all");

  // API config
  const [selectedProvider, setSelectedProvider] = useState("lovable");
  const [apiKey, setApiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider) ?? AI_PROVIDERS[0];

  const fetchAll = useCallback(async () => {
    if (!isAdmin) return;
    const [{ data: p }, { data: u }, { data: l }, { data: s }, { count: convCount }, { count: msgCount }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("usage_daily").select("*").order("date", { ascending: false }).limit(500),
      supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("settings").select("*"),
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase.from("messages").select("id", { count: "exact", head: true }),
    ]);
    setProfiles(p ?? []);
    setUsage(u ?? []);
    setLogs(l ?? []);
    setTotalConversations(convCount ?? 0);
    setTotalMessages(msgCount ?? 0);
    if (s) {
      setSystemPrompt(s.find(x => x.key === "system_prompt")?.value ?? "");
      setBlockedKeywords(s.find(x => x.key === "blocked_keywords")?.value ?? "");
      setFreeLimit(s.find(x => x.key === "free_daily_limit")?.value ?? "20");
      const prov = s.find(x => x.key === "llm_provider")?.value ?? null;
      const mdl = s.find(x => x.key === "llm_model")?.value ?? null;
      if (prov) { setCurrentProvider(prov); setSelectedProvider(prov); }
      if (mdl) { setCurrentModel(mdl); setCustomModel(mdl); }
      const url = s.find(x => x.key === "llm_base_url")?.value ?? "";
      if (url) setCustomBaseUrl(url);
    }
    setLastUpdated(new Date());
  }, [isAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime subscriptions
  useEffect(() => {
    if (!isAdmin) return;
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    const profileChannel = supabase
      .channel("admin-profiles-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const p = payload.new as Profile;
          setProfiles(prev => [p, ...prev]);
          setLiveEvents(prev => [{ text: `🆕 নতুন ব্যবহারকারী: ${p.email ?? p.name ?? "অজানা"}`, time: new Date(), type: "user" }, ...prev.slice(0, 19)]);
          toast({ title: "🆕 নতুন ব্যবহারকারী", description: p.email ?? "" });
        } else if (payload.eventType === "UPDATE") {
          setProfiles(prev => prev.map(x => x.id === (payload.new as Profile).id ? payload.new as Profile : x));
        } else if (payload.eventType === "DELETE") {
          setProfiles(prev => prev.filter(x => x.id !== (payload.old as Profile).id));
        }
        setLastUpdated(new Date());
      })
      .subscribe(status => setIsConnected(status === "SUBSCRIBED"));

    const usageChannel = supabase
      .channel("admin-usage-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_daily" }, (payload) => {
        if (payload.eventType === "INSERT") setUsage(prev => [payload.new as UsageRow, ...prev]);
        else if (payload.eventType === "UPDATE") setUsage(prev => prev.map(u => u.user_id === (payload.new as UsageRow).user_id && u.date === (payload.new as UsageRow).date ? payload.new as UsageRow : u));
        setLastUpdated(new Date());
        setLiveEvents(prev => [{ text: "📨 নতুন বার্তা পাঠানো হয়েছে", time: new Date(), type: "message" }, ...prev.slice(0, 19)]);
      })
      .subscribe();

    const logsChannel = supabase
      .channel("admin-logs-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "error_logs" }, (payload) => {
        const log = payload.new as ErrorLog;
        setLogs(prev => [log, ...prev]);
        setLiveEvents(prev => [{ text: `⚠️ ত্রুটি: ${log.error_type}`, time: new Date(), type: "error" }, ...prev.slice(0, 19)]);
        setLastUpdated(new Date());
      })
      .subscribe();

    channelsRef.current = [profileChannel, usageChannel, logsChannel];
    return () => { channelsRef.current.forEach(ch => supabase.removeChannel(ch)); };
  }, [isAdmin, toast]);

  const toggleBan = async (profile: Profile) => {
    const { error } = await supabase.from("profiles").update({ banned: !profile.banned }).eq("id", profile.id);
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, banned: !p.banned } : p));
      toast({ title: profile.banned ? "✅ আনব্যান করা হয়েছে" : "🚫 ব্যান করা হয়েছে" });
    }
  };

  const deleteLog = async (id: string) => {
    // Note: no delete policy, just remove from UI for now
    setLogs(prev => prev.filter(l => l.id !== id));
    toast({ title: "লগ সরানো হয়েছে" });
  };

  const saveSettings = async () => {
    setSaving(true);
    for (const u of [
      { key: "system_prompt", value: systemPrompt },
      { key: "blocked_keywords", value: blockedKeywords },
      { key: "free_daily_limit", value: freeLimit },
    ]) await supabase.from("settings").upsert(u, { onConflict: "key" });
    setSaving(false);
    toast({ title: "✅ সেটিংস সংরক্ষিত হয়েছে" });
  };

  const saveApiConfig = async () => {
    if (!apiKey.trim() && selectedProvider !== "lovable" && selectedProvider !== "custom") {
      toast({ title: "API Key দিন", variant: "destructive" }); return;
    }
    setSavingApi(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-secrets`;
      const model = providerInfo.models.length > 0 ? (customModel || providerInfo.models[0]) : customModel;
      const baseUrl = selectedProvider === "custom" ? customBaseUrl : providerInfo.baseUrl;
      const saves = [
        { key: "llm_provider", value: selectedProvider },
        { key: "llm_model", value: model },
        { key: "llm_base_url", value: baseUrl },
        ...(apiKey.trim() ? [{ key: "llm_api_key", value: apiKey.trim() }] : []),
      ];
      for (const s of saves) {
        const r = await fetch(FUNC_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(s) });
        if (!r.ok) throw new Error("Failed to save " + s.key);
      }
      setCurrentProvider(selectedProvider); setCurrentModel(model); setApiKey("");
      toast({ title: "✅ API কনফিগারেশন সংরক্ষিত হয়েছে", description: `${providerInfo.name} — ${model}` });
    } catch (e) {
      toast({ title: "ত্রুটি", description: (e as Error).message, variant: "destructive" });
    } finally { setSavingApi(false); }
  };

  // Computed stats
  const today = new Date().toISOString().split("T")[0];
  const todayUsage = usage.filter(u => u.date === today);
  const totalMsgsToday = todayUsage.reduce((s, u) => s + u.message_count, 0);
  const totalTokensToday = todayUsage.reduce((s, u) => s + u.token_estimate, 0);
  const totalMsgsAllTime = usage.reduce((s, u) => s + u.message_count, 0);
  const newUsersThisWeek = profiles.filter(p => { const d = new Date(p.created_at); const w = new Date(); w.setDate(w.getDate() - 7); return d >= w; }).length;
  const activeUsers = profiles.filter(p => usage.some(u => u.user_id === p.id)).length;

  // Last 7 days message counts for sparkline
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });
  const msgSpark = last7Days.map(day => usage.filter(u => u.date === day).reduce((s, u) => s + u.message_count, 0));

  const usageByUser: Record<string, { messages: number; tokens: number }> = {};
  usage.forEach(u => {
    if (!usageByUser[u.user_id]) usageByUser[u.user_id] = { messages: 0, tokens: 0 };
    usageByUser[u.user_id].messages += u.message_count;
    usageByUser[u.user_id].tokens += u.token_estimate;
  });
  const topUsers = Object.entries(usageByUser).sort((a, b) => b[1].messages - a[1].messages).slice(0, 15);
  const getProfileName = (uid: string) => { const p = profiles.find(x => x.id === uid); return p ? (p.name ?? p.email ?? uid.slice(0, 8) + "...") : uid.slice(0, 8) + "..."; };

  const filteredProfiles = profiles.filter(p => (p.name ?? "").toLowerCase().includes(searchUser.toLowerCase()) || (p.email ?? "").toLowerCase().includes(searchUser.toLowerCase()));
  const filteredLogs = logFilter === "all" ? logs : logs.filter(l => l.error_type === logFilter);

  if (!isAdmin) return (
    <div className="min-h-dvh bg-background flex items-center justify-center font-bn">
      <div className="text-center space-y-3">
        <Shield className="h-12 w-12 text-destructive mx-auto opacity-50" />
        <p className="font-semibold text-lg">অ্যাক্সেস নিষিদ্ধ</p>
        <p className="text-muted-foreground text-sm">আপনার এই পেজে প্রবেশের অনুমতি নেই।</p>
        <Button variant="outline" onClick={() => navigate("/chat")}>চ্যাটে ফিরুন</Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh bg-background overflow-hidden font-bn">

      {/* ── Sidebar ── */}
      <div className={cn(
        "flex flex-col shrink-0 bg-sidebar border-r border-sidebar-border transition-all duration-300",
        sidebarOpen ? "w-[220px]" : "w-[60px]"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-14 px-3 border-b border-sidebar-border shrink-0">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
            <Shield className="h-4 w-4 text-white" />
          </div>
          {sidebarOpen && <span className="font-bold text-sm truncate">অ্যাডমিন</span>}
        </div>

        {/* Nav items */}
        <ScrollArea className="flex-1 py-2">
          {(Object.keys(SECTION_META) as AdminSection[]).map(key => {
            const meta = SECTION_META[key];
            const Icon = meta.icon;
            const isActive = section === key;
            const badge = key === "logs" && logs.length > 0 ? logs.length : key === "users" && profiles.length > 0 ? profiles.length : 0;
            return (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-xl text-sm transition-all duration-150 relative group",
                  sidebarOpen ? "mx-2" : "mx-1 justify-center",
                  isActive ? "bg-sidebar-accent text-sidebar-foreground font-semibold" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
                style={{ width: sidebarOpen ? "calc(100% - 16px)" : "calc(100% - 8px)" }}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />}
                <Icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="flex-1 text-left truncate">{meta.label}</span>}
                {sidebarOpen && badge > 0 && (
                  <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", key === "logs" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary")}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {!sidebarOpen && badge > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
                )}
              </button>
            );
          })}
        </ScrollArea>

        {/* Realtime indicator */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className={cn("flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs", isConnected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
            {sidebarOpen && <span>{isConnected ? "রিয়েলটাইম সক্রিয়" : "সংযুক্ত নয়"}</span>}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(v => !v)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <div className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 bg-foreground rounded" />
                <span className="block h-0.5 w-3 bg-foreground rounded" />
                <span className="block h-0.5 w-4 bg-foreground rounded" />
              </div>
            </button>
            <div>
              <p className="font-bold text-sm">{SECTION_META[section].label}</p>
              <p className="text-xs text-muted-foreground">{SECTION_META[section].description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
                <Clock className="h-3 w-3" /> {lastUpdated.toLocaleTimeString("bn-BD")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); toast({ title: "✅ ডেটা রিফ্রেশ হয়েছে" }); }} disabled={refreshing} className="gap-1.5 h-8 text-xs">
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">রিফ্রেশ</span>
            </Button>
            <Link to="/chat">
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
                <ArrowLeft className="h-3 w-3" /> ফিরুন
              </Button>
            </Link>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 md:p-6 max-w-7xl mx-auto">

            {/* ══════════════════════ DASHBOARD ══════════════════════ */}
            {section === "dashboard" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard icon={Users} label="মোট ব্যবহারকারী" value={profiles.length} sub={`এ সপ্তাহে +${newUsersThisWeek}`} trend={newUsersThisWeek > 0 ? `+${newUsersThisWeek}` : undefined} color="text-primary" bg="bg-primary/10" />
                  <StatCard icon={Activity} label="সক্রিয় ব্যবহারকারী" value={activeUsers} sub="কখনো বার্তা দিয়েছে" color="text-primary" bg="bg-primary/10" />
                  <StatCard icon={MessageSquare} label="কথোপকথন" value={totalConversations} sub="মোট চ্যাট" color="text-accent" bg="bg-accent/10" />
                  <StatCard icon={Hash} label="মোট বার্তা" value={totalMessages > 999 ? (totalMessages / 1000).toFixed(1) + "K" : totalMessages} sub={`আজ: ${totalMsgsToday}`} spark={msgSpark} color="text-accent" bg="bg-accent/10" />
                  <StatCard icon={TrendingUp} label="আজ টোকেন" value={totalTokensToday > 999 ? (totalTokensToday / 1000).toFixed(1) + "K" : totalTokensToday} sub="আনুমানিক" color="text-foreground" bg="bg-muted" />
                  <StatCard icon={Ban} label="ব্যান করা" value={profiles.filter(p => p.banned).length} sub={`সক্রিয়: ${profiles.filter(p => !p.banned).length}`} color="text-destructive" bg="bg-destructive/10" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Live activity feed */}
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      <h3 className="font-semibold text-sm">লাইভ কার্যক্রম</h3>
                      {isConnected && <Badge variant="secondary" className="text-xs px-2">রিয়েলটাইম</Badge>}
                    </div>
                    <div className="divide-y divide-border/50">
                      {liveEvents.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                          <Activity className="h-6 w-6 mx-auto mb-2 opacity-30" />
                          <p>কোনো সাম্প্রতিক কার্যক্রম নেই</p>
                          <p className="text-xs mt-1">রিয়েলটাইম আপডেটের জন্য অপেক্ষা করুন...</p>
                        </div>
                      ) : (
                        liveEvents.slice(0, 8).map((ev, i) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                            <div className={cn("h-2 w-2 rounded-full shrink-0", ev.type === "error" ? "bg-destructive" : ev.type === "user" ? "bg-primary" : "bg-accent")} />
                            <span className="text-xs flex-1">{ev.text}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{ev.time.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Top users */}
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                      <Star className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">শীর্ষ ব্যবহারকারী</h3>
                    </div>
                    <div className="divide-y divide-border/50">
                      {topUsers.slice(0, 6).map(([uid, data], i) => (
                        <div key={uid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                          <span className="text-base shrink-0">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-xs text-muted-foreground w-4 text-center">{i + 1}</span>}</span>
                          <span className="text-xs flex-1 truncate">{getProfileName(uid)}</span>
                          <span className="text-xs font-semibold text-primary shrink-0">{data.messages} বার্তা</span>
                        </div>
                      ))}
                      {topUsers.length === 0 && (
                        <div className="px-4 py-8 text-center text-muted-foreground text-sm">কোনো ডেটা নেই</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Usage by day (last 7 days) */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">গত ৭ দিনের বার্তা</h3>
                  </div>
                  <div className="p-4">
                    <div className="flex items-end gap-2 h-24">
                      {last7Days.map((day, i) => {
                        const count = msgSpark[i];
                        const maxVal = Math.max(...msgSpark, 1);
                        const height = Math.max(4, (count / maxVal) * 80);
                        const isToday = day === today;
                        return (
                          <div key={day} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] text-muted-foreground font-medium">{count || ""}</span>
                            <div
                              className={cn("w-full rounded-t-md transition-all", isToday ? "bg-primary" : "bg-primary/30")}
                              style={{ height: `${height}px` }}
                            />
                            <span className="text-[9px] text-muted-foreground">{day.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Recent error summary */}
                {logs.length > 0 && (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-destructive/10">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <h3 className="font-semibold text-sm text-destructive">সাম্প্রতিক ত্রুটি</h3>
                      </div>
                      <button onClick={() => setSection("logs")} className="text-xs text-destructive hover:underline">সব দেখুন →</button>
                    </div>
                    <div className="divide-y divide-destructive/10">
                      {logs.slice(0, 3).map(log => (
                        <div key={log.id} className="px-4 py-2.5 flex items-center gap-3">
                          <Badge variant="destructive" className="text-xs shrink-0">{log.error_type}</Badge>
                          <span className="text-xs truncate flex-1">{log.message.slice(0, 80)}...</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{new Date(log.created_at).toLocaleTimeString("bn-BD")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════ USERS ══════════════════════ */}
            {section === "users" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="নাম বা ইমেইল খুঁজুন..." value={searchUser} onChange={e => setSearchUser(e.target.value)} className="pl-9" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{filteredProfiles.length} জন</Badge>
                    <Badge variant="outline" className="gap-1"><Ban className="h-3 w-3" /> ব্যান: {profiles.filter(p => p.banned).length}</Badge>
                  </div>
                </div>

                <div className="rounded-2xl border border-border overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">ব্যবহারকারী</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide hidden md:table-cell">নিবন্ধন</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">বার্তা</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">স্ট্যাটাস</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProfiles.map((p, i) => {
                          const msgs = usageByUser[p.id]?.messages ?? 0;
                          return (
                            <tr key={p.id} className={cn("border-t border-border/40 hover:bg-muted/20 transition-colors", p.banned && "opacity-60")}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                    {(p.name ?? p.email ?? "?")[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{p.name ?? <span className="text-muted-foreground italic">নাম নেই</span>}</p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[160px]">{p.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                                {new Date(p.created_at).toLocaleDateString("bn-BD")}
                              </td>
                              <td className="px-4 py-3">
                                {msgs > 0 ? <span className="font-semibold text-primary">{msgs}</span> : <span className="text-muted-foreground text-xs">০</span>}
                              </td>
                              <td className="px-4 py-3">
                                {p.banned
                                  ? <Badge variant="destructive" className="text-xs gap-1"><Ban className="h-3 w-3" />ব্যান</Badge>
                                  : <Badge variant="secondary" className="text-xs gap-1 text-primary bg-primary/10"><CheckCircle className="h-3 w-3" />সক্রিয়</Badge>}
                              </td>
                              <td className="px-4 py-3">
                                <Button size="sm" variant={p.banned ? "outline" : "destructive"} onClick={() => toggleBan(p)} className="h-7 text-xs px-2.5 gap-1">
                                  {p.banned ? <><CheckCircle className="h-3 w-3" /><span className="hidden sm:inline">আনব্যান</span></> : <><Ban className="h-3 w-3" /><span className="hidden sm:inline">ব্যান</span></>}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredProfiles.length === 0 && (
                          <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">কোনো ব্যবহারকারী পাওয়া যায়নি</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════ USAGE ══════════════════════ */}
            {section === "usage" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard icon={MessageSquare} label="আজ বার্তা" value={totalMsgsToday} sub="আজকের মোট" color="text-primary" bg="bg-primary/10" />
                  <StatCard icon={Hash} label="সর্বকালীন বার্তা" value={totalMsgsAllTime.toLocaleString()} color="text-primary" bg="bg-primary/10" />
                  <StatCard icon={TrendingUp} label="আজ টোকেন" value={totalTokensToday > 999 ? (totalTokensToday / 1000).toFixed(1) + "K" : totalTokensToday} color="text-accent" bg="bg-accent/10" />
                  <StatCard icon={Users} label="সক্রিয় আজ" value={todayUsage.length} sub="ব্যবহারকারী" color="text-accent" bg="bg-accent/10" />
                </div>

                {/* Top users table */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">শীর্ষ ব্যবহারকারী (সর্বকালীন)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted/30 border-b border-border"><th className="text-left px-4 py-2.5 text-xs">#</th><th className="text-left px-4 py-2.5 text-xs">ব্যবহারকারী</th><th className="text-left px-4 py-2.5 text-xs">বার্তা</th><th className="text-left px-4 py-2.5 text-xs hidden sm:table-cell">টোকেন</th></tr></thead>
                      <tbody>
                        {topUsers.map(([uid, data], i) => (
                          <tr key={uid} className={cn("border-t border-border/40 hover:bg-muted/20", i < 3 && "font-medium")}>
                            <td className="px-4 py-2.5 text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-xs text-muted-foreground">{i + 1}.</span>}</td>
                            <td className="px-4 py-2.5 text-xs truncate max-w-[200px]">{getProfileName(uid)}</td>
                            <td className="px-4 py-2.5 font-semibold text-primary">{data.messages}</td>
                            <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">~{data.tokens}</td>
                          </tr>
                        ))}
                        {topUsers.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">কোনো ব্যবহার ডেটা নেই</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Daily log */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="font-semibold text-sm">দৈনিক ব্যবহার লগ</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted/20 border-b border-border"><th className="text-left px-4 py-2.5 text-xs">ব্যবহারকারী</th><th className="text-left px-4 py-2.5 text-xs">তারিখ</th><th className="text-left px-4 py-2.5 text-xs">বার্তা</th><th className="text-left px-4 py-2.5 text-xs hidden sm:table-cell">টোকেন</th></tr></thead>
                      <tbody>
                        {usage.slice(0, 100).map(u => (
                          <tr key={u.user_id + u.date} className={cn("border-t border-border/40 hover:bg-muted/20", u.date === today && "bg-primary/5")}>
                            <td className="px-4 py-2 text-xs truncate max-w-[160px]">{getProfileName(u.user_id)}</td>
                            <td className="px-4 py-2 whitespace-nowrap"><span className="text-xs">{u.date}</span>{u.date === today && <Badge variant="secondary" className="ml-2 text-xs px-1">আজ</Badge>}</td>
                            <td className="px-4 py-2 font-semibold">{u.message_count}</td>
                            <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">~{u.token_estimate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════ API KEYS ══════════════════════ */}
            {section === "apikeys" && (
              <div className="max-w-2xl space-y-5">
                {currentProvider && (
                  <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">বর্তমানে সক্রিয় কনফিগারেশন</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Provider: <span className="font-semibold text-foreground">{AI_PROVIDERS.find(p => p.id === currentProvider)?.name ?? currentProvider}</span>
                        {currentModel && <> · Model: <span className="font-semibold text-foreground">{currentModel}</span></>}
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-5 rounded-2xl border border-border bg-card space-y-5">
                  <div>
                    <h3 className="font-semibold mb-1">AI Provider বেছে নিন</h3>
                    <p className="text-xs text-muted-foreground mb-4">Lovable AI (built-in) ব্যবহার করলে কোনো API key লাগবে না</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {AI_PROVIDERS.map(p => (
                        <button key={p.id} onClick={() => { setSelectedProvider(p.id); setCustomModel(""); }}
                          className={cn("p-3 rounded-xl border text-left transition-all", selectedProvider === p.id ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-primary/50 hover:bg-muted/50")}>
                          <p className="text-sm font-semibold">{p.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.models[0] ?? "Custom"}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-2">মডেল</label>
                    {providerInfo.models.length > 0 ? (
                      <Select value={customModel || providerInfo.models[0]} onValueChange={setCustomModel}>
                        <SelectTrigger><SelectValue placeholder="মডেল বেছে নিন" /></SelectTrigger>
                        <SelectContent>{providerInfo.models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="model-name" />
                    )}
                  </div>

                  {selectedProvider === "custom" && (
                    <div>
                      <label className="text-sm font-medium block mb-2">Base URL</label>
                      <Input value={customBaseUrl} onChange={e => setCustomBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
                    </div>
                  )}

                  {selectedProvider !== "lovable" && (
                    <div>
                      <label className="text-sm font-medium block mb-2">API Key</label>
                      <div className="relative">
                        <Input type={showApiKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={providerInfo.keyPlaceholder} className="pr-10 font-mono text-sm" />
                        <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{providerInfo.keyHint}</p>
                      <p className="text-xs text-muted-foreground mt-1 opacity-70">⚠️ বিদ্যমান key রাখতে ফাঁকা রাখুন</p>
                    </div>
                  )}

                  <Button onClick={saveApiConfig} disabled={savingApi} className="w-full sm:w-auto gradient-brand text-white border-0">
                    {savingApi ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />সংরক্ষণ হচ্ছে...</> : "কনফিগারেশন সংরক্ষণ করুন"}
                  </Button>
                </div>
              </div>
            )}

            {/* ══════════════════════ SETTINGS ══════════════════════ */}
            {section === "settings" && (
              <div className="max-w-2xl space-y-5">
                <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                  <div>
                    <h3 className="font-semibold">সিস্টেম প্রম্পট</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">AI-এর ব্যক্তিত্ব ও আচরণ নির্ধারণ করুন</p>
                  </div>
                  <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={6} className="font-mono text-sm" placeholder="AI-এর জন্য সিস্টেম প্রম্পট লিখুন..." />
                </div>

                <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                  <div>
                    <h3 className="font-semibold">নিষিদ্ধ কীওয়ার্ড</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">কমা দিয়ে আলাদা করুন। এই কীওয়ার্ড থাকলে AI উত্তর দেবে না।</p>
                  </div>
                  <Textarea value={blockedKeywords} onChange={e => setBlockedKeywords(e.target.value)} rows={3} className="font-mono text-sm" placeholder="keyword1, keyword2, ..." />
                  {blockedKeywords && (
                    <div className="flex flex-wrap gap-1.5">
                      {blockedKeywords.split(",").filter(k => k.trim()).map(k => (
                        <Badge key={k} variant="secondary" className="text-xs">{k.trim()}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                  <div>
                    <h3 className="font-semibold">ফ্রি প্ল্যান দৈনিক সীমা</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">প্রতিদিন একজন ব্যবহারকারী সর্বোচ্চ কতটি বার্তা পাঠাতে পারবে</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input value={freeLimit} onChange={e => setFreeLimit(e.target.value)} type="number" min="1" max="10000" className="w-32" />
                    <span className="text-sm text-muted-foreground">বার্তা/দিন</span>
                  </div>
                </div>

                <Button onClick={saveSettings} disabled={saving} className="gradient-brand text-white border-0 shadow-brand">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />সংরক্ষণ হচ্ছে...</> : "সেটিংস সংরক্ষণ করুন"}
                </Button>
              </div>
            )}

            {/* ══════════════════════ LOGS ══════════════════════ */}
            {section === "logs" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">ত্রুটি লগ ({logs.length})</h3>
                    {isConnected && <Badge variant="secondary" className="text-xs gap-1"><div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />রিয়েলটাইম</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={logFilter} onValueChange={setLogFilter}>
                      <SelectTrigger className="h-8 text-xs w-40">
                        <SelectValue placeholder="ফিল্টার করুন" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">সব ({logs.length})</SelectItem>
                        {Array.from(new Set(logs.map(l => l.error_type))).map(type => (
                          <SelectItem key={type} value={type}>{type} ({logs.filter(l => l.error_type === type).length})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredLogs.map(log => (
                    <div key={log.id} className="p-4 rounded-2xl border border-border bg-card hover:border-destructive/30 transition-colors group">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="destructive" className="text-xs">{log.error_type}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("bn-BD")}</span>
                          {log.user_id && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">{getProfileName(log.user_id)}</span>}
                        </div>
                        <button onClick={() => deleteLog(log.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 transition-all">
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      <p className="text-xs font-mono bg-muted/50 rounded-lg px-3 py-2 break-all leading-relaxed">
                        {log.message.slice(0, 300)}{log.message.length > 300 ? "..." : ""}
                      </p>
                    </div>
                  ))}
                  {filteredLogs.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-primary opacity-40" />
                      <p className="font-medium">কোনো ত্রুটি লগ নেই ✓</p>
                      <p className="text-sm mt-1">সিস্টেম সুস্থ চলছে</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════ SYSTEM ══════════════════════ */}
            {section === "system" && (
              <div className="space-y-5 max-w-2xl">
                {/* System health */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      <span className="text-sm font-semibold">ডেটাবেজ</span>
                    </div>
                    <p className="text-xs text-muted-foreground">সংযুক্ত ও সক্রিয়</p>
                    <p className="text-xs text-primary mt-1">✓ অনলাইন</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
                      <span className="text-sm font-semibold">রিয়েলটাইম</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{isConnected ? "সংযুক্ত" : "সংযুক্ত নয়"}</p>
                    <p className={cn("text-xs mt-1", isConnected ? "text-primary" : "text-muted-foreground")}>{isConnected ? "✓ লাইভ" : "✗ অফলাইন"}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm font-semibold">Edge Functions</span>
                    </div>
                    <p className="text-xs text-muted-foreground">chat, update-secrets</p>
                    <p className="text-xs text-primary mt-1">✓ ডিপ্লয়েড</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm font-semibold">AI গেটওয়ে</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Lovable AI Gateway</p>
                    <p className="text-xs text-primary mt-1">✓ কনফিগার্ড</p>
                  </div>
                </div>

                {/* System info */}
                <div className="p-5 rounded-2xl border border-border bg-card space-y-3">
                  <h3 className="font-semibold text-sm">সিস্টেম তথ্য</h3>
                  <div className="space-y-2">
                    {[
                      { label: "মোট ব্যবহারকারী", value: profiles.length },
                      { label: "মোট কথোপকথন", value: totalConversations },
                      { label: "মোট বার্তা", value: totalMessages },
                      { label: "ত্রুটি লগ", value: logs.length },
                      { label: "নিষিদ্ধ কীওয়ার্ড", value: blockedKeywords.split(",").filter(k => k.trim()).length },
                      { label: "দৈনিক সীমা", value: freeLimit + " বার্তা/দিন" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <span className="text-sm font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Danger zone */}
                <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-3">
                  <h3 className="font-semibold text-sm text-destructive">বিপদজনক জোন</h3>
                  <p className="text-xs text-muted-foreground">এই ক্রিয়াগুলি অপরিবর্তনীয়। সাবধানে ব্যবহার করুন।</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
                      onClick={() => { setLogs([]); toast({ title: "লগ পরিষ্কার করা হয়েছে (UI থেকে)" }); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> লগ পরিষ্কার করুন
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
