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
  Code, FileText, Globe, Lightbulb, ImageIcon, Paperclip,
  Zap, Cpu, Star, Mic, MicOff, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
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

// Available AI models
const AI_MODELS = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini Flash",
    label: "Fast",
    description: "দ্রুত ও সাশ্রয়ী — সাধারণ কাজে সেরা",
    icon: Zap,
    color: "text-blue-500",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini Pro",
    label: "Thinking",
    description: "জটিল বিশ্লেষণ ও যুক্তিতে শক্তিশালী",
    icon: Brain,
    color: "text-emerald-500",
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    label: "Next-Gen",
    description: "নতুন প্রজন্মের দ্রুত মডেল",
    icon: Sparkles,
    color: "text-cyan-500",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    label: "Pro",
    description: "সর্বোচ্চ মান — গণিত, কোড ও বিশ্লেষণ",
    icon: Star,
    color: "text-amber-500",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    label: "Balanced",
    description: "দ্রুত ও শক্তিশালী — দৈনন্দিন ব্যবহারে",
    icon: Cpu,
    color: "text-purple-500",
  },
];

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

// Modern Shahed AI Logo component
function ShahedLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = {
    sm: { outer: "h-8 w-8", inner: "h-7 w-7", radius: "rounded-xl" },
    md: { outer: "h-10 w-10", inner: "h-9 w-9", radius: "rounded-2xl" },
    lg: { outer: "h-16 w-16", inner: "h-14 w-14", radius: "rounded-3xl" },
  };
  const d = dims[size];
  return (
    <div className={cn("relative flex-shrink-0 flex items-center justify-center", d.outer)}>
      {/* Outer glow ring */}
      <div
        className={cn("absolute inset-0", d.radius)}
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)",
          padding: "1.5px",
          filter: "blur(0px)",
          boxShadow: "0 0 18px rgba(139,92,246,0.7), 0 0 40px rgba(99,102,241,0.3)",
        }}
      />
      {/* Inner glass surface */}
      <div
        className={cn("relative z-10 flex items-center justify-center", d.inner, d.radius)}
        style={{
          background: "linear-gradient(145deg, rgba(99,102,241,0.95) 0%, rgba(139,92,246,0.9) 50%, rgba(168,85,247,0.95) 100%)",
          backdropFilter: "blur(12px)",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -1px 1px rgba(0,0,0,0.15)",
        }}
      >
        {/* AI "S" neural node icon */}
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className={size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5"}
        >
          {/* Outer orbit ring */}
          <circle cx="16" cy="16" r="11" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          {/* Center node */}
          <circle cx="16" cy="16" r="4" fill="white" fillOpacity="0.95" />
          {/* Satellite nodes */}
          <circle cx="16" cy="5" r="2.2" fill="white" fillOpacity="0.9" />
          <circle cx="26" cy="22" r="2.2" fill="white" fillOpacity="0.9" />
          <circle cx="6" cy="22" r="2.2" fill="white" fillOpacity="0.9" />
          {/* Connecting lines */}
          <line x1="16" y1="12" x2="16" y2="7.2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="19.5" y1="18.5" x2="24.1" y2="20.9" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="12.5" y1="18.5" x2="7.9" y2="20.9" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />
          {/* Sparkle dot */}
          <circle cx="23" cy="9" r="1.2" fill="white" fillOpacity="0.6" />
        </svg>
      </div>
      {/* Animated pulse ring */}
      <div
        className={cn("absolute inset-[-3px]", d.radius, "animate-ping opacity-20")}
        style={{ background: "linear-gradient(135deg, #6366f1, #a78bfa)", filter: "blur(3px)" }}
      />
    </div>
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "ব্যবহারকারী";
  const greeting = `হ্যালো, ${userName}`;

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
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
      if (!file.type.startsWith("image/")) { toast({ title: "শুধু ছবি আপলোড করুন", variant: "destructive" }); return; }
      if (file.size > 5 * 1024 * 1024) { toast({ title: "ছবি ৫MB এর বেশি হওয়া যাবে না", variant: "destructive" }); return; }
      const reader = new FileReader();
      reader.onload = (ev) => { const dataUrl = ev.target?.result as string; setPendingImages(prev => [...prev, dataUrl]); };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (idx: number) => setPendingImages(prev => prev.filter((_, i) => i !== idx));

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

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "ভয়েস সাপোর্ট নেই", description: "আপনার ব্রাউজার ভয়েস ইনপুট সাপোর্ট করে না।", variant: "destructive" });
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "bn-BD";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col bg-sidebar transition-all duration-300 shrink-0 relative",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
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
                          <button onClick={e => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }} className="p-1 rounded hover:bg-sidebar-border transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id); }} className="p-1 rounded hover:bg-sidebar-border hover:text-destructive transition-colors">
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

        <div className="p-3 border-t border-sidebar-border space-y-2">
          {conversations.length > 0 && (
            <button
              onClick={() => setClearAllOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-bn"
            >
              <Trash2 className="h-4 w-4" />
              সব চ্যাট মুছুন
            </button>
          )}
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
        <div className="h-14 flex items-center px-4 gap-3 shrink-0 border-b border-border/50">
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
                  <button onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <Pencil className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>নতুন চ্যাট</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Modern Logo */}
          <div className="flex items-center gap-2.5">
            <ShahedLogo size="sm" />
            <span
              className="font-bold text-base select-none"
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "0.02em",
              }}
            >
              Shahed AI
            </span>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          {messages.length === 0 && !streaming ? (
            /* Welcome Screen — Gemini style */
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-12">
              <div className="w-full max-w-2xl">
                {/* Greeting */}
                <div className="mb-10 text-center">
                  <div className="flex justify-center mb-5">
                    <ShahedLogo size="lg" />
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <h1 className="text-3xl font-bold font-bn" style={{ background: "linear-gradient(135deg, #6366f1, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                      {greeting}
                    </h1>
                  </div>
                  <p className="text-xl text-muted-foreground font-bn">আজ কীভাবে শুরু করবো?</p>
                </div>

                {/* Suggestion chips */}
                <div className="grid grid-cols-2 gap-3">
                  {SUGGESTED_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                      className="flex items-start gap-3 p-4 rounded-2xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group shadow-sm hover:shadow-md"
                    >
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold font-bn mb-0.5">{label}</p>
                        <p className="text-xs text-muted-foreground font-bn line-clamp-2">{prompt}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-4", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <ShahedLogo size="sm" />
                  )}
                  <div className={cn("group relative max-w-[80%]", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "user" ? (
                      <div>
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2 justify-end">
                            {msg.images.map((img, idx) => (
                              <img key={idx} src={img} alt="uploaded" className="max-h-48 max-w-xs rounded-xl object-cover border border-border" />
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
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1 text-sm font-bold text-primary">
                      {userName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              ))}

              {streaming && streamingContent && (
                <div className="flex gap-4 justify-start">
                  <ShahedLogo size="sm" />
                  <div className="max-w-[80%] text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none font-bn">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                    <span className="inline-block w-2 h-4 bg-foreground/70 ml-0.5 animate-pulse rounded-sm" />
                  </div>
                </div>
              )}
              {streaming && !streamingContent && (
                <div className="flex gap-4 justify-start">
                  <ShahedLogo size="sm" />
                  <div className="flex items-center gap-1 py-3">
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="px-4 pb-4 pt-2">
          <div className="max-w-2xl mx-auto">
            {/* Pending images */}
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative group/img">
                    <img src={img} alt="pending" className="h-16 w-16 object-cover rounded-xl border border-border" />
                    <button onClick={() => removePendingImage(idx)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input box */}
            <div className="relative bg-background rounded-3xl border border-border shadow-lg hover:shadow-xl transition-shadow" style={{ boxShadow: "0 2px 20px rgba(99,102,241,0.08)" }}>
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
                className="w-full bg-transparent px-5 pt-4 pb-14 text-sm resize-none outline-none placeholder:text-muted-foreground font-bn min-h-[60px] max-h-[200px]"
                disabled={streaming}
                rows={1}
              />

              {/* Bottom toolbar */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2">
                <div className="flex items-center gap-1">
                  {/* Image upload */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => fileInputRef.current?.click()} disabled={streaming} className="p-1.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <ImageIcon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>ছবি আপলোড করুন</TooltipContent>
                  </Tooltip>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />

                  {/* Model selector — Gemini style */}
                  <div className="relative">
                    <button
                      onClick={() => setModelPickerOpen(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-muted transition-colors text-sm font-medium border border-border/60 hover:border-border"
                    >
                      <selectedModel.icon className={cn("h-3.5 w-3.5", selectedModel.color)} />
                      <span className="font-bn text-xs">{selectedModel.name}</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>

                    {/* Model picker dropdown */}
                    {modelPickerOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setModelPickerOpen(false)} />
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
                          <div className="px-3 py-2 border-b border-border">
                            <p className="text-xs font-semibold text-muted-foreground font-bn">Shahed AI</p>
                          </div>
                          {AI_MODELS.map(model => {
                            const Icon = model.icon;
                            const isSelected = selectedModel.id === model.id;
                            return (
                              <button
                                key={model.id}
                                onClick={() => { setSelectedModel(model); setModelPickerOpen(false); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left",
                                  isSelected && "bg-primary/10"
                                )}
                              >
                                <Icon className={cn("h-4 w-4 flex-shrink-0", model.color)} />
                                <div className="flex-1">
                                  <p className="text-sm font-semibold font-bn">{model.name}</p>
                                  <p className="text-xs text-muted-foreground font-bn">{model.description}</p>
                                </div>
                                {isSelected && (
                                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                    <Check className="h-3 w-3 text-white" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {streaming ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={handleStop} className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-all">
                          <Square className="h-4 w-4 fill-current" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>বন্ধ করুন</TooltipContent>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={toggleVoice}
                            disabled={streaming}
                            className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center transition-all",
                              isListening
                                ? "bg-destructive text-destructive-foreground shadow-md animate-pulse"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{isListening ? "থামুন" : "ভয়েস ইনপুট"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={handleSend}
                            disabled={!input.trim() && pendingImages.length === 0}
                            className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center transition-all",
                              (input.trim() || pendingImages.length > 0)
                                ? "bg-primary text-primary-foreground hover:opacity-90 shadow-md"
                                : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>পাঠান (Enter)</TooltipContent>
                      </Tooltip>
                    </>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-bn">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              চ্যাট ডিলিট করবেন?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-bn">
              এই কথোপকথনটি স্থায়ীভাবে মুছে যাবে। এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bn">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteConfirmId) { deleteConversation(deleteConfirmId); setDeleteConfirmId(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bn"
            >
              হ্যাঁ, ডিলিট করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Confirmation Dialog */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-bn">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              সব চ্যাট মুছে ফেলবেন?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-bn">
              আপনার সমস্ত কথোপকথন স্থায়ীভাবে মুছে যাবে। এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bn">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const ids = conversations.map(c => c.id);
                await supabase.from("conversations").delete().in("id", ids);
                setConversations([]);
                setActiveConvId(null);
                setMessages([]);
                navigate("/chat", { replace: true });
                setClearAllOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bn"
            >
              হ্যাঁ, সব মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
