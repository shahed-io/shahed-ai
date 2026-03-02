import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  Plus, Search, Send, Copy, RotateCcw, Square, Trash2,
  LogOut, Moon, Sun, Brain, ChevronLeft, Menu, Shield,
  Pencil, Check, X, Sparkles, ThumbsUp, ThumbsDown, 
  PanelLeftOpen, MessageSquare, Settings, ChevronDown,
  Code, FileText, Globe, Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Conversation { id: string; title: string; updated_at: string; }
interface Message { id: string; role: string; content: string; created_at: string; }

const FREE_LIMIT = 20;

const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, label: "ব্যাখ্যা করুন", prompt: "কোয়ান্টাম কম্পিউটিং কী এবং এটি কীভাবে কাজ করে সহজভাবে বুঝিয়ে দিন" },
  { icon: Code, label: "কোড লিখুন", prompt: "Python এ একটি সিম্পল ক্যালকুলেটর প্রোগ্রাম লিখুন" },
  { icon: FileText, label: "লেখালেখি", prompt: "বাংলাদেশের প্রকৃতি নিয়ে একটি সুন্দর অনুচ্ছেদ লিখুন" },
  { icon: Globe, label: "অনুবাদ", prompt: "এই বাক্যটি ইংরেজিতে অনুবাদ করুন: আমি বাংলাদেশকে ভালোবাসি" },
];

function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const last7 = new Date(today); last7.setDate(last7.getDate() - 7);
  const last30 = new Date(today); last30.setDate(last30.getDate() - 30);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "আজ", items: [] },
    { label: "গতকাল", items: [] },
    { label: "গত ৭ দিন", items: [] },
    { label: "গত ৩০ দিন", items: [] },
    { label: "আরও আগে", items: [] },
  ];

  conversations.forEach(c => {
    const d = new Date(c.updated_at);
    if (d >= today) groups[0].items.push(c);
    else if (d >= yesterday) groups[1].items.push(c);
    else if (d >= last7) groups[2].items.push(c);
    else if (d >= last30) groups[3].items.push(c);
    else groups[4].items.push(c);
  });

  return groups.filter(g => g.items.length > 0);
}

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
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
      .then(({ data }) => setConversations(data ?? []));
  }, [user]);

  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("conversation_id", activeConvId).order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [activeConvId]);

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

  const doSend = async (msg: string, skipUserInsert = false) => {
    if (!msg || streaming) return;
    if (dailyUsage >= FREE_LIMIT) {
      toast({ title: "দৈনিক সীমা শেষ 😔", description: `আপনি আজ ${FREE_LIMIT}টি বার্তা পাঠিয়েছেন। আগামীকাল আবার চেষ্টা করুন।`, variant: "destructive" });
      return;
    }

    let currentConvId = activeConvId;
    if (!currentConvId) {
      currentConvId = await createConversation(msg);
      if (!currentConvId) { toast({ title: "ত্রুটি", variant: "destructive" }); return; }
      setActiveConvId(currentConvId);
      navigate(`/chat/${currentConvId}`, { replace: true });
    }

    let userMsg: Message | null = null;
    if (!skipUserInsert) {
      userMsg = { id: Date.now().toString(), role: "user", content: msg, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, userMsg!]);
      await saveMessage(currentConvId, "user", msg);
    }
    await updateUsage();
    setStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const { data: { session } } = await supabase.auth.getSession();
      const allMsgs = skipUserInsert ? messages : [...messages, userMsg!];
      const history = allMsgs.map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
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
      let buffer = ""; let fullContent = "";

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

      if (messages.length === 0 && !skipUserInsert) {
        const shortTitle = msg.slice(0, 60);
        await supabase.from("conversations").update({ title: shortTitle }).eq("id", currentConvId);
        setConversations(prev => prev.map(c => c.id === currentConvId ? { ...c, title: shortTitle } : c));
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      toast({ title: "ত্রুটি হয়েছে", description: (err as Error).message ?? "অজানা ত্রুটি", variant: "destructive" });
    } finally {
      setStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    doSend(msg);
  };

  const handleStop = () => abortRef.current?.abort();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const copyMsg = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const regenerate = async () => {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    // Remove last assistant message from UI
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === "assistant");
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== realIdx);
    });
    await doSend(lastUser.content, true);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); navigate("/chat", { replace: true }); }
  };

  const renameConversation = async (id: string) => {
    if (!editingTitle.trim()) { setEditingConvId(null); return; }
    await supabase.from("conversations").update({ title: editingTitle }).eq("id", id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: editingTitle } : c));
    setEditingConvId(null);
  };

  const saveEditedMessage = async () => {
    if (!editingMsgId || !editingMsgContent.trim()) return;
    setMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, content: editingMsgContent } : m));
    await supabase.from("messages").update({ content: editingMsgContent }).eq("id", editingMsgId);
    setEditingMsgId(null);
    // Resend from this message
    await doSend(editingMsgContent, true);
  };

  const filteredConvs = conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const groupedConvs = groupConversationsByDate(filteredConvs);
  const userName = user?.email?.split("@")[0] ?? "ব্যবহারকারী";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col bg-sidebar transition-all duration-300 shrink-0 relative",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3 h-14">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <PanelLeftOpen className="h-5 w-5 text-sidebar-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent>সাইডবার বন্ধ করুন</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }}
                className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
              >
                <Pencil className="h-5 w-5 text-sidebar-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent>নতুন চ্যাট</TooltipContent>
          </Tooltip>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="চ্যাট খুঁজুন"
              className="w-full pl-9 pr-3 py-2 text-sm bg-sidebar-accent/60 rounded-lg border-0 outline-none placeholder:text-muted-foreground font-bn"
            />
          </div>
        </div>

        {/* Conversations */}
        <ScrollArea className="flex-1 px-2">
          {groupedConvs.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8 font-bn">কোনো চ্যাট নেই</p>
          ) : (
            groupedConvs.map(group => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground font-bn">{group.label}</p>
                {group.items.map(conv => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-sidebar-accent transition-colors text-sm",
                      activeConvId === conv.id && "bg-sidebar-accent"
                    )}
                    onClick={() => { setActiveConvId(conv.id); navigate(`/chat/${conv.id}`); }}
                  >
                    {editingConvId === conv.id ? (
                      <div className="flex-1 flex items-center gap-1">
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") renameConversation(conv.id); if (e.key === "Escape") setEditingConvId(null); }}
                          className="flex-1 bg-transparent border-b border-primary outline-none text-sm font-bn"
                          onClick={e => e.stopPropagation()}
                        />
                        <button onClick={e => { e.stopPropagation(); renameConversation(conv.id); }} className="p-0.5 hover:text-primary"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); setEditingConvId(null); }} className="p-0.5 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 truncate font-bn">{conv.title}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }}
                            className="p-1 rounded hover:bg-sidebar-border transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                            className="p-1 rounded hover:bg-sidebar-border hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
          <div className="h-4" />
        </ScrollArea>

        {/* Sidebar Footer - User */}
        <div className="p-3 border-t border-sidebar-border">
          {/* Usage bar */}
          <div className="px-2 py-2 mb-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 font-bn">
              <span>আজকের ব্যবহার</span>
              <span>{dailyUsage}/{FREE_LIMIT}</span>
            </div>
            <div className="h-1 rounded-full bg-sidebar-accent overflow-hidden">
              <div className="h-full rounded-full gradient-brand transition-all" style={{ width: `${Math.min((dailyUsage / FREE_LIMIT) * 100, 100)}%` }} />
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {userName[0]?.toUpperCase()}
                </div>
                <span className="flex-1 text-left text-sm font-medium truncate font-bn">{userName}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 mb-1">
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="flex items-center gap-2 font-bn">
                    <Shield className="h-4 w-4 text-primary" /> অ্যাডমিন প্যানেল
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggle} className="font-bn">
                {theme === "dark" ? <><Sun className="h-4 w-4 mr-2" /> লাইট মোড</> : <><Moon className="h-4 w-4 mr-2" /> ডার্ক মোড</>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-destructive font-bn">
                <LogOut className="h-4 w-4 mr-2" /> বের হন
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <div className="h-14 flex items-center px-3 gap-2 shrink-0">
          {!sidebarOpen && (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <PanelLeftOpen className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>সাইডবার খুলুন</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>নতুন চ্যাট</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Model selector - ChatGPT style */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors font-semibold text-sm">
                শাহেদ AI <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem className="font-bn">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">শাহেদ AI</p>
                    <p className="text-xs text-muted-foreground">GPT-4o মিনি · দ্রুত</p>
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {messages.length === 0 && !streaming ? (
              /* Welcome / Empty state - ChatGPT style */
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
                <div className="h-14 w-14 mx-auto mb-6 rounded-2xl gradient-brand flex items-center justify-center shadow-brand">
                  <Brain className="h-7 w-7 text-white" />
                </div>
                <h2 className="text-3xl font-bold mb-2 font-bn">আমি কীভাবে সাহায্য করতে পারি?</h2>
                <p className="text-muted-foreground mb-10 font-bn">বাংলা বা ইংরেজিতে যেকোনো প্রশ্ন করুন</p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                  {SUGGESTED_PROMPTS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => { setInput(s.prompt); textareaRef.current?.focus(); }}
                      className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/50 text-left transition-all group"
                    >
                      <div className="mt-0.5 shrink-0">
                        <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="text-sm font-medium font-bn">{s.label}</p>
                        <p className="text-xs text-muted-foreground font-bn line-clamp-2 mt-0.5">{s.prompt}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                {messages.map((msg, idx) => (
                  <div key={msg.id} className={cn("group py-5", msg.role === "assistant" && "")}>
                    {msg.role === "user" ? (
                      /* User message - right aligned like ChatGPT */
                      <div className="flex justify-end">
                        <div className="max-w-[75%] relative">
                          {editingMsgId === msg.id ? (
                            <div className="flex flex-col gap-2">
                              <textarea
                                autoFocus
                                value={editingMsgContent}
                                onChange={e => setEditingMsgContent(e.target.value)}
                                className="w-full bg-muted rounded-2xl px-4 py-3 text-sm resize-none outline-none border border-primary font-bn"
                                rows={3}
                              />
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setEditingMsgId(null)} className="font-bn">বাতিল</Button>
                                <Button size="sm" onClick={saveEditedMessage} className="gradient-brand text-white border-0 font-bn">পাঠান</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted rounded-3xl px-4 py-3 text-sm whitespace-pre-wrap font-bn">
                              {msg.content}
                            </div>
                          )}
                          {editingMsgId !== msg.id && (
                            <div className="flex gap-1 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => { setEditingMsgId(msg.id); setEditingMsgContent(msg.content); }}
                                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>সম্পাদনা করুন</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                    {copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>কপি করুন</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Assistant message - left aligned, no bubble */
                      <div className="flex gap-4">
                        <div className="h-8 w-8 shrink-0 rounded-full gradient-brand flex items-center justify-center mt-0.5">
                          <Brain className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
                            [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto
                            [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:text-sm
                            [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_ul]:list-disc [&_ol]:list-decimal
                          ">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          {/* Action buttons */}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                  {copiedMsgId === msg.id ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>কপি করুন</TooltipContent>
                            </Tooltip>
                            {idx === messages.length - 1 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={regenerate} disabled={streaming} className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40">
                                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>পুনরায় তৈরি করুন</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                  <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>ভালো উত্তর</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                  <ThumbsDown className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>খারাপ উত্তর</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming */}
                {streaming && (
                  <div className="py-5 flex gap-4 animate-fade-in">
                    <div className="h-8 w-8 shrink-0 rounded-full gradient-brand flex items-center justify-center mt-0.5">
                      <Brain className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {streamingContent ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
                          [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto
                          [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:rounded
                        ">
                          <ReactMarkdown>{streamingContent}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex gap-1 items-center h-6 mt-1">
                          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input area - ChatGPT style */}
        <div className="px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            {dailyUsage >= FREE_LIMIT && (
              <div className="mb-3 p-3 rounded-xl bg-destructive/10 text-destructive text-sm text-center font-bn">
                আজকের সীমা শেষ। আগামীকাল আবার চেষ্টা করুন।
              </div>
            )}
            <div className="relative bg-muted rounded-3xl border border-border shadow-sm hover:shadow-md transition-shadow">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="শাহেদ AI-কে জিজ্ঞেস করুন..."
                className="w-full bg-transparent px-5 pt-4 pb-12 text-sm resize-none outline-none placeholder:text-muted-foreground font-bn min-h-[56px] max-h-[200px]"
                disabled={streaming || dailyUsage >= FREE_LIMIT}
                rows={1}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {streaming ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleStop}
                        className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-opacity"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>থামান</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleSend}
                        disabled={!input.trim() || dailyUsage >= FREE_LIMIT}
                        className={cn(
                          "h-9 w-9 rounded-full flex items-center justify-center transition-all",
                          input.trim() && dailyUsage < FREE_LIMIT
                            ? "bg-foreground text-background hover:opacity-80"
                            : "bg-muted-foreground/30 text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>পাঠান</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-2 font-bn">
              শাহেদ AI ভুল তথ্য দিতে পারে। গুরুত্বপূর্ণ বিষয়ে যাচাই করুন।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
