import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, ArrowLeft, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CodeBlock({ code }: { code: string }) {
  const { toast } = useToast();
  return (
    <div className="relative group">
      <pre className="bg-muted rounded-xl p-4 text-sm font-mono overflow-x-auto border border-border">{code}</pre>
      <button onClick={() => { navigator.clipboard.writeText(code); toast({ title: "কপি করা হয়েছে!" }); }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-card border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-background font-bn">
      <header className="border-b border-border">
        <div className="container h-16 flex items-center gap-4">
          <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" /> হোম</Button></Link>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center"><Brain className="h-4 w-4 text-white" /></div>
            <span className="font-bold">শাহেদ AI — সেটআপ গাইড</span>
          </div>
        </div>
      </header>

      <div className="container max-w-3xl py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-bold mb-2">সেটআপ গাইড</h1>
          <p className="text-muted-foreground">শাহেদ AI প্রোডাকশনে ডিপ্লয় করার জন্য সম্পূর্ণ নির্দেশিকা</p>
        </div>

        {/* Step 1: LLM API Key */}
        <section className="p-6 rounded-2xl border border-border bg-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-sm">১</div>
            <h2 className="text-xl font-bold">LLM API কী সেট করুন</h2>
          </div>
          <p className="text-muted-foreground text-sm">Lovable Cloud-এর Secrets Manager-এ নিচের কী যোগ করুন:</p>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold mb-1">Secret নাম:</p>
              <CodeBlock code="LLM_API_KEY" />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">মান (OpenAI-compatible key):</p>
              <CodeBlock code="sk-your-api-key-here" />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">Base URL (ঐচ্ছিক, ডিফল্ট: OpenAI):</p>
              <CodeBlock code="LLM_BASE_URL = https://api.openai.com/v1" />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">মডেল (ঐচ্ছিক, ডিফল্ট: gpt-4o-mini):</p>
              <CodeBlock code="LLM_MODEL = gpt-4o-mini" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Cloud &gt; Settings &gt; Secrets থেকে এই secrets যোগ করুন।</p>
        </section>

        {/* Step 2: Admin user */}
        <section className="p-6 rounded-2xl border border-border bg-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-sm">২</div>
            <h2 className="text-xl font-bold">অ্যাডমিন ব্যবহারকারী তৈরি করুন</h2>
          </div>
          <p className="text-muted-foreground text-sm">প্রথমে সাইন আপ করুন। তারপর Cloud &gt; Database &gt; SQL Editor-এ নিচের কোড চালান:</p>
          <CodeBlock code={`-- আপনার ইমেইল দিয়ে admin@example.com রিপ্লেস করুন
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'admin@example.com';`} />
        </section>

        {/* Step 3: Custom domain */}
        <section className="p-6 rounded-2xl border border-border bg-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-sm">৩</div>
            <h2 className="text-xl font-bold">ai.shahedit.com কাস্টম ডোমেইন</h2>
          </div>
          <p className="text-muted-foreground text-sm">আপনার DNS প্রোভাইডারে নিচের রেকর্ড যোগ করুন:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">টাইপ</th>
                  <th className="text-left p-3">নাম</th>
                  <th className="text-left p-3">মান</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="p-3 font-mono">A</td>
                  <td className="p-3 font-mono">ai</td>
                  <td className="p-3 font-mono">185.158.133.1</td>
                </tr>
                <tr className="border-t border-border bg-muted/30">
                  <td className="p-3 font-mono">TXT</td>
                  <td className="p-3 font-mono">_lovable</td>
                  <td className="p-3 font-mono text-muted-foreground">lovable_verify=YOUR_CODE</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">তারপর Lovable-এ Project &gt; Settings &gt; Domains-এ <code className="bg-muted px-1.5 py-0.5 rounded">ai.shahedit.com</code> যোগ করুন।</p>
        </section>

        {/* Step 4: Publish */}
        <section className="p-6 rounded-2xl border border-border bg-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-sm">৪</div>
            <h2 className="text-xl font-bold">পাবলিশ করুন</h2>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>উপরের ডানদিকে "Publish" বাটনে ক্লিক করুন</li>
            <li>DNS প্রপাগেশনের জন্য ২-৪৮ ঘণ্টা অপেক্ষা করুন</li>
            <li>ai.shahedit.com ভিজিট করুন</li>
          </ol>
        </section>

        <div className="text-center">
          <Link to="/">
            <Button className="gradient-brand text-white border-0 shadow-brand">হোমে ফিরুন</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
