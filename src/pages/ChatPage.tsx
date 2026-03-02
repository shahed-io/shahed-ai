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
  Code, FileText, Globe, Lightbulb, ImageIcon, Paperclip
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Conversation { id: string; title: string; updated_at: string; }
interface Message { id: string; role: string; content: string; created_at: string; images?: string[]; }

// Content part for multimodal messages
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type LLMMessage = {
  role: string;
  content: string | ContentPart[];
};

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
  const [activeConvId, setActiveConvId] = useState<string | null>(convId ?? null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  // Image upload state
  const [pendingImages, setPendingImages] = useState<string[]>([]); // base64 data URLs
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const doSend = async (msg: string, skipUserInsert = false, imageUrls: string[] = []) => {
    if (!msg.trim() && imageUrls.length === 0 || streaming) return;

    let currentConvId = activeConvId;
    if (!currentConvId) {
      currentConvId = await createConversation(msg || "ছবি পাঠানো হয়েছে");
      if (!currentConvId) { toast({ title: "ত্রুটি", variant: "destructive" }); return; }
      setActiveConvId(currentConvId);
      navigate(`/chat/${currentConvId}`, { replace: true });
    }

    let userMsg: Message | null = null;
    if (!skipUserInsert) {
      userMsg = {
        id: Date.now().toString(),
        role: "user",
        content: msg,
        created_at: new Date().toISOString(),
        images: imageUrls.length > 0 ? imageUrls : undefined,
      };
      setMessages(prev => [...prev, userMsg!]);
      await saveMessage(currentConvId, "user", msg || "[ছবি]");
    }

    setStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const { data: { session } } = await supabase.auth.getSession();

      // Build LLM messages with potential images
      const allMsgs = skipUserInsert ? messages : [...messages, userMsg!];
      const history: LLMMessage[] = allMsgs.map(m => {
        if (m.images && m.images.length > 0) {
          const parts: ContentPart[] = [];
          if (m.content) parts.push({ type: "text", text: m.content });
          m.images.forEach(img => parts.push({ type: "image_url", image_url: { url: img } }));
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      });

      // If this send has new images, update the last user message content
      if (imageUrls.length > 0 && !skipUserInsert && history.length > 0) {
        const last = history[history.length - 1];
        if (last.role === "user") {
          const parts: ContentPart[] = [];
          if (msg) parts.push({ type: "text", text: msg });
          imageUrls.forEach(img => parts.push({ type: "image_url", image_url: { url: img } }));
          history[history.length - 1] = { role: "user", content: parts };
        }
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: history, conversationId: currentConvId }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
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
        const shortTitle = (msg || "ছবি সম্পর্কে প্রশ্ন").slice(0, 60);
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
    if (!msg && pendingImages.length === 0) return;
    setInput("");
    const imgs = [...pendingImages];
    setPendingImages([]);
    doSend(msg, false, imgs);
  };

  const handleStop = () => abortRef.current?.abort();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    files.forEach(file => {
      if (!file.type.startsWith("image/")) {
        toast({ title: "শুধু ছবি আপলোড করুন", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "ছবি ৫MB এর বেশি হওয়া যাবে না", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setPendingImages(prev => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  };

  const copyMsg = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const regenerate = async () => {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
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

          {/* Glassmorphism Logo */}
          <div className="flex items-center">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-sm select-none"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.2)",
                boxShadow: "0 4px 24px 0 rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              <span
                className="h-5 w-5 rounded-full flex-shrink-0 inline-block"
                style={{
                  background: "linear-gradient(135deg, #818cf8 0%, #6366f1 40%, #a78bfa 100%)",
                  boxShadow: "0 0 10px 3px rgba(99,102,241,0.55), 0 0 2px 1px rgba(167,139,250,0.4)",
                }}
              />
              <span
                style={{
                  background: "linear-gradient(90deg, #c7d2fe 0%, #a5b4fc 40%, #e0e7ff 80%, #818cf8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontFamily: "'Segoe UI', sans-serif",
                  letterSpacing: "0.03em",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                }}
              >
                Shahed AI
              </span>
            </div>
          </div>

          {/* Hidden DropdownMenu (keep for structure) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem className="font-bn">
                <Brain className="h-4 w-4 mr-2 text-primary" /> Shahed AI
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          {messages.length === 0 && !streaming ? (
            <div className="max-w-3xl mx-auto px-4 py-8">
              <div className="text-center mb-10">
                <div className="h-14 w-14 mx-auto mb-6 rounded-2xl gradient-brand flex items-center justify-center shadow-brand">
                  <Brain className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-2 font-bn">আজ আমি কীভাবে সাহায্য করতে পারি?</h1>
                <p className="text-muted-foreground text-sm font-bn">যেকোনো প্রশ্ন করুন, কোড লিখুন, বা ছবি বিশ্লেষণ করুন</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {SUGGESTED_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                    className="flex items-start gap-3 p-4 rounded-2xl border border-border hover:bg-muted transition-all text-left group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium font-bn">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-bn line-clamp-2">{prompt}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-4", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 mt-1">
                      <Brain className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={cn("group relative max-w-[80%]", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "user" ? (
                      <div>
                        {/* User images */}
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2 justify-end">
                            {msg.images.map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt="uploaded"
                                className="max-h-48 max-w-xs rounded-xl object-cover border border-border"
                              />
                            ))}
                          </div>
                        )}
                        {msg.content && (
                          editingMsgId === msg.id ? (
                            <div className="flex gap-2">
                              <textarea
                                value={editingMsgContent}
                                onChange={e => setEditingMsgContent(e.target.value)}
                                className="px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-sm outline-none resize-none font-bn min-w-[200px]"
                                rows={3}
                              />
                              <div className="flex flex-col gap-1">
                                <button onClick={saveEditedMessage} className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditingMsgId(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          ) : (
                            <div className="px-4 py-3 rounded-2xl bg-muted text-foreground text-sm font-bn whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          )
                        )}
                        {editingMsgId !== msg.id && msg.content && (
                          <div className="flex gap-1 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingMsgId(msg.id); setEditingMsgContent(msg.content); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                              {copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none font-bn">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                {copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>কপি করুন</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={regenerate} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>পুনরায় তৈরি করুন</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>ভালো লেগেছে</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                <ThumbsDown className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>ভালো লাগেনি</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1 text-sm font-bold">
                      {userName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming */}
              {streaming && streamingContent && (
                <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 mt-1">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <div className="max-w-[80%] text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none font-bn">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                    <span className="inline-block w-2 h-4 bg-foreground/70 ml-0.5 animate-pulse rounded-sm" />
                  </div>
                </div>
              )}
              {streaming && !streamingContent && (
                <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center flex-shrink-0">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex items-center gap-1 py-3">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            {/* Pending images preview */}
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative group/img">
                    <img
                      src={img}
                      alt="pending upload"
                      className="h-16 w-16 object-cover rounded-xl border border-border"
                    />
                    <button
                      onClick={() => removePendingImage(idx)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
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
                placeholder="Shahed AI-কে জিজ্ঞেস করুন..."
                className="w-full bg-transparent px-5 pt-4 pb-12 text-sm resize-none outline-none placeholder:text-muted-foreground font-bn min-h-[56px] max-h-[200px]"
                disabled={streaming}
                rows={1}
              />

              {/* Bottom toolbar */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2">
                <div className="flex items-center gap-1">
                  {/* Image upload button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={streaming}
                        className="p-1.5 rounded-lg hover:bg-background/60 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <ImageIcon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>ছবি আপলোড করুন</TooltipContent>
                  </Tooltip>

                  {/* Attachment button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={streaming}
                        className="p-1.5 rounded-lg hover:bg-background/60 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Paperclip className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>ফাইল সংযুক্ত করুন</TooltipContent>
                  </Tooltip>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>

                <div className="flex items-center gap-2">
                  {streaming ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleStop}
                          className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-all"
                        >
                          <Square className="h-4 w-4 fill-current" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>বন্ধ করুন</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleSend}
                          disabled={!input.trim() && pendingImages.length === 0}
                          className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center transition-all",
                            (input.trim() || pendingImages.length > 0)
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
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2 font-bn">
              Shahed AI ভুল তথ্য দিতে পারে। গুরুত্বপূর্ণ তথ্য যাচাই করুন।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
