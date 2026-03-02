import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Brain, Eye, EyeOff } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left panel */}
      <div className="hidden md:flex md:w-1/2 gradient-hero flex-col justify-between p-12 text-white">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-xl font-bn">শাহেদ AI</span>
        </Link>
        <div>
          <h2 className="text-4xl font-bold font-bn mb-4 leading-tight">বাংলায় AI<br />আপনার হাতের মুঠোয়</h2>
          <p className="text-white/70 text-lg font-bn">প্রতিদিন ২০টি বিনামূল্যে বার্তা দিয়ে শুরু করুন। কোনো ক্রেডিট কার্ড দরকার নেই।</p>
        </div>
        <p className="text-white/40 text-sm">© {new Date().getFullYear()} শাহেদ AI</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8">
            <Link to="/" className="flex items-center gap-2 md:hidden">
              <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold font-bn">শাহেদ AI</span>
            </Link>
            <div className="ml-auto">
              <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full mb-6">
              <TabsTrigger value="login" className="flex-1 font-bn">লগ ইন</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 font-bn">নিবন্ধন</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <h2 className="text-2xl font-bold font-bn mb-2">স্বাগতম ফিরে!</h2>
                <p className="text-muted-foreground text-sm font-bn mb-6">আপনার অ্যাকাউন্টে প্রবেশ করুন</p>
                <div className="space-y-2">
                  <Label htmlFor="email-login" className="font-bn">ইমেইল</Label>
                  <Input id="email-login" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass-login" className="font-bn">পাসওয়ার্ড</Label>
                  <div className="relative">
                    <Input id="pass-login" type={showPass ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-brand text-white border-0 shadow-brand font-bn" disabled={loading}>
                  {loading ? "লোড হচ্ছে..." : "লগ ইন করুন"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <h2 className="text-2xl font-bold font-bn mb-2">অ্যাকাউন্ট তৈরি করুন</h2>
                <p className="text-muted-foreground text-sm font-bn mb-6">বিনামূল্যে শুরু করুন — কোনো কার্ড নেই</p>
                <div className="space-y-2">
                  <Label htmlFor="name-signup" className="font-bn">আপনার নাম</Label>
                  <Input id="name-signup" placeholder="মোহাম্মদ শাহেদ" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-signup" className="font-bn">ইমেইল</Label>
                  <Input id="email-signup" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass-signup" className="font-bn">পাসওয়ার্ড</Label>
                  <div className="relative">
                    <Input id="pass-signup" type={showPass ? "text" : "password"} placeholder="কমপক্ষে ৬ অক্ষর" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-brand text-white border-0 shadow-brand font-bn" disabled={loading}>
                  {loading ? "তৈরি হচ্ছে..." : "অ্যাকাউন্ট তৈরি করুন"}
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
