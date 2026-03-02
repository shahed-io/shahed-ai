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
import { Brain, ArrowLeft, Users, BarChart2, Settings, AlertTriangle, Ban, CheckCircle } from "lucide-react";

interface Profile { id: string; name: string | null; email: string | null; banned: boolean; created_at: string; }
interface UsageRow { user_id: string; date: string; message_count: number; token_estimate: number; }
interface ErrorLog { id: string; error_type: string; message: string; created_at: string; user_id: string | null; }

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

  useEffect(() => {
    if (!isAdmin) return;
    // Load all data in parallel
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
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> ব্যবহারকারী</TabsTrigger>
            <TabsTrigger value="usage" className="gap-2"><BarChart2 className="h-4 w-4" /> ব্যবহার</TabsTrigger>
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
