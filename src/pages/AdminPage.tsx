import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, ArrowLeft, Users, BarChart2, Settings, AlertTriangle,
  Ban, CheckCircle, Key, Eye, EyeOff, CheckCircle2, Loader2,
  RefreshCw, Wifi, WifiOff, TrendingUp, MessageSquare, UserPlus, Clock,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Profile { id: string; name: string | null; email: string | null; banned: boolean; created_at: string; }
interface UsageRow { user_id: string; date: string; message_count: number; token_estimate: number; }
interface ErrorLog { id: string; error_type: string; message: string; created_at: string; user_id: string | null; }

const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"], baseUrl: "https://api.openai.com/v1", keyPlaceholder: "sk-...", keyHint: "OpenAI API Keys পেতে: platform.openai.com/api-keys" },
  { id: "gemini", name: "Google Gemini", models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro"], baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyPlaceholder: "AIza...", keyHint: "Gemini API Keys পেতে: aistudio.google.com/app/apikey" },
  { id: "deepseek", name: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"], baseUrl: "https://api.deepseek.com/v1", keyPlaceholder: "sk-...", keyHint: "DeepSeek API Keys পেতে: platform.deepseek.com/api_keys" },
  { id: "anthropic", name: "Anthropic Claude", models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-opus-20240229"], baseUrl: "https://api.anthropic.com/v1", keyPlaceholder: "sk-ant-...", keyHint: "Claude API Keys পেতে: console.anthropic.com/settings/keys" },
  { id: "custom", name: "Custom (অন্যান্য)", models: [], baseUrl: "", keyPlaceholder: "API Key...", keyHint: "যেকোনো OpenAI-compatible API ব্যবহার করুন" },
];

export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [blockedKeywords, setBlockedKeywords] = useState("");
  const [freeLimit, setFreeLimit] = useState("20");
  const [saving, setSaving] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // API Keys state
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider) ?? AI_PROVIDERS[0];

  const fetchAll = async () => {
    if (!isAdmin) return;
    const [{ data: p }, { data: u }, { data: l }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("usage_daily").select("*").order("date", { ascending: false }).limit(200),
      supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("settings").select("*"),
    ]);
    setProfiles(p ?? []);
    setUsage(u ?? []);
    setLogs(l ?? []);
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
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
    toast({ title: "ডেটা আপডেট হয়েছে ✓" });
  };

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [isAdmin]);

  // Realtime subscriptions
  useEffect(() => {
    if (!isAdmin) return;

    // Clean previous channels
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    const profileChannel = supabase
      .channel("admin-profiles-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setProfiles(prev => [payload.new as Profile, ...prev]);
          toast({ title: "🆕 নতুন ব্যবহারকারী নিবন্ধন করেছে", description: (payload.new as Profile).email ?? "" });
        } else if (payload.eventType === "UPDATE") {
          setProfiles(prev => prev.map(p => p.id === (payload.new as Profile).id ? payload.new as Profile : p));
        } else if (payload.eventType === "DELETE") {
          setProfiles(prev => prev.filter(p => p.id !== (payload.old as Profile).id));
        }
        setLastUpdated(new Date());
      })
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    const usageChannel = supabase
      .channel("admin-usage-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_daily" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setUsage(prev => [payload.new as UsageRow, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setUsage(prev => prev.map(u =>
            u.user_id === (payload.new as UsageRow).user_id && u.date === (payload.new as UsageRow).date
              ? payload.new as UsageRow : u
          ));
        }
        setLastUpdated(new Date());
      })
      .subscribe();

    const logsChannel = supabase
      .channel("admin-logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "error_logs" }, (payload) => {
        setLogs(prev => [payload.new as ErrorLog, ...prev]);
        setLastUpdated(new Date());
      })
      .subscribe();

    channelsRef.current = [profileChannel, usageChannel, logsChannel];

    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    };
  }, [isAdmin]);

  const toggleBan = async (profile: Profile) => {
    const { error } = await supabase.from("profiles").update({ banned: !profile.banned }).eq("id", profile.id);
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, banned: !p.banned } : p));
      toast({ title: profile.banned ? "✅ আনব্যান করা হয়েছে" : "🚫 ব্যান করা হয়েছে" });
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    const updates = [
      { key: "system_prompt", value: systemPrompt },
      { key: "blocked_keywords", value: blockedKeywords },
      { key: "free_daily_limit", value: freeLimit },
    ];
    for (const u of updates) {
      await supabase.from("settings").upsert(u, { onConflict: "key" });
    }
    setSaving(false);
    toast({ title: "সেটিংস সংরক্ষিত হয়েছে ✓" });
  };

  const saveApiConfig = async () => {
    if (!apiKey.trim() && selectedProvider !== "custom") {
      toast({ title: "API Key দিন", variant: "destructive" }); return;
    }
    setSavingApi(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-secrets`;

      const model = providerInfo.models.length > 0
        ? (customModel || providerInfo.models[0])
        : customModel;
      const baseUrl = selectedProvider === "custom" ? customBaseUrl : providerInfo.baseUrl;

      const saves = [
        { key: "llm_provider", value: selectedProvider },
        { key: "llm_model", value: model },
        { key: "llm_base_url", value: baseUrl },
        ...(apiKey.trim() ? [{ key: "llm_api_key", value: apiKey.trim() }] : []),
      ];

      for (const s of saves) {
        const r = await fetch(FUNC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(s),
        });
        if (!r.ok) throw new Error("Failed to save " + s.key);
      }

      setCurrentProvider(selectedProvider);
      setCurrentModel(model);
      setApiKey("");
      toast({ title: "API কনফিগারেশন সংরক্ষিত হয়েছে ✓", description: `${providerInfo.name} — ${model}` });
    } catch (e) {
      toast({ title: "ত্রুটি হয়েছে", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingApi(false);
    }
  };

  const filteredProfiles = profiles.filter(p =>
    (p.name ?? "").toLowerCase().includes(searchUser.toLowerCase()) ||
    (p.email ?? "").toLowerCase().includes(searchUser.toLowerCase())
  );

  // Stats
  const today = new Date().toISOString().split("T")[0];
  const todayUsage = usage.filter(u => u.date === today);
  const totalMsgsToday = todayUsage.reduce((s, u) => s + u.message_count, 0);
  const totalTokensToday = todayUsage.reduce((s, u) => s + u.token_estimate, 0);
  const totalMsgsAllTime = usage.reduce((s, u) => s + u.message_count, 0);
  const newUsersThisWeek = profiles.filter(p => {
    const d = new Date(p.created_at);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }).length;

  // Usage by user (for enhanced usage tab)
  const usageByUser: Record<string, { messages: number; tokens: number }> = {};
  usage.forEach(u => {
    if (!usageByUser[u.user_id]) usageByUser[u.user_id] = { messages: 0, tokens: 0 };
    usageByUser[u.user_id].messages += u.message_count;
    usageByUser[u.user_id].tokens += u.token_estimate;
  });
  const topUsers = Object.entries(usageByUser)
    .sort((a, b) => b[1].messages - a[1].messages)
    .slice(0, 20);

  const getProfileName = (uid: string) => {
    const p = profiles.find(x => x.id === uid);
    return p ? (p.name ?? p.email ?? uid.slice(0, 8) + "...") : uid.slice(0, 8) + "...";
  };

  return (
    <div className="min-h-screen bg-background font-bn">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container flex items-center h-14 gap-3">
          <Link to="/chat">
            <Button variant="ghost" size="sm" className="gap-1.5 px-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">ফিরে যান</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <h1 className="font-bold text-sm sm:text-base">অ্যাডমিন প্যানেল</h1>
          </div>

          {/* Realtime indicator */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ml-2 ${isConnected ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
            {isConnected ? <><Wifi className="h-3 w-3" /><span className="hidden sm:inline">লাইভ</span></> : <><WifiOff className="h-3 w-3" /><span className="hidden sm:inline">অফলাইন</span></>}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {lastUpdated.toLocaleTimeString("bn-BD")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5 px-2 sm:px-3">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">রিফ্রেশ</span>
            </Button>
            <Badge className="gradient-brand text-white border-0 text-xs hidden sm:flex">{user?.email}</Badge>
          </div>
        </div>
      </header>

      <div className="container py-4 sm:py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold">{profiles.length}</p>
                <p className="text-xs text-muted-foreground mt-1">মোট ব্যবহারকারী</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-4 w-4 text-blue-500" /></div>
            </div>
            {newUsersThisWeek > 0 && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> এ সপ্তাহে +{newUsersThisWeek} নতুন
              </p>
            )}
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold">{totalMsgsToday}</p>
                <p className="text-xs text-muted-foreground mt-1">আজ বার্তা</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/10"><MessageSquare className="h-4 w-4 text-purple-500" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">সর্বমোট: {totalMsgsAllTime.toLocaleString()}</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold">{totalTokensToday > 1000 ? (totalTokensToday / 1000).toFixed(1) + "K" : totalTokensToday}</p>
                <p className="text-xs text-muted-foreground mt-1">আজ টোকেন</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-500/10"><TrendingUp className="h-4 w-4 text-orange-500" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">আনুমানিক</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold text-destructive">{profiles.filter(p => p.banned).length}</p>
                <p className="text-xs text-muted-foreground mt-1">ব্যান করা</p>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10"><Ban className="h-4 w-4 text-red-500" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">সক্রিয়: {profiles.filter(p => !p.banned).length}</p>
          </div>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-4 sm:mb-6 flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" /> ব্যবহারকারী
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{profiles.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-1.5 text-xs sm:text-sm"><BarChart2 className="h-3.5 w-3.5" /> ব্যবহার</TabsTrigger>
            <TabsTrigger value="apikeys" className="gap-1.5 text-xs sm:text-sm"><Key className="h-3.5 w-3.5" /> API Keys</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm"><Settings className="h-3.5 w-3.5" /> সেটিংস</TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 text-xs sm:text-sm">
              <AlertTriangle className="h-3.5 w-3.5" /> লগ
              {logs.length > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">{logs.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ===== Users Tab ===== */}
          <TabsContent value="users">
            <div className="mb-4 flex items-center gap-3">
              <Input placeholder="নাম বা ইমেইল খুঁজুন..." value={searchUser} onChange={e => setSearchUser(e.target.value)} className="max-w-sm" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">{filteredProfiles.length} জন</span>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 whitespace-nowrap">নাম</th>
                      <th className="text-left p-3 whitespace-nowrap">ইমেইল</th>
                      <th className="text-left p-3 whitespace-nowrap hidden sm:table-cell">নিবন্ধন</th>
                      <th className="text-left p-3 whitespace-nowrap hidden md:table-cell">বার্তা</th>
                      <th className="text-left p-3 whitespace-nowrap">স্ট্যাটাস</th>
                      <th className="text-left p-3 whitespace-nowrap">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map((p, i) => {
                      const userMsgs = usageByUser[p.id]?.messages ?? 0;
                      return (
                        <tr key={p.id} className={`border-t border-border/50 transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="p-3 font-medium">{p.name ?? <span className="text-muted-foreground text-xs">নাম নেই</span>}</td>
                          <td className="p-3 text-muted-foreground text-xs sm:text-sm max-w-[150px] truncate">{p.email}</td>
                          <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell whitespace-nowrap">{new Date(p.created_at).toLocaleDateString("bn-BD")}</td>
                          <td className="p-3 hidden md:table-cell">
                            {userMsgs > 0 ? <span className="font-semibold">{userMsgs}</span> : <span className="text-muted-foreground text-xs">০</span>}
                          </td>
                          <td className="p-3">
                            {p.banned
                              ? <Badge variant="destructive" className="gap-1 text-xs"><Ban className="h-3 w-3" />ব্যান</Badge>
                              : <Badge variant="secondary" className="gap-1 text-xs"><CheckCircle className="h-3 w-3" />সক্রিয়</Badge>}
                          </td>
                          <td className="p-3">
                            <Button
                              size="sm"
                              variant={p.banned ? "outline" : "destructive"}
                              onClick={() => toggleBan(p)}
                              className="gap-1 h-7 text-xs px-2"
                            >
                              {p.banned
                                ? <><CheckCircle className="h-3 w-3" /><span className="hidden sm:inline"> আনব্যান</span></>
                                : <><Ban className="h-3 w-3" /><span className="hidden sm:inline"> ব্যান</span></>}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredProfiles.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">কোনো ব্যবহারকারী পাওয়া যায়নি</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ===== Usage Tab ===== */}
          <TabsContent value="usage">
            <div className="space-y-4">
              {/* Top users */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 bg-muted/50 border-b border-border">
                  <h3 className="font-semibold text-sm">শীর্ষ ব্যবহারকারী (সর্বকালীন)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left p-3">#</th>
                        <th className="text-left p-3">নাম / ইমেইল</th>
                        <th className="text-left p-3">বার্তা</th>
                        <th className="text-left p-3 hidden sm:table-cell">টোকেন</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topUsers.map(([uid, data], i) => (
                        <tr key={uid} className={`border-t border-border/50 hover:bg-muted/20 ${i < 3 ? "font-medium" : ""}`}>
                          <td className="p-3 text-muted-foreground">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                          </td>
                          <td className="p-3 max-w-[180px] truncate text-xs sm:text-sm">{getProfileName(uid)}</td>
                          <td className="p-3 font-semibold">{data.messages}</td>
                          <td className="p-3 text-muted-foreground hidden sm:table-cell">~{data.tokens}</td>
                        </tr>
                      ))}
                      {topUsers.length === 0 && (
                        <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">কোনো ব্যবহার ডেটা নেই</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Daily log */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 bg-muted/50 border-b border-border">
                  <h3 className="font-semibold text-sm">দৈনিক ব্যবহার লগ</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left p-3">ব্যবহারকারী</th>
                        <th className="text-left p-3">তারিখ</th>
                        <th className="text-left p-3">বার্তা</th>
                        <th className="text-left p-3 hidden sm:table-cell">টোকেন</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.slice(0, 50).map((u, i) => (
                        <tr key={u.user_id + u.date} className={`border-t border-border/50 hover:bg-muted/20 ${u.date === today ? "bg-primary/5" : ""}`}>
                          <td className="p-3 text-xs font-mono text-muted-foreground">{getProfileName(u.user_id)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="text-xs">{u.date}</span>
                            {u.date === today && <Badge variant="secondary" className="ml-2 text-xs px-1">আজ</Badge>}
                          </td>
                          <td className="p-3 font-semibold">{u.message_count}</td>
                          <td className="p-3 text-muted-foreground hidden sm:table-cell">~{u.token_estimate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ===== API Keys Tab ===== */}
          <TabsContent value="apikeys">
            <div className="max-w-2xl space-y-6">
              {currentProvider && (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">বর্তমান কনফিগারেশন সক্রিয়</p>
                    <p className="text-xs text-muted-foreground">
                      Provider: <span className="font-semibold">{AI_PROVIDERS.find(p => p.id === currentProvider)?.name ?? currentProvider}</span>
                      {currentModel && <> · Model: <span className="font-semibold">{currentModel}</span></>}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-5 sm:p-6 rounded-xl border border-border bg-card space-y-5">
                <div>
                  <h3 className="font-semibold mb-1">AI Provider বেছে নিন</h3>
                  <p className="text-xs text-muted-foreground mb-4">কোন AI সার্ভিস ব্যবহার করবেন তা নির্বাচন করুন</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    {AI_PROVIDERS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProvider(p.id); setCustomModel(""); }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedProvider === p.id
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
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
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="মডেল বেছে নিন" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerInfo.models.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="model-name (যেমন: llama-3.1-8b)" />
                  )}
                </div>

                {selectedProvider === "custom" && (
                  <div>
                    <label className="text-sm font-medium block mb-2">Base URL</label>
                    <Input value={customBaseUrl} onChange={e => setCustomBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium block mb-2">API Key</label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={providerInfo.keyPlaceholder}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{providerInfo.keyHint}</p>
                  <p className="text-xs text-muted-foreground mt-1">⚠️ বিদ্যমান key রাখতে খালি রাখুন</p>
                </div>

                <Button onClick={saveApiConfig} disabled={savingApi} className="gradient-brand text-white border-0 shadow-brand w-full sm:w-auto">
                  {savingApi ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> সংরক্ষণ হচ্ছে...</> : "কনফিগারেশন সংরক্ষণ করুন"}
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-border bg-muted/30 text-sm space-y-2">
                <p className="font-semibold">📚 API Key কোথায় পাবেন:</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li>🔵 <strong>OpenAI:</strong> <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">platform.openai.com/api-keys</a></li>
                  <li>🟢 <strong>Google Gemini:</strong> <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary underline">aistudio.google.com/app/apikey</a></li>
                  <li>🟣 <strong>DeepSeek:</strong> <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="text-primary underline">platform.deepseek.com/api_keys</a></li>
                  <li>🟠 <strong>Anthropic:</strong> <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-primary underline">console.anthropic.com</a></li>
                </ul>
              </div>
            </div>
          </TabsContent>

          {/* ===== Settings Tab ===== */}
          <TabsContent value="settings">
            <div className="max-w-2xl space-y-4 sm:space-y-6">
              <div className="p-5 sm:p-6 rounded-xl border border-border bg-card space-y-4">
                <div>
                  <h3 className="font-semibold">সিস্টেম প্রম্পট</h3>
                  <p className="text-xs text-muted-foreground mt-1">AI-এর ব্যক্তিত্ব ও আচরণ নির্ধারণ করুন</p>
                </div>
                <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="font-mono text-sm" placeholder="AI-এর জন্য সিস্টেম প্রম্পট লিখুন..." />
              </div>
              <div className="p-5 sm:p-6 rounded-xl border border-border bg-card space-y-4">
                <div>
                  <h3 className="font-semibold">নিষিদ্ধ কীওয়ার্ড</h3>
                  <p className="text-sm text-muted-foreground">কমা দিয়ে আলাদা করুন</p>
                </div>
                <Textarea value={blockedKeywords} onChange={e => setBlockedKeywords(e.target.value)} rows={3} className="font-mono text-sm" placeholder="keyword1, keyword2, ..." />
              </div>
              <div className="p-5 sm:p-6 rounded-xl border border-border bg-card space-y-4">
                <div>
                  <h3 className="font-semibold">ফ্রি প্ল্যান দৈনিক সীমা</h3>
                  <p className="text-sm text-muted-foreground">প্রতিদিন সর্বোচ্চ কতটি বার্তা পাঠাতে পারবে</p>
                </div>
                <Input value={freeLimit} onChange={e => setFreeLimit(e.target.value)} type="number" min="1" max="1000" className="w-32" />
              </div>
              <Button onClick={saveSettings} disabled={saving} className="gradient-brand text-white border-0 shadow-brand">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />সংরক্ষণ হচ্ছে...</> : "সংরক্ষণ করুন"}
              </Button>
            </div>
          </TabsContent>

          {/* ===== Logs Tab ===== */}
          <TabsContent value="logs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">ত্রুটি লগ ({logs.length})</h3>
              {isConnected && <span className="text-xs text-green-600 flex items-center gap-1"><Wifi className="h-3 w-3" /> রিয়েলটাইম</span>}
            </div>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 pr-2">
                {logs.map(log => (
                  <div key={log.id} className="p-4 rounded-xl border border-border bg-card hover:border-destructive/30 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Badge variant="destructive" className="text-xs">{log.error_type}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("bn-BD")}</span>
                      {log.user_id && <span className="text-xs text-muted-foreground font-mono">{getProfileName(log.user_id)}</span>}
                    </div>
                    <p className="text-sm">{log.message}</p>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                    <p>কোনো ত্রুটি লগ নেই ✓</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
