import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { cn } from "@/lib/utils";

interface Message { id: string; role: string; content: string; created_at: string; }
interface Conversation { id: string; title: string; created_at: string; }

function ShahedLogo() {
  return (
    <div className="relative h-8 w-8 flex-shrink-0">
      <div className="absolute inset-0 rounded-xl" style={{ background: "linear-gradient(135deg,rgba(99,102,241,.85),rgba(139,92,246,.9),rgba(167,139,250,.8))", border: "1px solid rgba(255,255,255,.25)", boxShadow: "0 4px 16px rgba(99,102,241,.4)" }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
          <path d="M11 10L6 16L11 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 10L26 16L21 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 9L14 23" stroke="rgba(255,255,255,.7)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export default function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: convData } = await supabase
        .from("conversations")
        .select("id, title, created_at")
        .eq("share_token", token)
        .single();
      if (!convData) { setNotFound(true); setLoading(false); return; }
      setConv(convData);
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", convData.id)
        .order("created_at", { ascending: true });
      setMessages(msgs ?? []);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background text-center p-8">
      <h2 className="text-2xl font-bold font-bn">চ্যাটটি পাওয়া যায়নি</h2>
      <p className="text-muted-foreground font-bn">এই শেয়ার লিংকটি আর বৈধ নয়।</p>
      <Link to="/chat" className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bn hover:bg-primary/90 transition-colors">নতুন চ্যাট শুরু করুন</Link>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShahedLogo />
          <div>
            <p className="text-xs text-muted-foreground font-bn">শেয়ার করা কথোপকথন</p>
            <h1 className="text-sm font-semibold font-bn truncate max-w-xs md:max-w-md">{conv?.title}</h1>
          </div>
        </div>
        <Link to="/chat" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bn hover:bg-primary/90 transition-colors">
          নতুন চ্যাট
        </Link>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && <ShahedLogo />}
            <div className={cn("max-w-[80%]", msg.role === "user" ? "px-4 py-3 rounded-2xl bg-muted text-foreground text-sm font-bn whitespace-pre-wrap" : "")}>
              {msg.role === "assistant" ? <MarkdownRenderer content={msg.content} /> : msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center py-8 text-xs text-muted-foreground font-bn">
        Shahed AI দ্বারা তৈরি
      </div>
    </div>
  );
}
