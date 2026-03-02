import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, ArrowLeft, Users, BarChart2, Settings, AlertTriangle, Ban, CheckCircle, Key, Eye, EyeOff, CheckCircle2, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Profile { id: string; name: string | null; email: string | null; banned: boolean; created_at: string; }
interface UsageRow { user_id: string; date: string; message_count: number; token_estimate: number; }
interface ErrorLog { id: string; error_type: string; message: string; created_at: string; user_id: string | null; }

const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    baseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
    keyHint: "OpenAI API Keys পেতে: platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyPlaceholder: "AIza...",
    keyHint: "Gemini API Keys পেতে: aistudio.google.com/app/apikey",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com/v1",
    keyPlaceholder: "sk-...",
    keyHint: "DeepSeek API Keys পেতে: platform.deepseek.com/api_keys",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-opus-20240229"],
    baseUrl: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
    keyHint: "Claude API Keys পেতে: console.anthropic.com/settings/keys",
  },
  {
    id: "custom",
    name: "Custom (অন্যান্য)",
    models: [],
    baseUrl: "",
    keyPlaceholder: "API Key...",
    keyHint: "যেকোনো OpenAI-compatible API ব্যবহার করুন",
  },
];


export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [blockedKeywords, setBlockedKeywords] = useState("");
  const [freeLimit, setFreeLimit] = useState("20");
  const [saving, setSaving] = useState(false);
  const [searchUser, setSearchUser] = useState("");

  // API Keys state
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider) ?? AI_PROVIDERS[0];


  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("usage_daily").select("*").order("date", { ascending: false }).limit(100),
      supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("settings").select("*"),
    ]).then(([{ data: p }, { data: u }, { data: l }, { data: s }]) => {
      setProfiles(p ?? []);
      setUsage(u ?? []);
      setLogs(l ?? []);
      if (s) {
        setSystemPrompt(s.find(x => x.key === "system_prompt")?.value ?? "");
        setBlockedKeywords(s.find(x => x.key === "blocked_keywords")?.value ?? "");
        setFreeLimit(s.find(x => x.key === "free_daily_limit")?.value ?? "20");
        // Load current API provider/model
        const prov = s.find(x => x.key === "llm_provider")?.value ?? null;
        const mdl = s.find(x => x.key === "llm_model")?.value ?? null;
        if (prov) { setCurrentProvider(prov); setSelectedProvider(prov); }
        if (mdl) { setCurrentModel(mdl); setCustomModel(mdl); }
        const url = s.find(x => x.key === "llm_base_url")?.value ?? "";
        if (url) setCustomBaseUrl(url);
      }
    });
  }, [isAdmin]);


  const toggleBan = async (profile: Profile) => {
    const { error } = await supabase.from("profiles").update({ banned: !profile.banned }).eq("id", profile.id);
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, banned: !p.banned } : p));
      toast({ title: profile.banned ? "আনব্যান করা হয়েছে" : "ব্যান করা হয়েছে" });
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

  // Usage stats
  const today = new Date().toISOString().split("T")[0];
  const todayUsage = usage.filter(u => u.date === today);
  const totalMsgsToday = todayUsage.reduce((s, u) => s + u.message_count, 0);
  const totalTokensToday = todayUsage.reduce((s, u) => s + u.token_estimate, 0);

  return (
    <div className="min-h-screen bg-background font-bn">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container flex items-center h-16 gap-4">
          <Link to="/chat"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" /> ফিরে যান</Button></Link>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center"><Brain className="h-4 w-4 text-white" /></div>
            <h1 className="font-bold">অ্যাডমিন প্যানেল</h1>
          </div>
          <Badge className="ml-auto gradient-brand text-white border-0">{user?.email}</Badge>
        </div>
      </header>

      <div className="container py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "মোট ব্যবহারকারী", value: profiles.length, icon: Users },
            { label: "আজ বার্তা", value: totalMsgsToday, icon: BarChart2 },
            { label: "আজ টোকেন (আনুমানিক)", value: totalTokensToday.toLocaleString(), icon: BarChart2 },
            { label: "ব্যান করা", value: profiles.filter(p => p.banned).length, icon: Ban },
          ].map(stat => (
            <div key={stat.label} className="p-4 rounded-xl border border-border bg-card shadow-card">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-6 flex-wrap gap-1">
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> ব্যবহারকারী</TabsTrigger>
            <TabsTrigger value="usage" className="gap-2"><BarChart2 className="h-4 w-4" /> ব্যবহার</TabsTrigger>
            <TabsTrigger value="apikeys" className="gap-2"><Key className="h-4 w-4" /> API Keys</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" /> সেটিংস</TabsTrigger>
            <TabsTrigger value="logs" className="gap-2"><AlertTriangle className="h-4 w-4" /> লগ</TabsTrigger>
          </TabsList>

          {/* Users tab */}
          <TabsContent value="users">
            <div className="mb-4">
              <Input placeholder="নাম বা ইমেইল খুঁজুন..." value={searchUser} onChange={e => setSearchUser(e.target.value)} className="max-w-sm" />
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">নাম</th>
                    <th className="text-left p-3">ইমেইল</th>
                    <th className="text-left p-3">নিবন্ধনের তারিখ</th>
                    <th className="text-left p-3">স্ট্যাটাস</th>
                    <th className="text-left p-3">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                      <td className="p-3">{p.name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{p.email}</td>
                      <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("bn-BD")}</td>
                      <td className="p-3">
                        {p.banned ? <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />ব্যান</Badge> : <Badge variant="secondary" className="gap-1"><CheckCircle className="h-3 w-3" />সক্রিয়</Badge>}
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant={p.banned ? "outline" : "destructive"} onClick={() => toggleBan(p)} className="gap-1 h-7 text-xs">
                          {p.banned ? <><CheckCircle className="h-3 w-3" /> আনব্যান</> : <><Ban className="h-3 w-3" /> ব্যান</>}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Usage tab */}
          <TabsContent value="usage">
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">ব্যবহারকারী ID</th>
                    <th className="text-left p-3">তারিখ</th>
                    <th className="text-left p-3">বার্তা সংখ্যা</th>
                    <th className="text-left p-3">টোকেন আনুমানিক</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.slice(0, 50).map((u, i) => (
                    <tr key={u.user_id + u.date} className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                      <td className="p-3 text-xs text-muted-foreground font-mono">{u.user_id.slice(0, 8)}...</td>
                      <td className="p-3">{u.date}</td>
                      <td className="p-3 font-semibold">{u.message_count}</td>
                      <td className="p-3 text-muted-foreground">~{u.token_estimate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* API Keys tab */}
          <TabsContent value="apikeys">
            <div className="max-w-2xl space-y-6">
              {/* Current active config */}
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

              {/* Provider selection */}
              <div className="p-6 rounded-xl border border-border bg-card space-y-5">
                <div>
                  <h3 className="font-semibold mb-1">AI Provider বেছে নিন</h3>
                  <p className="text-xs text-muted-foreground mb-4">কোন AI সার্ভিস ব্যবহার করবেন তা নির্বাচন করুন</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {p.models[0] ?? "Custom"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model selection */}
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
                    <Input
                      value={customModel}
                      onChange={e => setCustomModel(e.target.value)}
                      placeholder="model-name (যেমন: llama-3.1-8b)"
                    />
                  )}
                </div>

                {/* Custom base URL */}
                {selectedProvider === "custom" && (
                  <div>
                    <label className="text-sm font-medium block mb-2">Base URL</label>
                    <Input
                      value={customBaseUrl}
                      onChange={e => setCustomBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                )}

                {/* API Key input */}
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
                  <p className="text-xs text-muted-foreground mt-1">⚠️ বিদ্যমান key রাখতে খালি রাখুন — নতুন key দিলেই শুধু আপডেট হবে</p>
                </div>

                <Button
                  onClick={saveApiConfig}
                  disabled={savingApi}
                  className="gradient-brand text-white border-0 shadow-brand w-full sm:w-auto"
                >
                  {savingApi ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> সংরক্ষণ হচ্ছে...</> : "কনফিগারেশন সংরক্ষণ করুন"}
                </Button>
              </div>

              {/* Provider docs */}
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

          {/* Settings tab */}
          <TabsContent value="settings">
            <div className="max-w-2xl space-y-6">
              <div className="p-6 rounded-xl border border-border bg-card space-y-4">
                <h3 className="font-semibold">সিস্টেম প্রম্পট</h3>
                <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="font-mono text-sm" placeholder="AI-এর জন্য সিস্টেম প্রম্পট লিখুন..." />
              </div>
              <div className="p-6 rounded-xl border border-border bg-card space-y-4">
                <h3 className="font-semibold">নিষিদ্ধ কীওয়ার্ড</h3>
                <p className="text-sm text-muted-foreground">কমা দিয়ে আলাদা করুন</p>
                <Textarea value={blockedKeywords} onChange={e => setBlockedKeywords(e.target.value)} rows={3} className="font-mono text-sm" placeholder="keyword1, keyword2, ..." />
              </div>
              <div className="p-6 rounded-xl border border-border bg-card space-y-4">
                <h3 className="font-semibold">ফ্রি প্ল্যান দৈনিক সীমা</h3>
                <Input value={freeLimit} onChange={e => setFreeLimit(e.target.value)} type="number" min="1" max="1000" className="w-32" />
              </div>
              <Button onClick={saveSettings} disabled={saving} className="gradient-brand text-white border-0 shadow-brand">
                {saving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </Button>
            </div>
          </TabsContent>

          {/* Logs tab */}
          <TabsContent value="logs">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="destructive" className="text-xs">{log.error_type}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("bn-BD")}</span>
                      {log.user_id && <span className="text-xs text-muted-foreground font-mono">{log.user_id.slice(0, 8)}...</span>}
                    </div>
                    <p className="text-sm">{log.message}</p>
                  </div>
                ))}
                {logs.length === 0 && <p className="text-center text-muted-foreground py-8">কোনো লগ নেই</p>}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
