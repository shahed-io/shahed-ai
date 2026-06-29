import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";
import shahedLogo from "@/assets/shahed-ai-logo.png";
import SEO from "@/components/SEO";

// Google SVG icon
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "লগ ইন ব্যর্থ", description: error.message, variant: "destructive" });
    } else {
      navigate("/chat");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast({ title: "নাম দিন", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: "নিবন্ধন ব্যর্থ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "নিবন্ধন সফল! 🎉", description: "আপনার ইমেইল যাচাই করুন অথবা সরাসরি লগ ইন করুন।" });
      setTab("login");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) {
      toast({ title: "Google লগইন ব্যর্থ", description: String(error), variant: "destructive" });
      setGoogleLoading(false);
    }
    // On success the page redirects, so no need to reset loading
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <SEO
        title="লগ ইন বা সাইন আপ — Shahed AI"
        description="Shahed AI-তে বিনামূল্যে অ্যাকাউন্ট তৈরি করুন এবং বাংলায় AI চ্যাট, ছবি ও ভিডিও তৈরির সুবিধা উপভোগ করুন।"
        path="/auth"
      />
      {/* Left panel */}
      <div className="hidden md:flex md:w-5/12 gradient-hero flex-col justify-between p-12 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/5" />

        <Link to="/" className="flex items-center gap-3 relative z-10">
          <img src={shahedLogo} alt="Shahed AI" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-bold text-xl font-bn">শাহেদ AI</span>
        </Link>

        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-bold font-bn leading-tight">
            বাংলায় AI<br />আপনার হাতের মুঠোয়
          </h1>
          <p className="text-white/70 text-lg font-bn">
            Gemini ও ChatGPT-এর সমন্বয়ে তৈরি সবচেয়ে দ্রুত AI অ্যাসিস্ট্যান্ট।
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {["⚡ Shahed AI-5 — Gemini + ChatGPT একসাথে", "🌏 বাংলা, English, হিন্দিতে কথা বলুন", "🔒 আপনার ডেটা সম্পূর্ণ সুরক্ষিত"].map(f => (
              <p key={f} className="text-white/80 text-sm font-bn">{f}</p>
            ))}
          </div>
        </div>

        <p className="text-white/40 text-sm relative z-10">© {new Date().getFullYear()} শাহেদ AI</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background min-h-screen">
        <div className="w-full max-w-[400px]">
          {/* Mobile header */}
          <div className="flex items-center justify-between mb-8 md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <img src={shahedLogo} alt="Shahed AI" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-bold font-bn">শাহেদ AI</span>
            </Link>
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          {/* Desktop theme toggle */}
          <div className="hidden md:flex justify-end mb-6">
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          {/* Google OAuth button — prominent */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 gap-3 border-border/70 hover:bg-muted font-bn text-sm font-medium mb-4"
            onClick={handleGoogle}
            disabled={googleLoading}
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Google দিয়ে প্রবেশ করুন
          </Button>

          {/* Divider */}
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground font-bn">অথবা ইমেইল দিয়ে</span>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full mb-5">
              <TabsTrigger value="login" className="flex-1 font-bn">লগ ইন</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 font-bn">নিবন্ধন</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <h2 className="text-2xl font-bold font-bn mb-1">স্বাগতম ফিরে!</h2>
                <p className="text-muted-foreground text-sm font-bn mb-5">আপনার অ্যাকাউন্টে প্রবেশ করুন</p>
                <div className="space-y-1.5">
                  <Label htmlFor="email-login" className="font-bn text-sm">ইমেইল</Label>
                  <Input id="email-login" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pass-login" className="font-bn text-sm">পাসওয়ার্ড</Label>
                  <div className="relative">
                    <Input id="pass-login" type={showPass ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required className="h-10 pr-10" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-10 gradient-brand text-white border-0 shadow-brand font-bn" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />লোড হচ্ছে...</> : "লগ ইন করুন"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <h2 className="text-2xl font-bold font-bn mb-1">অ্যাকাউন্ট তৈরি করুন</h2>
                <p className="text-muted-foreground text-sm font-bn mb-5">বিনামূল্যে শুরু করুন — কোনো কার্ড নেই</p>
                <div className="space-y-1.5">
                  <Label htmlFor="name-signup" className="font-bn text-sm">আপনার নাম</Label>
                  <Input id="name-signup" placeholder="মোহাম্মদ শাহেদ" value={name} onChange={e => setName(e.target.value)} required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-signup" className="font-bn text-sm">ইমেইল</Label>
                  <Input id="email-signup" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pass-signup" className="font-bn text-sm">পাসওয়ার্ড</Label>
                  <div className="relative">
                    <Input id="pass-signup" type={showPass ? "text" : "password"} placeholder="কমপক্ষে ৬ অক্ষর" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required className="h-10 pr-10" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-10 gradient-brand text-white border-0 shadow-brand font-bn" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />তৈরি হচ্ছে...</> : "অ্যাকাউন্ট তৈরি করুন"}
                </Button>
                <p className="text-xs text-center text-muted-foreground font-bn">
                  নিবন্ধন করে আপনি আমাদের{" "}
                  <Link to="/terms" className="text-primary hover:underline">শর্তাবলী</Link> ও{" "}
                  <Link to="/privacy" className="text-primary hover:underline">গোপনীয়তা নীতি</Link> মেনে নিচ্ছেন।
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
