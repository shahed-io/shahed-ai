import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  Plus, Search, Send, Copy, RotateCcw, Square, Trash2,
  LogOut, Moon, Sun, Brain, ChevronLeft, Menu, X, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface Conversation { id: string; title: string; updated_at: string; }
interface Message { id: string; role: string; content: string; created_at: string; }

const FREE_LIMIT = 20;

export default function ChatPage() {
  const { id: convId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dailyUsage, setDailyUsage] = useState(0);
  const [activeConvId, setActiveConvId] = useState<string | null>(convId ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
      .then(({ data }) => setConversations(data ?? []));
  }, [user]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("conversation_id", activeConvId).order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [activeConvId]);

  // Load daily usage
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    supabase.from("usage_daily").select("message_count").eq("user_id", user.id).eq("date", today).single()
      .then(({ data }) => setDailyUsage(data?.message_count ?? 0));
  }, [user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingContent]);

  const createConversation = async (firstMessage: string) => {
    const title = firstMessage.slice(0, 50) || "নতুন কথোপকথন";
    const { data, error } = await supabase.from("conversations").insert({ user_id: user!.id, title }).select().single();
    if (error || !data) return null;
    setConversations(prev => [data, ...prev]);
    return data.id;
  };

  const saveMessage = async (convId: string, role: string, content: string) => {
    const tokenEst = Math.ceil(content.length / 4);
    await supabase.from("messages").insert({ conversation_id: convId, user_id: user!.id, role, content, token_estimate: tokenEst });
  };

  const updateUsage = async () => {
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("usage_daily").upsert({ user_id: user!.id, date: today, message_count: dailyUsage + 1 }, { onConflict: "user_id,date" });
    setDailyUsage(prev => prev + 1);
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || streaming) return;

    if (dailyUsage >= FREE_LIMIT) {
      toast({
        title: "দৈনিক সীমা শেষ 😔",
        description: `আপনি আজ ${FREE_LIMIT}টি বার্তা পাঠিয়েছেন। আগামীকাল আবার চেষ্টা করুন বা প্রো প্ল্যানে আপগ্রেড করুন।`,
        variant: "destructive",
      });
      return;
    }

    setInput("");

    let currentConvId = activeConvId;
    if (!currentConvId) {
      currentConvId = await createConversation(msg);
      if (!currentConvId) { toast({ title: "ত্রুটি", variant: "destructive" }); return; }
      setActiveConvId(currentConvId);
      navigate(`/chat/${currentConvId}`, { replace: true });
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    await saveMessage(currentConvId, "user", msg);
    await updateUsage();

    setStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const { data: { session } } = await supabase.auth.getSession();
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history, conversationId: currentConvId }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        if (resp.status === 429) throw new Error("দৈনিক সীমা শেষ হয়েছে। আগামীকাল আবার চেষ্টা করুন।");
        throw new Error(err.error ?? "সার্ভার ত্রুটি");
      }

      if (!resp.body) throw new Error("No stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) { fullContent += chunk; setStreamingContent(fullContent); }
          } catch { /* partial */ }
        }
      }

      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: fullContent, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      await saveMessage(currentConvId, "assistant", fullContent);

      // Update conversation title if first message
      if (messages.length === 0) {
        const shortTitle = msg.slice(0, 60);
        await supabase.from("conversations").update({ title: shortTitle }).eq("id", currentConvId);
        setConversations(prev => prev.map(c => c.id === currentConvId ? { ...c, title: shortTitle } : c));
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const errMsg = (err as Error).message ?? "অজানা ত্রুটি";
      toast({ title: "ত্রুটি হয়েছে", description: errMsg, variant: "destructive" });
    } finally {
      setStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  };

  const handleStop = () => { abortRef.current?.abort(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const copyMsg = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "কপি করা হয়েছে!" });
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); navigate("/chat", { replace: true }); }
  };

  const filteredConvs = conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-300 shrink-0",
        sidebarOpen ? "w-72" : "w-0 overflow-hidden"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm font-bn">শাহেদ AI</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded hover:bg-sidebar-accent transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <Button onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }} className="w-full gradient-brand text-white border-0 gap-2 font-bn" size="sm">
            <Plus className="h-4 w-4" /> নতুন চ্যাট
          </Button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="খুঁজুন..." className="w-full pl-8 pr-3 py-2 text-sm bg-sidebar-accent rounded-lg border-0 outline-none placeholder:text-muted-foreground font-bn" />
          </div>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 py-2">
            {filteredConvs.map(conv => (
              <div key={conv.id} className={cn("group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-sidebar-accent transition-colors", activeConvId === conv.id && "bg-sidebar-accent")} onClick={() => { setActiveConvId(conv.id); navigate(`/chat/${conv.id}`); }}>
                <span className="flex-1 text-sm truncate font-bn">{conv.title}</span>
                <button onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {filteredConvs.length === 0 && <p className="text-center text-xs text-muted-foreground py-8 font-bn">কোনো চ্যাট নেই</p>}
          </div>
        </ScrollArea>

        {/* Bottom */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 font-bn">
              <span>আজকের ব্যবহার</span>
              <span>{dailyUsage}/{FREE_LIMIT}</span>
            </div>
            <div className="h-1.5 rounded-full bg-sidebar-accent overflow-hidden">
              <div className="h-full rounded-full gradient-brand transition-all" style={{ width: `${Math.min((dailyUsage / FREE_LIMIT) * 100, 100)}%` }} />
            </div>
          </div>
          {isAdmin && (
            <Link to="/admin">
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-sidebar-accent transition-colors font-bn">
                <Shield className="h-4 w-4 text-primary" /> অ্যাডমিন প্যানেল
              </button>
            </Link>
          )}
          <button onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-sidebar-accent transition-colors font-bn">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "লাইট মোড" : "ডার্ক মোড"}
          </button>
          <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-sidebar-accent transition-colors text-muted-foreground font-bn">
            <LogOut className="h-4 w-4" /> বের হন
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <Menu className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1">
            {activeConvId && <p className="text-sm font-medium font-bn truncate">{conversations.find(c => c.id === activeConvId)?.title ?? "কথোপকথন"}</p>}
          </div>
          <span className="text-xs text-muted-foreground font-bn">{user?.email}</span>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.length === 0 && !streaming && (
              <div className="text-center py-20 animate-fade-in">
                <div className="h-16 w-16 mx-auto mb-4 rounded-2xl gradient-brand flex items-center justify-center shadow-brand">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2 font-bn">শাহেদ AI-তে স্বাগতম!</h2>
                <p className="text-muted-foreground font-bn">আপনার প্রশ্ন করুন — বাংলা বা ইংরেজিতে</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={cn("group flex gap-3 animate-fade-in", msg.role === "user" && "flex-row-reverse")}>
                <div className={cn("h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold", msg.role === "user" ? "gradient-brand text-white" : "bg-muted text-muted-foreground")}>
                  {msg.role === "user" ? (user?.email?.[0]?.toUpperCase() ?? "U") : "AI"}
                </div>
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 relative", msg.role === "user" ? "bg-chat-user text-chat-user-foreground rounded-tr-sm" : "bg-chat-ai text-chat-ai-foreground border border-border rounded-tl-sm shadow-card")}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap font-bn">{msg.content}</p>
                  )}
                  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => copyMsg(msg.content)} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming message */}
            {streaming && (
              <div className="flex gap-3 animate-fade-in">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">AI</div>
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 bg-chat-ai text-chat-ai-foreground border border-border shadow-card">
                  {streamingContent ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded">
                      <ReactMarkdown>{streamingContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center h-5">
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto">
            {dailyUsage >= FREE_LIMIT && (
              <div className="mb-3 p-3 rounded-xl bg-destructive/10 text-destructive text-sm text-center font-bn">
                আজকের সীমা শেষ। আগামীকাল আবার চেষ্টা করুন বা প্রো প্ল্যানে যান।
              </div>
            )}
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="বাংলা বা ইংরেজিতে লিখুন... (Enter পাঠান, Shift+Enter নতুন লাইন)"
                className="flex-1 min-h-[52px] max-h-36 resize-none rounded-xl border-border bg-card font-bn text-sm"
                disabled={streaming || dailyUsage >= FREE_LIMIT}
              />
              {streaming ? (
                <Button onClick={handleStop} variant="destructive" size="icon" className="h-[52px] w-[52px] rounded-xl shrink-0">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSend} disabled={!input.trim() || dailyUsage >= FREE_LIMIT} className="h-[52px] w-[52px] rounded-xl shrink-0 gradient-brand text-white border-0 shadow-brand" size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground mt-2 font-bn">শাহেদ AI ভুল তথ্য দিতে পারে। গুরুত্বপূর্ণ বিষয়ে যাচাই করুন।</p>
          </div>
        </div>
      </div>
    </div>
  );
}
