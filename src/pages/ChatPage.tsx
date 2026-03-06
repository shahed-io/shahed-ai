import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
  Plus, Search, Send, Copy, RotateCcw, Square, Trash2,
  LogOut, Moon, Sun, Brain, Shield,
  Pencil, Check, X, Sparkles, ThumbsUp, ThumbsDown,
  MessageSquare, ChevronDown,
  Code, FileText, Globe, Lightbulb, ImageIcon,
  Zap, Cpu, Star, Mic, MicOff, AlertTriangle, MoreHorizontal, Pin, Share2,
  History, Compass, LayoutGrid, TrendingUp, Settings, Bell,
  ArrowUp, Paperclip, StopCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import VoiceChatModal from "@/components/VoiceChatModal";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Conversation { id: string; title: string; updated_at: string; }
interface Message { id: string; role: string; content: string; created_at: string; images?: string[]; }

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type LLMMessage = {
  role: string;
  content: string | ContentPart[];
};

const AI_MODELS = [
  { id: "google/gemini-2.5-flash", name: "Gemini Flash", label: "Fast", description: "দ্রুত ও সাশ্রয়ী", icon: Zap, color: "text-blue-500" },
  { id: "google/gemini-2.5-pro", name: "Gemini Pro", label: "Thinking", description: "জটিল বিশ্লেষণে", icon: Brain, color: "text-emerald-500" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash", label: "Next-Gen", description: "পরবর্তী প্রজন্ম", icon: Sparkles, color: "text-cyan-500" },
  { id: "openai/gpt-5", name: "GPT-5", label: "Pro", description: "সর্বোচ্চ মান", icon: Star, color: "text-amber-500" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", label: "Balanced", description: "দৈনন্দিন ব্যবহারে", icon: Cpu, color: "text-purple-500" },
];

const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, label: "ব্যাখ্যা করুন", prompt: "কোয়ান্টাম কম্পিউটিং কীভাবে কাজ করে সহজভাবে বুঝিয়ে দিন" },
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

// Minimal waveform icon for voice button
function WaveformIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="2" y="9" width="2" height="6" rx="1"/>
      <rect x="6" y="5" width="2" height="14" rx="1"/>
      <rect x="10" y="7" width="2" height="10" rx="1"/>
      <rect x="14" y="3" width="2" height="18" rx="1"/>
      <rect x="18" y="6" width="2" height="12" rx="1"/>
      <rect x="22" y="9" width="2" height="6" rx="1"/>
    </svg>
  );
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
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<"home" | "history" | "discover" | "spaces">("home");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const isGuest = !user;
  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "অতিথি";

  useEffect(() => {
    if (!user) { setConversations([]); return; }
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
    if (isGuest) return null;
    const title = firstMessage.slice(0, 50) || "নতুন কথোপকথন";
    const { data, error } = await supabase.from("conversations").insert({ user_id: user!.id, title }).select().single();
    if (error || !data) return null;
    setConversations(prev => [data, ...prev]);
    return data.id;
  };

  const saveMessage = async (convId: string, role: string, content: string) => {
    if (isGuest) return;
    const tokenEst = Math.ceil(content.length / 4);
    await supabase.from("messages").insert({ conversation_id: convId, user_id: user!.id, role, content, token_estimate: tokenEst });
  };

  const doSend = async (msg: string, skipUserInsert = false, imageUrls: string[] = []) => {
    if (!msg.trim() && imageUrls.length === 0 || streaming) return;

    let currentConvId = activeConvId;
    if (!currentConvId) {
      if (!isGuest) {
        currentConvId = await createConversation(msg || "ছবি পাঠানো হয়েছে");
        if (!currentConvId) { toast({ title: "ত্রুটি", variant: "destructive" }); return; }
        setActiveConvId(currentConvId);
        navigate(`/chat/${currentConvId}`, { replace: true });
      } else {
        currentConvId = "guest-" + Date.now();
        setActiveConvId(currentConvId);
      }
    }

    let userMsg: Message | null = null;
    if (!skipUserInsert) {
      userMsg = { id: Date.now().toString(), role: "user", content: msg, created_at: new Date().toISOString(), images: imageUrls.length > 0 ? imageUrls : undefined };
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
      const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ messages: history, conversationId: currentConvId, model: selectedModel.id }),
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

      const cleanedContent = fullContent.replace(/([A-Za-z0-9])\s*।/g, "$1");
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: cleanedContent, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      await saveMessage(currentConvId, "assistant", cleanedContent);

      if (messages.length === 0 && !skipUserInsert && !isGuest) {
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
    files.forEach(file => {
      if (!file.type.startsWith("image/")) { toast({ title: "শুধু ছবি আপলোড করুন", variant: "destructive" }); return; }
      if (file.size > 5 * 1024 * 1024) { toast({ title: "ছবি ৫MB এর বেশি", variant: "destructive" }); return; }
      const reader = new FileReader();
      reader.onload = (ev) => setPendingImages(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      return prev.filter((_, i) => i !== prev.length - 1 - idx);
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

  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "ভয়েস সাপোর্ট নেই", variant: "destructive" }); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const recognition = new SR();
    recognition.lang = "bn-BD"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results as SpeechRecognitionResultList).map((r: any) => r[0].transcript).join("");
      setInput(t);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const filteredConvs = conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const groupedConvs = groupConversationsByDate(filteredConvs);
  const isEmptyChat = messages.length === 0 && !streaming;

  // ── NAV items (left icon strip - Perplexity style)
  const NAV_ITEMS = [
    { id: "home", icon: MessageSquare, label: "হোম", action: () => { setActiveNav("home"); setActiveConvId(null); setMessages([]); navigate("/chat"); } },
    { id: "history", icon: History, label: "হিস্ট্রি", action: () => setActiveNav("history") },
    { id: "discover", icon: Compass, label: "ডিসকভার", action: () => setActiveNav("discover") },
    { id: "spaces", icon: LayoutGrid, label: "স্পেসেস", action: () => setActiveNav("spaces") },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* ── LEFT NARROW NAV (Perplexity-style icon strip) ── */}
      <div
        className={cn(
          "flex flex-col items-center py-4 gap-1 shrink-0 border-r border-border z-40",
          "transition-all duration-300",
          sidebarOpen ? "w-14 md:w-14" : "w-14"
        )}
        style={{ background: "hsl(var(--background))" }}
      >
        {/* Logo */}
        <div className="mb-4 mt-1 flex items-center justify-center">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: "hsl(var(--foreground))" }}
          >
            <WaveformIcon className="h-4 w-4" style={{ color: "hsl(var(--background))" }} />
          </div>
        </div>

        {/* Nav icons */}
        <div className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={item.action}
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-all hover:bg-muted",
                      activeNav === item.id && "bg-muted"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", activeNav === item.id ? "text-foreground" : "text-muted-foreground")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Bottom nav actions */}
        <div className="flex flex-col gap-1 mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <Pencil className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">নতুন থ্রেড</TooltipContent>
          </Tooltip>

          {!isGuest && (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted transition-all">
                      <div className="h-7 w-7 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold">
                        {userName[0]?.toUpperCase()}
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="end" className="w-52 mb-1">
                    <div className="px-3 py-2 border-b border-border mb-1">
                      <p className="font-semibold text-sm font-bn truncate">{userName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="flex items-center gap-2 font-bn"><Shield className="h-4 w-4 text-primary" /> অ্যাডমিন প্যানেল</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={toggle} className="font-bn">
                      {theme === "dark" ? <><Sun className="h-4 w-4 mr-2" /> লাইট মোড</> : <><Moon className="h-4 w-4 mr-2" /> ডার্ক মোড</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setClearAllOpen(true)} className="font-bn text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> সব চ্যাট মুছুন
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={signOut} className="text-destructive font-bn"><LogOut className="h-4 w-4 mr-2" /> লগআউট</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent side="right">প্রোফাইল</TooltipContent>
            </Tooltip>
          )}

          {isGuest && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/auth">
                  <button className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                    <LogOut className="h-4.5 w-4.5" />
                  </button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">লগইন</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── SIDE PANEL (conversation list - expands/collapses) ── */}
      <>
        {sidebarOpen && (
          <div
            className="hidden md:flex flex-col w-64 border-r border-border shrink-0"
            style={{ background: "hsl(var(--background))" }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-border/50">
              <span className="text-sm font-semibold font-bn">চ্যাট হিস্ট্রি</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search bar */}
            <div className="px-3 py-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="চ্যাট খুঁজুন"
                  className="w-full pl-8 pr-3 py-2 text-sm bg-muted/50 rounded-lg border border-border/50 outline-none placeholder:text-muted-foreground font-bn focus:border-border"
                />
              </div>
            </div>

            {/* Conversation list */}
            <ScrollArea className="flex-1 px-2">
              {groupedConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground font-bn">কোনো চ্যাট নেই</p>
                </div>
              ) : (
                groupedConvs.map(group => (
                  <div key={group.label} className="mb-4">
                    <p className="px-3 py-1 text-[11px] font-medium text-muted-foreground/70 font-bn uppercase tracking-wide">{group.label}</p>
                    {group.items.map(conv => (
                      <div
                        key={conv.id}
                        className={cn(
                          "group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors text-sm",
                          activeConvId === conv.id && "bg-muted"
                        )}
                        onClick={() => { setActiveConvId(conv.id); navigate(`/chat/${conv.id}`); }}
                      >
                        {editingConvId === conv.id ? (
                          <div className="flex-1 flex items-center gap-1">
                            <input
                              autoFocus value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") renameConversation(conv.id); if (e.key === "Escape") setEditingConvId(null); }}
                              className="flex-1 bg-transparent border-b border-primary outline-none text-sm font-bn"
                              onClick={e => e.stopPropagation()}
                            />
                            <button onClick={e => { e.stopPropagation(); renameConversation(conv.id); }}><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={e => { e.stopPropagation(); setEditingConvId(null); }}><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 truncate font-bn text-sm text-foreground/80">{conv.title}</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button onClick={e => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-muted-foreground/10 transition-all">
                                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }} className="font-bn gap-2"><Pencil className="h-3.5 w-3.5" /> রিনেম</DropdownMenuItem>
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id); }} className="font-bn gap-2 text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5" /> ডিলিট</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div className="h-4" />
            </ScrollArea>
          </div>
        )}
      </>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Top bar */}
        <div className="h-14 flex items-center px-4 gap-3 shrink-0 border-b border-border/40">
          {/* Sidebar toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarOpen(v => !v)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Search className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{sidebarOpen ? "পাশ বার বন্ধ" : "পাশ বার খুলুন"}</TooltipContent>
          </Tooltip>

          {/* Model selector — Perplexity style (subtle, left-aligned) */}
          <DropdownMenu open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors group text-sm">
                <selectedModel.icon className={cn("h-3.5 w-3.5", selectedModel.color)} />
                <span className="font-medium text-foreground/80">{selectedModel.name}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 p-1 rounded-xl shadow-xl">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-xs font-semibold text-muted-foreground font-bn">AI মডেল</p>
              </div>
              {AI_MODELS.map(model => {
                const Icon = model.icon;
                const isSelected = selectedModel.id === model.id;
                return (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => { setSelectedModel(model); setModelPickerOpen(false); }}
                    className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer", isSelected && "bg-muted")}
                  >
                    <Icon className={cn("h-4 w-4 flex-shrink-0", model.color)} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold font-bn">{model.name}</p>
                      <p className="text-xs text-muted-foreground font-bn">{model.description}</p>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {isGuest ? (
              <Link to="/auth">
                <button className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors font-bn">লগইন</button>
              </Link>
            ) : (
              <button
                onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground font-bn"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">নতুন</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Messages / Welcome ── */}
        <ScrollArea className="flex-1">
          {isEmptyChat ? (
            /* ── PERPLEXITY-STYLE WELCOME ── */
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
              <div className="w-full max-w-2xl">
                {/* Greeting */}
                <div className="text-center mb-10">
                  <h1 className="text-3xl md:text-4xl font-bold font-bn mb-2 text-foreground">
                    {isGuest ? "শাহেদ AI তে স্বাগতম" : `হ্যালো, ${userName}`}
                  </h1>
                  <p className="text-muted-foreground font-bn">আজ আপনাকে কীভাবে সাহায্য করতে পারি?</p>
                </div>

                {/* Main input (Perplexity center style) */}
                <div
                  className="rounded-2xl border border-border bg-muted/30 shadow-sm hover:shadow-md transition-shadow mb-8"
                >
                  {pendingImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pt-3">
                      {pendingImages.map((img, idx) => (
                        <div key={idx} className="relative group/img">
                          <img src={img} alt="pending" className="h-14 w-14 object-cover rounded-xl border border-border" />
                          <button onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2 px-4 py-3">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => {
                        setInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="যেকোনো কিছু জিজ্ঞেস করুন..."
                      className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground font-bn min-h-[28px] max-h-[180px] leading-relaxed py-1"
                      rows={1}
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 pb-3">
                    <div className="flex items-center gap-1">
                      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => fileInputRef.current?.click()} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <Paperclip className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>ছবি যোগ করুন</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={toggleVoice} className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-colors", isListening ? "text-destructive bg-destructive/10 animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>ভয়েস ইনপুট</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Live voice button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setVoiceChatOpen(true)}
                            className="h-8 w-8 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                            style={{ background: "hsl(var(--foreground))" }}
                          >
                            <WaveformIcon className="h-3.5 w-3.5" style={{ color: "hsl(var(--background))" }} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>লাইভ ভয়েস চ্যাট</TooltipContent>
                      </Tooltip>
                      {/* Send */}
                      <button
                        onClick={handleSend}
                        disabled={!input.trim() && pendingImages.length === 0}
                        className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center transition-all",
                          input.trim() || pendingImages.length > 0
                            ? "bg-foreground text-background hover:opacity-80"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Suggested prompts (Perplexity style chips) */}
                <div className="grid grid-cols-2 gap-2">
                  {SUGGESTED_PROMPTS.map((p, i) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => { setInput(p.prompt); setTimeout(() => textareaRef.current?.focus(), 0); }}
                        className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/50 transition-all text-left group"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                        <span className="text-sm font-bn text-muted-foreground group-hover:text-foreground transition-colors">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ── MESSAGES ── */
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-4">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "hsl(var(--foreground))" }}>
                      <WaveformIcon className="h-3.5 w-3.5" style={{ color: "hsl(var(--background))" }} />
                    </div>
                  )}
                  <div className={cn("group relative max-w-[85%]")}>
                    {msg.role === "user" ? (
                      <div>
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2 justify-end">
                            {msg.images.map((img, idx) => (
                              <img key={idx} src={img} alt="uploaded" className="max-h-48 rounded-xl object-cover border border-border" />
                            ))}
                          </div>
                        )}
                        {msg.content && (
                          editingMsgId === msg.id ? (
                            <div className="flex gap-2">
                              <textarea value={editingMsgContent} onChange={e => setEditingMsgContent(e.target.value)} className="px-4 py-3 rounded-2xl bg-muted text-foreground text-sm outline-none resize-none font-bn min-w-[200px]" rows={3} />
                              <div className="flex flex-col gap-1">
                                <button onClick={saveEditedMessage} className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditingMsgId(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          ) : (
                            <div className="px-4 py-3 rounded-2xl bg-muted text-foreground text-sm font-bn whitespace-pre-wrap">{msg.content}</div>
                          )
                        )}
                        {editingMsgId !== msg.id && msg.content && (
                          <div className="flex gap-1 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingMsgId(msg.id); setEditingMsgContent(msg.content); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                            <button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">{copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <MarkdownRenderer content={msg.content} />
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip><TooltipTrigger asChild><button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">{copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button></TooltipTrigger><TooltipContent>কপি</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><button onClick={regenerate} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /></button></TooltipTrigger><TooltipContent>পুনরায়</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><button className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ThumbsUp className="h-3.5 w-3.5 text-muted-foreground" /></button></TooltipTrigger><TooltipContent>ভালো লেগেছে</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><button className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ThumbsDown className="h-3.5 w-3.5 text-muted-foreground" /></button></TooltipTrigger><TooltipContent>ভালো লাগেনি</TooltipContent></Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-primary">{userName[0]?.toUpperCase()}</div>
                  )}
                </div>
              ))}

              {streaming && streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "hsl(var(--foreground))" }}>
                    <WaveformIcon className="h-3.5 w-3.5" style={{ color: "hsl(var(--background))" }} />
                  </div>
                  <div className="max-w-[85%]">
                    <MarkdownRenderer content={streamingContent} />
                    <span className="inline-block w-1.5 h-4 bg-foreground/50 ml-0.5 animate-pulse rounded-sm" />
                  </div>
                </div>
              )}
              {streaming && !streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "hsl(var(--foreground))" }}>
                    <WaveformIcon className="h-3.5 w-3.5" style={{ color: "hsl(var(--background))" }} />
                  </div>
                  <div className="flex items-center gap-1.5 py-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "240ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* ── BOTTOM INPUT (when in conversation) ── */}
        {!isEmptyChat && (
          <div className="px-4 pb-5 pt-3 shrink-0 border-t border-border/30">
            <div className="max-w-3xl mx-auto">
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingImages.map((img, idx) => (
                    <div key={idx} className="relative group/img">
                      <img src={img} alt="pending" className="h-12 w-12 object-cover rounded-lg border border-border" />
                      <button onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"><X className="h-2.5 w-2.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 focus-within:border-primary/40 transition-colors shadow-sm">
                <div className="flex items-center gap-1 flex-shrink-0 self-end mb-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => fileInputRef.current?.click()} disabled={streaming} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>ছবি</TooltipContent>
                  </Tooltip>
                </div>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="ফলো-আপ প্রশ্ন করুন..."
                  className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground font-bn min-h-[28px] max-h-[160px] leading-relaxed py-0.5"
                  disabled={streaming}
                  rows={1}
                />

                <div className="flex items-center gap-1.5 flex-shrink-0 self-end mb-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={toggleVoice} disabled={streaming} className={cn("h-7 w-7 rounded-lg flex items-center justify-center transition-colors", isListening ? "text-destructive bg-destructive/10 animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                        {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>ভয়েস</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setVoiceChatOpen(true)}
                        disabled={streaming}
                        className="h-7 w-7 rounded-full flex items-center justify-center transition-all hover:scale-105"
                        style={{ background: "hsl(var(--foreground))" }}
                      >
                        <WaveformIcon className="h-3 w-3" style={{ color: "hsl(var(--background))" }} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>লাইভ ভয়েস</TooltipContent>
                  </Tooltip>

                  {streaming ? (
                    <button onClick={handleStop} className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-all">
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() && pendingImages.length === 0}
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center transition-all",
                        input.trim() || pendingImages.length > 0
                          ? "bg-foreground text-background hover:opacity-80"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-center text-[11px] text-muted-foreground/60 font-bn mt-2 hidden sm:block">
                Shahed AI ভুল করতে পারে — গুরুত্বপূর্ণ তথ্য যাচাই করুন
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Voice Modal */}
      <VoiceChatModal
        open={voiceChatOpen}
        onClose={() => setVoiceChatOpen(false)}
        selectedModelId={selectedModel.id}
        conversationHistory={messages.map(m => ({ role: m.role, content: m.content }))}
        onAIResponse={(text) => {
          const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: text, created_at: new Date().toISOString() };
          setMessages(prev => [...prev, aiMsg]);
          if (activeConvId && !activeConvId.startsWith("guest-")) saveMessage(activeConvId, "assistant", text);
        }}
        userToken={null}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-bn"><AlertTriangle className="h-5 w-5 text-destructive" /> চ্যাট ডিলিট করবেন?</AlertDialogTitle>
            <AlertDialogDescription className="font-bn">এই কথোপকথনটি স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bn">বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) { deleteConversation(deleteConfirmId); setDeleteConfirmId(null); } }} className="bg-destructive text-destructive-foreground font-bn">ডিলিট করুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-bn"><AlertTriangle className="h-5 w-5 text-destructive" /> সব চ্যাট মুছবেন?</AlertDialogTitle>
            <AlertDialogDescription className="font-bn">সমস্ত কথোপকথন স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bn">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const ids = conversations.map(c => c.id);
                await supabase.from("conversations").delete().in("id", ids);
                setConversations([]); setActiveConvId(null); setMessages([]);
                navigate("/chat", { replace: true }); setClearAllOpen(false);
              }}
              className="bg-destructive text-destructive-foreground font-bn"
            >সব মুছুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
