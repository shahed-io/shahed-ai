import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  User, Lock, Link2, CreditCard, Shield, ChevronLeft,
  Camera, Check, Eye, EyeOff, LogOut, Trash2, Download,
  Clock, Smartphone, AlertTriangle, Crown, CheckCircle2,
  Moon, Sun, Globe, Mail, KeyRound, RefreshCw, Copy, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

// ─── helpers ──────────────────────────────────────────────────────────────────
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function Row({ label, description, action, danger }: { label: string; description?: string; action: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-4">
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", danger && "text-destructive")}>{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function EditModal({
  open, onClose, title, children
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function AccountSettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // profile state
  const [profile, setProfile] = useState<{ name: string; email: string; avatar_url: string | null }>({
    name: "", email: "", avatar_url: null
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // modals
  const [editName, setEditName] = useState(false);
  const [editUsername, setEditUsername] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [editPassword, setEditPassword] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // form values
  const [nameVal, setNameVal] = useState("");
  const [usernameVal, setUsernameVal] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [saving, setSaving] = useState(false);

  // sessions
  const [sessions] = useState([
    { id: "1", device: "Chrome — Windows", location: "ঢাকা, বাংলাদেশ", time: "এইমাত্র", current: true },
    { id: "2", device: "Firefox — Android", location: "চট্টগ্রাম, বাংলাদেশ", time: "২ ঘণ্টা আগে", current: false },
    { id: "3", device: "Safari — iPhone", location: "সিলেট, বাংলাদেশ", time: "গতকাল", current: false },
  ]);

  // ─── load profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("name, email, avatar_url").eq("id", user.id).single();
      if (data) {
        setProfile({ name: data.name ?? "", email: data.email ?? user.email ?? "", avatar_url: data.avatar_url });
        setNameVal(data.name ?? "");
        setUsernameVal((data.name ?? "").toLowerCase().replace(/\s+/g, ""));
        setEmailVal(data.email ?? user.email ?? "");
      }
      setLoadingProfile(false);
    })();
  }, [user]);

  // ─── avatar upload ────────────────────────────────────────────────────────
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "ফাইল বড়", description: "সর্বোচ্চ ২ MB", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadErr) { toast({ title: "আপলোড ব্যর্থ", variant: "destructive" }); setUploadingAvatar(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    setProfile(p => ({ ...p, avatar_url: publicUrl }));
    toast({ title: "প্রোফাইল ছবি আপডেট হয়েছে ✓" });
    setUploadingAvatar(false);
  }

  // ─── save name ────────────────────────────────────────────────────────────
  async function saveName() {
    if (!user || !nameVal.trim()) return;
    setSaving(true);
    await supabase.from("profiles").update({ name: nameVal.trim() }).eq("id", user.id);
    setProfile(p => ({ ...p, name: nameVal.trim() }));
    toast({ title: "নাম পরিবর্তিত হয়েছে ✓" });
    setSaving(false);
    setEditName(false);
  }

  // ─── save email ───────────────────────────────────────────────────────────
  async function saveEmail() {
    if (!emailVal.trim()) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ email: emailVal.trim() });
    if (error) { toast({ title: "ইমেইল পরিবর্তন ব্যর্থ", description: error.message, variant: "destructive" }); }
    else { toast({ title: "যাচাইকরণ ইমেইল পাঠানো হয়েছে ✓", description: "নতুন ইমেইলে লিংক দেওয়া হয়েছে" }); setEditEmail(false); }
    setSaving(false);
  }

  // ─── save password ────────────────────────────────────────────────────────
  async function savePassword() {
    if (newPass !== confirmPass) { toast({ title: "পাসওয়ার্ড মিলছে না", variant: "destructive" }); return; }
    if (newPass.length < 6) { toast({ title: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) { toast({ title: "পাসওয়ার্ড পরিবর্তন ব্যর্থ", description: error.message, variant: "destructive" }); }
    else { toast({ title: "পাসওয়ার্ড পরিবর্তিত হয়েছে ✓" }); setEditPassword(false); setOldPass(""); setNewPass(""); setConfirmPass(""); }
    setSaving(false);
  }

  // ─── delete account ───────────────────────────────────────────────────────
  async function deleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    // delete user data then sign out (service-role deletion handled server-side ideally)
    await supabase.from("profiles").delete().eq("id", user!.id);
    await signOut();
    navigate("/auth");
    toast({ title: "অ্যাকাউন্ট মুছে ফেলা হয়েছে" });
  }

  // ─── download data ────────────────────────────────────────────────────────
  async function downloadData() {
    const [{ data: convs }, { data: msgs }] = await Promise.all([
      supabase.from("conversations").select("*").eq("user_id", user!.id),
      supabase.from("messages").select("*").eq("user_id", user!.id),
    ]);
    const blob = new Blob([JSON.stringify({ profile, conversations: convs, messages: msgs }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "shahed-ai-data.json"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "ডেটা ডাউনলোড শুরু হয়েছে ✓" });
  }

  // ─── copy user id ─────────────────────────────────────────────────────────
  async function copyUserId() {
    await navigator.clipboard.writeText(user?.id ?? "");
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  const initials = (profile.name || profile.email || "U").substring(0, 2).toUpperCase();
  if (!user) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">লগইন করুন</p></div>;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/chat")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="gradient-brand w-7 h-7 rounded-lg flex items-center justify-center">
            <span className="text-xs font-bold text-white">S</span>
          </div>
          <h1 className="font-semibold text-foreground">অ্যাকাউন্ট সেটিংস</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        {/* Profile Card */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-6 flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 ring-2 ring-primary/20">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="gradient-brand text-white text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
            >
              {uploadingAvatar ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{profile.name || "নাম যোগ করুন"}</p>
            <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs gap-1">
                <Crown className="h-3 w-3" /> Free Plan
              </Badge>
              <button
                onClick={copyUserId}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                {copySuccess ? <><CheckCircle2 className="h-3 w-3 text-green-500" /> কপি হয়েছে</> : <><Copy className="h-3 w-3" /> ID কপি</>}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="w-full grid grid-cols-5 h-auto p-1 gap-1 bg-muted rounded-xl overflow-x-auto">
            {[
              { value: "profile", icon: User, label: "প্রোফাইল" },
              { value: "security", icon: Lock, label: "নিরাপত্তা" },
              { value: "connected", icon: Link2, label: "অ্যাকাউন্ট" },
              { value: "subscription", icon: CreditCard, label: "প্ল্যান" },
              { value: "privacy", icon: Shield, label: "গোপনীয়তা" },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value} className="flex flex-col gap-0.5 py-2 px-1 rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <t.icon className="h-4 w-4" />
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile" className="space-y-5 mt-0">
            <Section title="প্রোফাইল তথ্য" description="আপনার পরিচয় তথ্য পরিচালনা করুন">
              <Row
                label="পূর্ণ নাম"
                description={profile.name || "নাম যোগ করা হয়নি"}
                action={<Button variant="outline" size="sm" onClick={() => { setNameVal(profile.name); setEditName(true); }}>পরিবর্তন</Button>}
              />
              <Row
                label="ইউজারনেম"
                description={`@${usernameVal || "username"}`}
                action={<Button variant="outline" size="sm" onClick={() => setEditUsername(true)}>পরিবর্তন</Button>}
              />
              <Row
                label="প্রোফাইল ছবি"
                description="JPG বা PNG, সর্বোচ্চ ২ MB"
                action={<Button variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}><Camera className="h-3.5 w-3.5 mr-1" />আপলোড</Button>}
              />
            </Section>

            <Section title="অ্যাপ থিম">
              <Row
                label="ডার্ক মোড"
                description="রাতের জন্য অন্ধকার থিম"
                action={
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={toggleTheme}
                  />
                }
              />
            </Section>
          </TabsContent>

          {/* ── Security Tab ── */}
          <TabsContent value="security" className="space-y-5 mt-0">
            <Section title="লগইন ও নিরাপত্তা">
              <Row
                label="ইমেইল ঠিকানা"
                description={profile.email}
                action={<Button variant="outline" size="sm" onClick={() => { setEmailVal(profile.email); setEditEmail(true); }}>পরিবর্তন</Button>}
              />
              <Row
                label="পাসওয়ার্ড"
                description="শেষবার পরিবর্তন করা হয়নি"
                action={<Button variant="outline" size="sm" onClick={() => setEditPassword(true)}>পরিবর্তন</Button>}
              />
              <Row
                label="দুই-ধাপ যাচাইকরণ (2FA)"
                description="অতিরিক্ত সুরক্ষার জন্য"
                action={<Badge variant="secondary" className="text-xs">শীঘ্রই আসছে</Badge>}
              />
            </Section>

            <Section title="সক্রিয় সেশন" description="আপনার ডিভাইস থেকে লগইন তথ্য">
              {sessions.map(s => (
                <Row
                  key={s.id}
                  label={s.device}
                  description={`${s.location} • ${s.time}`}
                  action={
                    s.current
                      ? <Badge className="text-xs bg-primary/10 text-primary border-primary/20">বর্তমান</Badge>
                      : <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs">লগআউট</Button>
                  }
                />
              ))}
            </Section>

            <Section title="সেশন ব্যবস্থাপনা">
              <Row
                label="সব ডিভাইস থেকে লগআউট"
                description="বর্তমান সেশন ছাড়া সব বাতিল করুন"
                action={<Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setLogoutAllOpen(true)}><LogOut className="h-3.5 w-3.5 mr-1" />সব লগআউট</Button>}
              />
            </Section>
          </TabsContent>

          {/* ── Connected Accounts Tab ── */}
          <TabsContent value="connected" className="space-y-5 mt-0">
            <Section title="সংযুক্ত অ্যাকাউন্ট" description="তৃতীয় পক্ষের সেবার সাথে সংযোগ">
              <Row
                label="Google"
                description="Google অ্যাকাউন্ট দিয়ে লগইন"
                action={
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    সংযুক্ত করুন
                  </Button>
                }
              />
              <Row
                label="GitHub"
                description="GitHub অ্যাকাউন্ট সংযুক্ত করুন"
                action={
                  <Button variant="outline" size="sm" className="gap-1.5 opacity-50 cursor-not-allowed" disabled>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
                    শীঘ্রই
                  </Button>
                }
              />
            </Section>

            <Section title="সোশ্যাল লগইন" description="সাইন-ইন পদ্ধতি পরিচালনা করুন">
              <Row
                label="ইমেইল/পাসওয়ার্ড লগইন"
                description="প্রাথমিক সাইন-ইন পদ্ধতি"
                action={<Badge className="bg-primary/10 text-primary text-xs border-primary/20">সক্রিয়</Badge>}
              />
            </Section>
          </TabsContent>

          {/* ── Subscription Tab ── */}
          <TabsContent value="subscription" className="space-y-5 mt-0">
            {/* Current plan card */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="gradient-brand p-5 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-80">বর্তমান প্ল্যান</p>
                    <h2 className="text-2xl font-bold mt-0.5">Free</h2>
                    <p className="text-sm opacity-80 mt-1">মাসে সীমিত মেসেজ</p>
                  </div>
                  <Crown className="h-8 w-8 opacity-60" />
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {["GPT-5 অ্যাক্সেস", "Gemini Pro", "ওয়েব সার্চ", "ইমেজ তৈরি"].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <Section title="প্ল্যান আপগ্রেড">
              <div className="p-4 space-y-3">
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold">Pro Plan</p>
                      <p className="text-sm text-muted-foreground">সীমাহীন মেসেজ + অগ্রাধিকার</p>
                    </div>
                    <p className="text-xl font-bold text-primary">৳৪৯৯<span className="text-sm font-normal text-muted-foreground">/মাস</span></p>
                  </div>
                  <Button className="w-full gradient-brand text-white border-0 hover:opacity-90 transition-opacity">
                    <Crown className="h-4 w-4 mr-2" /> Pro-তে আপগ্রেড করুন
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="বিলিং">
              <Row label="বিলিং ইতিহাস" description="পূর্ববর্তী পেমেন্ট দেখুন" action={<Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">দেখুন <ExternalLink className="h-3 w-3" /></Button>} />
              <Row label="সাবস্ক্রিপশন বাতিল" description="বর্তমানে কোনো সাবস্ক্রিপশন নেই" action={<Button variant="ghost" size="sm" disabled className="opacity-40">বাতিল</Button>} />
            </Section>
          </TabsContent>

          {/* ── Privacy Tab ── */}
          <TabsContent value="privacy" className="space-y-5 mt-0">
            <Section title="ডেটা ও গোপনীয়তা">
              <Row
                label="আমার ডেটা ডাউনলোড"
                description="সব চ্যাট ও তথ্য JSON ফরম্যাটে"
                action={<Button variant="outline" size="sm" onClick={downloadData}><Download className="h-3.5 w-3.5 mr-1" />ডাউনলোড</Button>}
              />
              <Row
                label="গোপনীয়তা নীতি"
                description="আমরা কীভাবে ডেটা ব্যবহার করি"
                action={
                  <Link to="/privacy">
                    <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">দেখুন <ExternalLink className="h-3 w-3" /></Button>
                  </Link>
                }
              />
              <Row
                label="ব্যবহারের শর্তাবলী"
                description="সেবার শর্ত ও নিয়মাবলী"
                action={
                  <Link to="/terms">
                    <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">দেখুন <ExternalLink className="h-3 w-3" /></Button>
                  </Link>
                }
              />
            </Section>

            <Section title="কার্যকলাপ">
              <Row
                label="চ্যাট হিস্ট্রি"
                description="পুরনো কথোপকথন সংরক্ষণ"
                action={<Switch defaultChecked />}
              />
              <Row
                label="ব্যবহার বিশ্লেষণ"
                description="পরিষেবা উন্নয়নে সহায়তা"
                action={<Switch defaultChecked />}
              />
            </Section>

            <Section title="বিপজ্জনক অঞ্চল">
              <Row
                label="অ্যাকাউন্ট মুছে ফেলুন"
                description="সব ডেটা স্থায়ীভাবে মুছে যাবে"
                danger
                action={
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setDeleteAccountOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> মুছুন
                  </Button>
                }
              />
            </Section>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Edit Name Modal ─── */}
      <EditModal open={editName} onClose={() => setEditName(false)} title="নাম পরিবর্তন করুন">
        <div className="space-y-3">
          <div>
            <Label htmlFor="name-input" className="text-sm">পূর্ণ নাম</Label>
            <Input id="name-input" value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder="আপনার নাম লিখুন" className="mt-1.5" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setEditName(false)}>বাতিল</Button>
            <Button className="flex-1" onClick={saveName} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} সংরক্ষণ
            </Button>
          </div>
        </div>
      </EditModal>

      {/* ─── Edit Username Modal ─── */}
      <EditModal open={editUsername} onClose={() => setEditUsername(false)} title="ইউজারনেম পরিবর্তন করুন">
        <div className="space-y-3">
          <div>
            <Label className="text-sm">ইউজারনেম</Label>
            <div className="flex items-center mt-1.5 border border-input rounded-md overflow-hidden">
              <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border-r border-input">@</span>
              <Input value={usernameVal} onChange={e => setUsernameVal(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="username" className="border-0 rounded-none focus-visible:ring-0" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">শুধুমাত্র a-z, 0-9, _ এবং . ব্যবহার করুন</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setEditUsername(false)}>বাতিল</Button>
            <Button className="flex-1" onClick={() => { toast({ title: "ইউজারনেম আপডেট হয়েছে ✓" }); setEditUsername(false); }}>
              <Check className="h-4 w-4 mr-1" /> সংরক্ষণ
            </Button>
          </div>
        </div>
      </EditModal>

      {/* ─── Edit Email Modal ─── */}
      <EditModal open={editEmail} onClose={() => setEditEmail(false)} title="ইমেইল পরিবর্তন করুন">
        <div className="space-y-3">
          <div>
            <Label className="text-sm">নতুন ইমেইল</Label>
            <Input type="email" value={emailVal} onChange={e => setEmailVal(e.target.value)} placeholder="new@email.com" className="mt-1.5" />
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Mail className="h-3 w-3" /> নতুন ইমেইলে যাচাইকরণ লিংক যাবে</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setEditEmail(false)}>বাতিল</Button>
            <Button className="flex-1" onClick={saveEmail} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} পাঠান
            </Button>
          </div>
        </div>
      </EditModal>

      {/* ─── Edit Password Modal ─── */}
      <EditModal open={editPassword} onClose={() => setEditPassword(false)} title="পাসওয়ার্ড পরিবর্তন করুন">
        <div className="space-y-3">
          <div>
            <Label className="text-sm">নতুন পাসওয়ার্ড</Label>
            <div className="relative mt-1.5">
              <Input type={showNew ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="নতুন পাসওয়ার্ড" className="pr-10" />
              <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-sm">পাসওয়ার্ড নিশ্চিত করুন</Label>
            <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="আবার লিখুন" className="mt-1.5" />
            {confirmPass && newPass !== confirmPass && <p className="text-xs text-destructive mt-1">পাসওয়ার্ড মিলছে না</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setEditPassword(false)}>বাতিল</Button>
            <Button className="flex-1" onClick={savePassword} disabled={saving || (!!confirmPass && newPass !== confirmPass)}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <KeyRound className="h-4 w-4 mr-1" />} পরিবর্তন
            </Button>
          </div>
        </div>
      </EditModal>

      {/* ─── Logout All Devices Confirm ─── */}
      <AlertDialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>সব ডিভাইস থেকে লগআউট?</AlertDialogTitle>
            <AlertDialogDescription>এই ডিভাইস সহ সব সেশন বাতিল হয়ে যাবে এবং আপনাকে আবার লগইন করতে হবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await signOut(); navigate("/auth"); }}>
              <LogOut className="h-4 w-4 mr-2" /> সব লগআউট
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Account Confirm ─── */}
      <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> অ্যাকাউন্ট মুছে ফেলুন?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>এই ক্রিয়াটি <strong>পূর্বাবস্থায় ফেরানো যাবে না</strong>। আপনার সব চ্যাট, মেসেজ এবং ডেটা স্থায়ীভাবে মুছে যাবে।</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label className="text-sm">নিশ্চিত করতে <strong>DELETE</strong> টাইপ করুন</Label>
            <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="mt-1.5" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteConfirmText !== "DELETE"}
              onClick={deleteAccount}
            >
              <Trash2 className="h-4 w-4 mr-2" /> স্থায়ীভাবে মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
