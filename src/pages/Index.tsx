import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun, MessageCircle, Zap, Shield, Globe, Brain, Star, ArrowRight, CheckCircle2 } from "lucide-react";

const features = [
  { icon: Brain, title: "বুদ্ধিমান উত্তর", desc: "উন্নত AI মডেল যা বাংলা ও ইংরেজি উভয় ভাষায় সঠিক উত্তর দেয়।" },
  { icon: MessageCircle, title: "কথোপকথনের ইতিহাস", desc: "আপনার সমস্ত কথোপকথন সংরক্ষিত থাকে, যেকোনো সময় দেখতে পারবেন।" },
  { icon: Zap, title: "দ্রুত সাড়া", desc: "রিয়েল-টাইম স্ট্রিমিং রেসপন্স — অপেক্ষার দরকার নেই।" },
  { icon: Shield, title: "নিরাপদ ও বিশ্বস্ত", desc: "আপনার ডেটা সুরক্ষিত। কোনো ক্ষতিকর বিষয়বস্তু নেই।" },
  { icon: Globe, title: "বাংলা-প্রথম", desc: "বাংলাদেশ ও বাংলা ভাষাভাষীদের জন্য বিশেষভাবে তৈরি।" },
  { icon: Star, title: "মার্কডাউন সাপোর্ট", desc: "কোড, তালিকা, টেবিল সহ সুন্দর ফরম্যাটেড উত্তর পান।" },
];

const faqs = [
  { q: "শাহেদ AI কি বাংলায় কথা বলতে পারে?", a: "হ্যাঁ! শাহেদ AI বাংলা ও ইংরেজি উভয় ভাষায় দক্ষ। বাংলায় প্রশ্ন করলে বাংলায় উত্তর পাবেন।" },
  { q: "ফ্রি প্ল্যানে কতটি বার্তা পাঠাতে পারব?", a: "ফ্রি প্ল্যানে প্রতিদিন ২০টি বার্তা পাঠাতে পারবেন। প্রো প্ল্যানে সীমাহীন বার্তা পাঠানো যাবে।" },
  { q: "আমার ডেটা কি নিরাপদ?", a: "আপনার কথোপকথন এনক্রিপ্টেড এবং সুরক্ষিত। আমরা তৃতীয় পক্ষের সাথে কোনো ডেটা শেয়ার করি না।" },
  { q: "কী ধরনের প্রশ্ন করতে পারব?", a: "পড়াশোনা, কোডিং, লেখালেখি, গবেষণা, অনুবাদ — যেকোনো বিষয়ে প্রশ্ন করুন। তবে অবৈধ বা ক্ষতিকর বিষয় নিষিদ্ধ।" },
  { q: "অ্যাকাউন্ট তৈরি করা কি বাধ্যতামূলক?", a: "হ্যাঁ, নিরাপত্তা ও ব্যক্তিগতকৃত অভিজ্ঞতার জন্য অ্যাকাউন্ট তৈরি করা প্রয়োজন।" },
];

export default function Index() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground font-bn">
      <SEO
        title="Shahed AI — বাংলা ভাষার আধুনিক AI সহকারী"
        description="Shahed AI বাংলায় AI চ্যাট, ছবি ও ভিডিও তৈরি, কোড ও লেখায় সহায়তা — দ্রুত, সঠিক এবং বিনামূল্যে। আজই বিনামূল্যে শুরু করুন।"
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">শাহেদ AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/auth"><Button variant="outline" size="sm">লগ ইন</Button></Link>
            <Link to="/auth?tab=signup"><Button size="sm" className="gradient-brand text-white shadow-brand border-0">শুরু করুন</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-16 md:py-44">
        <div className="absolute inset-0 gradient-hero opacity-5 dark:opacity-10" />
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="container relative text-center">
          <Badge className="mb-6 gradient-brand text-white border-0 px-5 py-2 text-sm font-medium tracking-wide">
            🇧🇩 বাংলাদেশিদের জন্য তৈরি AI সহকারী
          </Badge>
          <h1 className="mb-6 text-4xl md:text-7xl font-extrabold leading-tight tracking-tight">
            আপনার সেরা<br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-brand)" }}>
              বাংলা AI সঙ্গী
            </span>
          </h1>
          <p className="mb-4 max-w-2xl mx-auto text-xl md:text-2xl font-medium text-foreground/80">
            পড়াশোনা, চাকরি, ব্যবসা বা ব্যক্তিগত কাজ —
          </p>
          <p className="mb-10 max-w-xl mx-auto text-base md:text-lg text-muted-foreground">
            শাহেদ AI আপনার সব প্রশ্নের উত্তর দেয় বাংলায়, সেকেন্ডের মধ্যে। বিনামূল্যে শুরু করুন — কোনো ক্রেডিট কার্ড লাগবে না।
          </p>
          <div className="flex flex-wrap gap-4 justify-center mb-6">
            <Link to="/auth?tab=signup">
              <Button size="lg" className="gradient-brand text-white border-0 shadow-brand px-10 py-6 text-base font-semibold gap-2 rounded-xl">
                এখনই বিনামূল্যে শুরু করুন <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="px-8 py-6 text-base rounded-xl">লগ ইন করুন</Button>
            </Link>
          </div>
          <div className="flex flex-wrap gap-6 justify-center text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> প্রতিদিন ২০টি বিনামূল্যে বার্তা</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> কোনো ক্রেডিট কার্ড নেই</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> ৩০ সেকেন্ডে নিবন্ধন</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">কীভাবে কাজ করে?</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { n: "১", title: "অ্যাকাউন্ট তৈরি করুন", desc: "ইমেইল দিয়ে মাত্র ৩০ সেকেন্ডে নিবন্ধন করুন।" },
              { n: "২", title: "প্রশ্ন করুন", desc: "বাংলা বা ইংরেজিতে যেকোনো প্রশ্ন টাইপ করুন।" },
              { n: "৩", title: "উত্তর পান", desc: "সেকেন্ডের মধ্যে বিস্তারিত, নির্ভুল উত্তর পাবেন।" },
            ].map((s) => (
              <div key={s.n} className="text-center animate-fade-in">
                <div className="h-16 w-16 mx-auto mb-4 rounded-2xl gradient-brand flex items-center justify-center text-white text-2xl font-bold shadow-brand">{s.n}</div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-4">কেন শাহেদ AI?</h2>
          <p className="text-center text-muted-foreground mb-12">বাংলাদেশের প্রেক্ষাপটে তৈরি, আপনার প্রয়োজন মাথায় রেখে</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-card transition-all duration-300 animate-fade-in">
                <div className="h-12 w-12 mb-4 rounded-xl gradient-brand flex items-center justify-center shadow-brand group-hover:scale-110 transition-transform">
                  <f.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-4">মূল্য পরিকল্পনা</h2>
          <p className="text-center text-muted-foreground mb-12">আপনার প্রয়োজন অনুযায়ী প্ল্যান বেছে নিন</p>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free */}
            <div className="p-8 rounded-2xl border border-border bg-card">
              <h3 className="text-xl font-bold mb-1">ফ্রি</h3>
              <div className="text-4xl font-bold mb-6">৳০<span className="text-base font-normal text-muted-foreground">/মাস</span></div>
              <ul className="space-y-3 mb-8">
                {["প্রতিদিন ২০টি বার্তা", "কথোপকথনের ইতিহাস", "বাংলা ও ইংরেজি সাপোর্ট", "মার্কডাউন ফরম্যাটিং"].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />{f}</li>
                ))}
              </ul>
              <Link to="/auth?tab=signup"><Button className="w-full" variant="outline">বিনামূল্যে শুরু করুন</Button></Link>
            </div>
            {/* Pro */}
            <div className="p-8 rounded-2xl border-2 border-primary bg-card relative overflow-hidden">
              <div className="absolute top-4 right-4"><Badge className="gradient-brand text-white border-0">জনপ্রিয়</Badge></div>
              <h3 className="text-xl font-bold mb-1">প্রো</h3>
              <div className="text-4xl font-bold mb-6">৳৪৯৯<span className="text-base font-normal text-muted-foreground">/মাস</span></div>
              <ul className="space-y-3 mb-8">
                {["সীমাহীন বার্তা", "অগ্রাধিকার সাড়া", "উন্নত AI মডেল", "ডেডিকেটেড সাপোর্ট", "API অ্যাক্সেস (শীঘ্রই)"].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />{f}</li>
                ))}
              </ul>
              <Button className="w-full gradient-brand text-white border-0 shadow-brand">শীঘ্রই আসছে</Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="container max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">সাধারণ প্রশ্নাবলী</h2>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-xl px-4 overflow-hidden">
                <AccordionTrigger className="text-left font-medium">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 gradient-hero text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">আজই শুরু করুন</h2>
          <p className="text-white/70 mb-8 text-lg">বিনামূল্যে অ্যাকাউন্ট তৈরি করুন এবং AI-এর শক্তি অনুভব করুন</p>
          <Link to="/auth?tab=signup">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 px-10 font-semibold">
              বিনামূল্যে শুরু করুন →
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md gradient-brand flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-white" />
            </div>
            <span>শাহেদ AI © {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <Link to="/terms" className="hover:text-foreground transition-colors">শর্তাবলী</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">গোপনীয়তা</Link>
            <Link to="/setup" className="hover:text-foreground transition-colors">সেটআপ গাইড</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
