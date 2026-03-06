import { useState, useEffect, useRef, useCallback, DragEvent, ClipboardEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import CodeBlock from "@/components/CodeBlock";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
  Plus, Search, Send, Copy, RotateCcw, Square, Trash2,
  LogOut, Moon, Sun, Brain, ChevronLeft, Menu, Shield,
  Pencil, Check, X, Sparkles, ThumbsUp, ThumbsDown,
  PanelLeftOpen, MessageSquare, Settings, ChevronDown,
  Code, FileText, Globe, Lightbulb, ImageIcon, Paperclip,
  Zap, Cpu, Star, Mic, MicOff, AlertTriangle, MoreHorizontal, Pin, Archive, Share2, Phone,
  Camera, Upload, UserCircle2, FolderPlus, Folder, Download, Link as LinkIcon
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

interface Folder { id: string; name: string; color: string; }
interface Conversation { id: string; title: string; updated_at: string; pinned?: boolean; folder_id?: string | null; share_token?: string | null; }
interface Message { id: string; role: string; content: string; created_at: string; images?: string[]; generatedImage?: string; isStreaming?: boolean; isGeneratingImage?: boolean; }

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type LLMMessage = {
  role: string;
  content: string | ContentPart[];
};

// Available AI models — Shahed AI-5 is default (fastest, Gemini+ChatGPT hybrid)
const AI_MODELS = [
  {
    id: "shahed-ai-5",
    name: "Shahed AI-5",
    label: "Ultra",
    description: "Gemini + ChatGPT — সবচেয়ে দ্রুত, দুটি AI একসাথে",
    icon: Zap,
    color: "text-primary",
    badge: "দ্রুত",
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    label: "Fast",
    description: "নতুন প্রজন্মের দ্রুত Gemini মডেল",
    icon: Sparkles,
    color: "text-primary",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini Flash",
    label: "Fast",
    description: "দ্রুত ও সাশ্রয়ী — সাধারণ কাজে সেরা",
    icon: Zap,
    color: "text-primary",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini Pro",
    label: "Thinking",
    description: "জটিল বিশ্লেষণ ও যুক্তিতে শক্তিশালী",
    icon: Brain,
    color: "text-primary",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    label: "Pro",
    description: "সর্বোচ্চ মান — গণিত, কোড ও বিশ্লেষণ",
    icon: Star,
    color: "text-primary",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    label: "Balanced",
    description: "দ্রুত ও শক্তিশালী — দৈনন্দিন ব্যবহারে",
    icon: Cpu,
    color: "text-primary",
  },
];

const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, label: "ব্যাখ্যা করুন", prompt: "কোয়ান্টাম কম্পিউটিং কী এবং এটি কীভাবে কাজ করে সহজভাবে বুঝিয়ে দিন" },
  { icon: Code, label: "কোড লিখুন", prompt: "Python এ একটি সিম্পল ক্যালকুলেটর প্রোগ্রাম লিখুন" },
  { icon: FileText, label: "লেখালেখি", prompt: "বাংলাদেশের প্রকৃতি নিয়ে একটি সুন্দর অনুচ্ছেদ লিখুন" },
  { icon: Globe, label: "অনুবাদ", prompt: "এই বাক্যটি ইংরেজিতে অনুবাদ করুন: আমি বাংলাদেশকে ভালোবাসি" },
];

const CAPABILITY_TABS = [
  { key: "ai", label: "🤖 AI বুদ্ধিমত্তা" },
  { key: "productivity", label: "⚡ উৎপাদনশীলতা" },
  { key: "image", label: "🎨 ছবি তৈরি" },
  { key: "web", label: "🌐 ওয়েব সার্চ" },
];

const AI_CAPABILITIES: Record<string, Array<{ icon: string; label: string; desc: string; prompt: string }>> = {
  ai: [
    { icon: "💬", label: "প্রশ্নোত্তর", desc: "যেকোনো প্রশ্নের সঠিক উত্তর", prompt: "ব্ল্যাকহোল কীভাবে তৈরি হয়?" },
    { icon: "🧠", label: "ধারণা ব্যাখ্যা", desc: "কঠিন বিষয় সহজে বোঝানো", prompt: "Blockchain কী? সহজ ভাষায় ব্যাখ্যা করো" },
    { icon: "💡", label: "আইডিয়া তৈরি", desc: "নতুন আইডিয়া ও ব্রেইনস্টর্ম", prompt: "একটি মোবাইল অ্যাপ স্টার্টআপের জন্য ১০টি ব্যবসায়িক আইডিয়া দাও" },
    { icon: "✍️", label: "সৃজনশীল লেখা", desc: "গল্প, কবিতা, স্ক্রিপ্ট লেখা", prompt: "বৃষ্টির রাতে একা বাড়ি ফেরার গল্প লিখো" },
    { icon: "📝", label: "সারসংক্ষেপ", desc: "দীর্ঘ টেক্সট সংক্ষিপ্ত করা", prompt: "নিচের লেখাটি ৫ পয়েন্টে সংক্ষিপ্ত করো: [তোমার টেক্সট পেস্ট করো]" },
    { icon: "🌐", label: "অনুবাদ", desc: "বহু ভাষায় নির্ভুল অনুবাদ", prompt: "এই বাক্যটি আরবি, হিন্দি ও ফরাসিতে অনুবাদ করো: আমি তোমাকে ভালোবাসি" },
    { icon: "✅", label: "ব্যাকরণ সংশোধন", desc: "লেখার ভুল সংশোধন করা", prompt: "এই বাক্যটির ব্যাকরণ ঠিক করো: I are going to the market yesterday" },
    { icon: "🔄", label: "পুনর্লিখন", desc: "টেক্সট নতুনভাবে উপস্থাপন", prompt: "এই বাক্যটি আরও আনুষ্ঠানিক ও পেশাদার ভাবে পুনর্লিখন করো: আমার কাজটা দেরি হয়ে গেছে" },
  ],
  productivity: [
    { icon: "📧", label: "ইমেইল লেখা", desc: "পেশাদার ইমেইল তৈরি", prompt: "আমার ম্যানেজারকে একটি পেশাদার ইমেইল লিখো বিষয়: আগামীকাল ছুটির আবেদন। টোন হবে বিনম্র ও আনুষ্ঠানিক।" },
    { icon: "📰", label: "ব্লগ লেখা", desc: "SEO-বান্ধব ব্লগ পোস্ট", prompt: "বাংলায় 'কৃত্রিম বুদ্ধিমত্তা ও ভবিষ্যৎ কর্মসংস্থান' বিষয়ে একটি আকর্ষণীয় ব্লগ পোস্ট লিখো। ভূমিকা, মূল পয়েন্ট ও উপসংহার সহ।" },
    { icon: "📱", label: "সোশ্যাল মিডিয়া", desc: "ক্যাপশন ও পোস্ট আইডিয়া", prompt: "আমার নতুন পণ্য লঞ্চের জন্য Instagram ও Facebook-এর জন্য ৫টি আকর্ষণীয় ক্যাপশন লিখো। প্রতিটিতে ইমোজি ও হ্যাশট্যাগ থাকবে।" },
    { icon: "🗓️", label: "মিটিং সারসংক্ষেপ", desc: "মিটিং নোট সংক্ষিপ্ত করা", prompt: "নিচের মিটিং নোটগুলো সংক্ষিপ্ত করো এবং কী সিদ্ধান্ত হয়েছে ও পরবর্তী পদক্ষেপ কী সেটি আলাদাভাবে লিখো:\n[এখানে মিটিং নোট পেস্ট করো]" },
    { icon: "🎯", label: "কাজের পরিকল্পনা", desc: "প্রজেক্ট ও টাস্ক প্ল্যানিং", prompt: "আমার একটি ওয়েবসাইট বানানোর প্রজেক্ট আছে। ৩০ দিনের বিস্তারিত কাজের পরিকল্পনা তৈরি করো — প্রতিটি সপ্তাহের লক্ষ্য ও দৈনিক কাজ সহ।" },
    { icon: "☑️", label: "To-Do লিস্ট", desc: "দৈনিক ও সাপ্তাহিক তালিকা", prompt: "আমার আজকের দিনের জন্য একটি প্রোডাক্টিভ To-Do লিস্ট তৈরি করো। কাজগুলো হলো: পড়াশোনা, ব্যায়াম, রান্না, কোডিং। অগ্রাধিকার অনুযায়ী সাজাও।" },
    { icon: "📊", label: "রিপোর্ট লেখা", desc: "পেশাদার রিপোর্ট তৈরি", prompt: "আমার টিমের মাসিক পারফরম্যান্স রিপোর্ট লেখার একটি টেমপ্লেট তৈরি করো যাতে KPI, অর্জন, চ্যালেঞ্জ ও পরবর্তী মাসের লক্ষ্য থাকবে।" },
    { icon: "💼", label: "CV / কভার লেটার", desc: "পেশাদার আবেদনপত্র", prompt: "Software Developer পদের জন্য একটি আকর্ষণীয় কভার লেটার লিখো। আমার দক্ষতা: React, Python, ৩ বছরের অভিজ্ঞতা।" },
  ],
  image: [
    { icon: "🌅", label: "প্রকৃতির ছবি", desc: "সুন্দর প্রাকৃতিক দৃশ্য", prompt: "A breathtaking sunset over the Sundarbans mangrove forest in Bangladesh, golden light reflecting on calm water, ultra-realistic" },
    { icon: "🏙️", label: "শহরের দৃশ্য", desc: "নগর ও স্থাপত্য", prompt: "Dhaka city at night, neon lights, busy streets, modern skyscrapers mixed with old architecture, cinematic photography" },
    { icon: "👤", label: "পোর্ট্রেইট", desc: "মানুষের ছবি ও আর্ট", prompt: "A beautiful portrait of a Bengali woman in traditional saree, soft natural lighting, professional photography, detailed" },
    { icon: "🎨", label: "শিল্পকর্ম", desc: "ডিজিটাল আর্ট ও ইলাস্ট্রেশন", prompt: "A vibrant digital art illustration of a Bengali village scene with rice fields, coconut trees and a river, watercolor style" },
    { icon: "🚀", label: "ভবিষ্যৎ দৃশ্য", desc: "সাই-ফাই ও ফিউচারিস্টিক", prompt: "Futuristic smart city of Bangladesh in 2100, flying vehicles, solar panels, green technology, highly detailed" },
    { icon: "🐾", label: "প্রাণী", desc: "পশুপাখি ও বন্যপ্রাণী", prompt: "A majestic Royal Bengal Tiger in the Sundarbans forest, dramatic lighting, National Geographic style photography" },
    { icon: "🍛", label: "খাবার", desc: "সুস্বাদু খাবারের ছবি", prompt: "Traditional Bengali food spread - biryani, hilsa fish curry, mishti doi, served on banana leaf, professional food photography" },
    { icon: "✏️", label: "কাস্টম", desc: "নিজের বর্ণনা লিখুন", prompt: "" },
  ],
  web: [
    { icon: "📰", label: "সর্বশেষ খবর", desc: "আজকের গুরুত্বপূর্ণ খবর", prompt: "আজকের বাংলাদেশের সবচেয়ে গুরুত্বপূর্ণ খবরগুলো কী?" },
    { icon: "💹", label: "বাজার বিশ্লেষণ", desc: "শেয়ার ও ক্রিপ্টো তথ্য", prompt: "আজকের Bitcoin এবং প্রধান ক্রিপ্টোকারেন্সির বাজার পরিস্থিতি কেমন?" },
    { icon: "🔬", label: "গভীর গবেষণা", desc: "বিস্তারিত তথ্য সংগ্রহ", prompt: "কৃত্রিম বুদ্ধিমত্তার সর্বশেষ উন্নতি ও ২০২৫ সালের সেরা AI মডেলগুলো কী কী?" },
    { icon: "✅", label: "তথ্য যাচাই", desc: "সত্যতা পরীক্ষা করুন", prompt: "এই তথ্যটি কি সত্য এবং এর সূত্র কী: [আপনার তথ্য এখানে লিখুন]" },
    { icon: "🏥", label: "স্বাস্থ্য তথ্য", desc: "সর্বশেষ চিকিৎসা গবেষণা", prompt: "ডায়াবেটিস নিয়ন্ত্রণে সর্বশেষ গবেষণা ও পরামর্শ কী?" },
    { icon: "🌍", label: "আন্তর্জাতিক", desc: "বিশ্ব রাজনীতি ও ঘটনা", prompt: "বিশ্বের সর্বশেষ ভূরাজনৈতিক পরিস্থিতি এবং বাংলাদেশের উপর এর প্রভাব কী?" },
    { icon: "💡", label: "প্রযুক্তি সংবাদ", desc: "টেক দুনিয়ার আপডেট", prompt: "এই সপ্তাহের সবচেয়ে গুরুত্বপূর্ণ প্রযুক্তি সংবাদগুলো কী কী?" },
    { icon: "📚", label: "শিক্ষা গবেষণা", desc: "একাডেমিক তথ্য ও উৎস", prompt: "জলবায়ু পরিবর্তনের সর্বশেষ বৈজ্ঞানিক গবেষণা ও তথ্য কী বলছে?" },
  ],
};


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

// Modern Shahed AI Logo component — coding support icon
function ShahedLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = {
    sm: { outer: "h-8 w-8", radius: "rounded-xl" },
    md: { outer: "h-10 w-10", radius: "rounded-2xl" },
    lg: { outer: "h-14 w-14", radius: "rounded-2xl" },
  };
  const d = dims[size];
  return (
    <div className={cn("relative flex-shrink-0", d.outer)}>
      <div
        className={cn("absolute inset-0", d.radius)}
        style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.85) 0%, rgba(139,92,246,0.9) 50%, rgba(167,139,250,0.8) 100%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.25)",
          boxShadow: "0 4px 16px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"
          className={cn(size === "lg" ? "w-7 h-7" : size === "md" ? "w-5 h-5" : "w-4 h-4")}>
          <path d="M11 10L6 16L11 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.95"/>
          <path d="M21 10L26 16L21 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.95"/>
          <path d="M18 9L14 23" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConvId, setActiveConvId] = useState<string | null>(convId ?? null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]); // default: Gemini 3 Flash (fastest)
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Folder state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [assignFolderConvId, setAssignFolderConvId] = useState<string | null>(null);
  // Shortcuts help
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Capability tab
  const [capTab, setCapTab] = useState<"ai" | "productivity" | "image" | "web">("ai");
  // Image generation
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  // Web search mode
  const [webSearchMode, setWebSearchMode] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const isGuest = !user;
  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "অতিথি";
  const greeting = isGuest ? "শাহেদ AI তে স্বাগতম" : `হ্যালো, ${userName}`;

  useEffect(() => {
    if (!user) { setConversations([]); return; }
    supabase.from("conversations").select("*").eq("user_id", user.id).order("pinned", { ascending: false }).order("updated_at", { ascending: false })
      .then(({ data }) => setConversations(data ?? []));
  }, [user]);

  useEffect(() => {
    if (!user) { setFolders([]); return; }
    supabase.from("folders").select("*").eq("user_id", user.id).order("created_at", { ascending: true })
      .then(({ data }) => setFolders((data ?? []) as Folder[]));
  }, [user]);

  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("conversation_id", activeConvId).order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [activeConvId]);

  // Load user's avatar from profiles
  useEffect(() => {
    if (!user) { setAvatarUrl(null); return; }
    supabase.from("profiles").select("avatar_url").eq("id", user.id).single()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null));
  }, [user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";

      // Ctrl/Cmd + N → New chat
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setActiveConvId(null); setMessages([]); navigate("/chat");
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
      // Ctrl/Cmd + B → Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen(v => !v);
      }
      // Ctrl/Cmd + / → Focus search in sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setSidebarOpen(true);
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="চ্যাট খুঁজুন"]');
        setTimeout(() => searchInput?.focus(), 150);
      }
      // Ctrl/Cmd + K → Focus chat input
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      // Esc → Stop streaming / close modals
      if (e.key === "Escape") {
        if (streaming) { abortRef.current?.abort(); return; }
      }
      // ? → Show shortcuts (not in input)
      if (e.key === "?" && !inInput) {
        e.preventDefault();
        setShortcutsOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [streaming, navigate]);

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

  const STREAMING_ID = "__streaming__";

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

    // Add empty streaming placeholder immediately
    setMessages(prev => [...prev, {
      id: STREAMING_ID,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      isStreaming: true,
    }]);
    setStreaming(true);

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
            if (chunk) {
              fullContent += chunk;
              // Live update the streaming message token by token
              setMessages(prev => prev.map(m =>
                m.id === STREAMING_ID ? { ...m, content: fullContent } : m
              ));
            }
          } catch { /* partial */ }
        }
      }

      // Finalize: clean content, remove streaming flag, assign real id
      const cleanedContent = fullContent.replace(/([A-Za-z0-9])\s*।/g, "$1");
      const finalId = (Date.now() + 1).toString();
      setMessages(prev => prev.map(m =>
        m.id === STREAMING_ID
          ? { id: finalId, role: "assistant", content: cleanedContent, created_at: new Date().toISOString(), isStreaming: false }
          : m
      ));
      await saveMessage(currentConvId, "assistant", cleanedContent);

      if (messages.length === 0 && !skipUserInsert && !isGuest) {
        const shortTitle = (msg || "ছবি সম্পর্কে প্রশ্ন").slice(0, 60);
        await supabase.from("conversations").update({ title: shortTitle }).eq("id", currentConvId);
        setConversations(prev => prev.map(c => c.id === currentConvId ? { ...c, title: shortTitle } : c));
      }
    } catch (err: unknown) {
      // Remove streaming placeholder on error
      setMessages(prev => prev.filter(m => m.id !== STREAMING_ID));
      if ((err as Error).name === "AbortError") return;
      toast({ title: "ত্রুটি হয়েছে", description: (err as Error).message ?? "অজানা ত্রুটি", variant: "destructive" });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg && pendingImages.length === 0) return;
    setInput("");
    const imgs = [...pendingImages];
    setPendingImages([]);
    if (webSearchMode) {
      doWebSearch(msg);
    } else {
      doSend(msg, false, imgs);
    }
  };

  // ── Image Generation ─────────────────────────────────────────────────────
  const generateImage = async (prompt: string) => {
    if (!prompt.trim() || isGeneratingImage) return;

    let currentConvId = activeConvId;
    if (!currentConvId) {
      if (!isGuest) {
        currentConvId = await createConversation(prompt);
        if (!currentConvId) { toast({ title: "ত্রুটি", variant: "destructive" }); return; }
        setActiveConvId(currentConvId);
        navigate(`/chat/${currentConvId}`, { replace: true });
      } else {
        currentConvId = "guest-" + Date.now();
        setActiveConvId(currentConvId);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: `🎨 ছবি তৈরি করুন: ${prompt}`,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    const placeholderId = "__imggen__";
    setMessages(prev => [...prev, {
      id: placeholderId,
      role: "assistant",
      content: "ছবি তৈরি হচ্ছে...",
      created_at: new Date().toISOString(),
      isGeneratingImage: true,
    }]);
    setIsGeneratingImage(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const IMG_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`;

      const resp = await fetch(IMG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ prompt }),
      });

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error ?? "ছবি তৈরি ব্যর্থ");

      const finalId = (Date.now() + 1).toString();
      setMessages(prev => prev.map(m =>
        m.id === placeholderId
          ? { id: finalId, role: "assistant", content: data.text || "✅ ছবি তৈরি হয়েছে!", created_at: new Date().toISOString(), generatedImage: data.imageUrl, isGeneratingImage: false }
          : m
      ));
      if (currentConvId && !currentConvId.startsWith("guest-")) {
        await saveMessage(currentConvId, "assistant", `[Generated Image] ${data.text || ""}`);
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== placeholderId));
      toast({ title: "ছবি তৈরি ব্যর্থ", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // ── Web Search ────────────────────────────────────────────────────────────
  const doWebSearch = async (query: string) => {
    if (!query.trim() || streaming) return;

    let currentConvId = activeConvId;
    if (!currentConvId) {
      if (!isGuest) {
        currentConvId = await createConversation(query);
        if (!currentConvId) { toast({ title: "ত্রুটি", variant: "destructive" }); return; }
        setActiveConvId(currentConvId);
        navigate(`/chat/${currentConvId}`, { replace: true });
      } else {
        currentConvId = "guest-" + Date.now();
        setActiveConvId(currentConvId);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: `🔍 ${query}`,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    await saveMessage(currentConvId, "user", `🔍 ${query}`);

    setMessages(prev => [...prev, {
      id: STREAMING_ID,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      isStreaming: true,
    }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const SEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ query, messages: history }),
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
            if (chunk) {
              fullContent += chunk;
              setMessages(prev => prev.map(m =>
                m.id === STREAMING_ID ? { ...m, content: fullContent } : m
              ));
            }
          } catch { /* partial */ }
        }
      }

      const finalId = (Date.now() + 1).toString();
      setMessages(prev => prev.map(m =>
        m.id === STREAMING_ID
          ? { id: finalId, role: "assistant", content: fullContent, created_at: new Date().toISOString(), isStreaming: false }
          : m
      ));
      await saveMessage(currentConvId, "assistant", fullContent);
    } catch (err: unknown) {
      setMessages(prev => prev.filter(m => m.id !== STREAMING_ID));
      if ((err as Error).name === "AbortError") return;
      toast({ title: "ওয়েব সার্চ ব্যর্থ", description: (err as Error).message, variant: "destructive" });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
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

  // ── Helper: read image files to dataURL ──────────────────────────────────
  const readImageFiles = useCallback((files: File[]) => {
    files.forEach(file => {
      if (!file.type.startsWith("image/")) { toast({ title: "শুধু ছবি সাপোর্ট করা হয়", variant: "destructive" }); return; }
      if (file.size > 5 * 1024 * 1024) { toast({ title: "ছবি ৫MB এর বেশি হওয়া যাবে না", variant: "destructive" }); return; }
      const reader = new FileReader();
      reader.onload = (ev) => { const dataUrl = ev.target?.result as string; setPendingImages(prev => [...prev, dataUrl]); };
      reader.readAsDataURL(file);
    });
  }, [toast]);

  // ── Paste handler (Ctrl+V) ────────────────────────────────────────────────
  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];
    readImageFiles(files);
    toast({ title: `📋 ${files.length}টি ছবি পেস্ট হয়েছে` });
  }, [readImageFiles, toast]);

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) { toast({ title: "শুধু ছবি ড্র্যাগ করুন", variant: "destructive" }); return; }
    readImageFiles(files);
    toast({ title: `🖼️ ${files.length}টি ছবি যোগ হয়েছে` });
  };

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast({ title: "শুধু ছবি আপলোড করুন", variant: "destructive" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "ছবি ৫MB এর বেশি হওয়া যাবে না", variant: "destructive" }); return; }

    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      setAvatarUrl(publicUrl);
      toast({ title: "✅ প্রোফাইল ছবি আপডেট হয়েছে" });
    } catch (err) {
      toast({ title: "ছবি আপলোড ব্যর্থ হয়েছে", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
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

  // ── Pin / Unpin ────────────────────────────────────────────────────────────
  const togglePin = async (id: string, current: boolean) => {
    await supabase.from("conversations").update({ pinned: !current }).eq("id", id);
    setConversations(prev =>
      [...prev.map(c => c.id === id ? { ...c, pinned: !current } : c)]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    );
    toast({ title: current ? "📌 পিন সরানো হয়েছে" : "📌 পিন করা হয়েছে" });
  };

  // ── Export chat ────────────────────────────────────────────────────────────
  const exportTXT = () => {
    const conv = conversations.find(c => c.id === activeConvId);
    const title = conv?.title ?? "chat";
    const text = messages
      .filter(m => !m.isStreaming)
      .map(m => `[${m.role === "user" ? "আপনি" : "Shahed AI"}]\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${title}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "📄 TXT ডাউনলোড হচ্ছে..." });
  };

  const exportPDF = () => {
    const conv = conversations.find(c => c.id === activeConvId);
    window.open(`/share-print/${activeConvId}`, "_blank");
    // Use print dialog
    const printContent = messages
      .filter(m => !m.isStreaming)
      .map(m => `<div style="margin-bottom:16px"><strong>${m.role === "user" ? "আপনি" : "Shahed AI"}:</strong><p style="white-space:pre-wrap;margin-top:4px">${m.content.replace(/</g, "&lt;")}</p></div>`)
      .join('<hr style="margin:12px 0"/>');
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${conv?.title ?? "Chat"}</title><style>body{font-family:sans-serif;max-width:700px;margin:32px auto;padding:0 16px}h1{font-size:18px;margin-bottom:24px}</style></head><body><h1>${conv?.title ?? "Shahed AI Chat"}</h1>${printContent}</body></html>`);
    win.document.close();
    win.print();
    toast({ title: "🖨️ PDF প্রিন্ট ডায়ালগ খুলছে..." });
  };

  // ── Sharing link ───────────────────────────────────────────────────────────
  const generateShareLink = async (convId: string) => {
    const token = crypto.randomUUID();
    await supabase.from("conversations").update({ share_token: token }).eq("id", convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, share_token: token } : c));
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "🔗 শেয়ার লিংক কপি হয়েছে!", description: url });
  };

  const removeShareLink = async (convId: string) => {
    await supabase.from("conversations").update({ share_token: null }).eq("id", convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, share_token: null } : c));
    toast({ title: "লিংক বাতিল হয়েছে" });
  };

  // ── Folder management ──────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    const { data } = await supabase.from("folders").insert({ user_id: user.id, name: newFolderName.trim(), color: "default" }).select().single();
    if (data) setFolders(prev => [...prev, data as Folder]);
    setNewFolderName("");
    toast({ title: `📁 "${newFolderName}" ফোল্ডার তৈরি হয়েছে` });
  };

  const assignToFolder = async (convId: string, folderId: string | null) => {
    await supabase.from("conversations").update({ folder_id: folderId }).eq("id", convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, folder_id: folderId } : c));
    setAssignFolderConvId(null);
    toast({ title: folderId ? "📁 ফোল্ডারে যোগ হয়েছে" : "ফোল্ডার থেকে সরানো হয়েছে" });
  };

  const deleteFolder = async (id: string) => {
    await supabase.from("folders").delete().eq("id", id);
    setFolders(prev => prev.filter(f => f.id !== id));
    setConversations(prev => prev.map(c => c.folder_id === id ? { ...c, folder_id: null } : c));
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
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className={cn(
        "flex flex-col bg-sidebar transition-all duration-300 shrink-0 relative z-40",
        "md:relative md:translate-x-0",
        sidebarOpen
          ? "fixed inset-y-0 left-0 w-[260px] md:w-[260px] md:static"
          : "w-0 overflow-hidden md:w-0"
      )}>
        {/* Sidebar top: hide + new chat + folder */}
        <div className="flex items-center justify-between px-3 h-14 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <PanelLeftOpen className="h-5 w-5 text-sidebar-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent>সাইডবার বন্ধ করুন</TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setFolderSheetOpen(true)} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                  <FolderPlus className="h-4 w-4 text-sidebar-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>ফোল্ডার তৈরি করুন</TooltipContent>
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
        </div>

        {/* Search */}
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="চ্যাট খুঁজুন"
              className="w-full pl-9 pr-3 py-2 text-sm bg-sidebar-accent/60 rounded-lg border-0 outline-none placeholder:text-muted-foreground font-bn"
            />
          </div>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1 px-2">
          {/* Folders section */}
          {folders.length > 0 && (
            <div className="mb-3">
              <p className="px-3 py-1 text-xs font-medium text-muted-foreground font-bn">ফোল্ডার</p>
              {folders.map(folder => {
                const folderConvs = filteredConvs.filter(c => c.folder_id === folder.id);
                return (
                  <details key={folder.id} className="group/folder">
                    <summary className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-sidebar-accent transition-colors text-sm list-none">
                      <Folder className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="flex-1 truncate font-bn text-sm">{folder.name}</span>
                      <span className="text-xs text-muted-foreground">{folderConvs.length}</span>
                      <button onClick={e => { e.preventDefault(); deleteFolder(folder.id); }} className="opacity-0 group-hover/folder:opacity-100 p-0.5 rounded hover:text-destructive transition-all"><X className="h-3 w-3" /></button>
                    </summary>
                    <div className="pl-4">
                      {folderConvs.map(conv => (
                        <div
                          key={conv.id}
                          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-sidebar-accent transition-colors text-sm", activeConvId === conv.id && "bg-sidebar-accent")}
                          onClick={() => { setActiveConvId(conv.id); navigate(`/chat/${conv.id}`); if (window.innerWidth < 768) setSidebarOpen(false); }}
                        >
                          <span className="flex-1 truncate font-bn text-xs">{conv.title}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          {/* Pinned section */}
          {filteredConvs.filter(c => c.pinned).length > 0 && (
            <div className="mb-3">
              <p className="px-3 py-1 text-xs font-medium text-muted-foreground font-bn flex items-center gap-1"><Pin className="h-3 w-3" /> পিন করা</p>
              {filteredConvs.filter(c => c.pinned).map(conv => (
                <div
                  key={conv.id}
                  className={cn("group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-sidebar-accent transition-colors text-sm", activeConvId === conv.id && "bg-sidebar-accent")}
                  onClick={() => { setActiveConvId(conv.id); navigate(`/chat/${conv.id}`); if (window.innerWidth < 768) setSidebarOpen(false); }}
                >
                  <span className="flex-1 truncate font-bn text-sm">{conv.title}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button onClick={e => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-sidebar-border transition-all">
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right" className="w-52">
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); togglePin(conv.id, !!conv.pinned); }} className="font-bn gap-2"><Pin className="h-4 w-4" /> পিন সরান</DropdownMenuItem>
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }} className="font-bn gap-2"><Pencil className="h-4 w-4" /> রিনেম</DropdownMenuItem>
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id); }} className="font-bn gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> ডিলিট</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}

          {groupedConvs.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8 font-bn">কোনো চ্যাট নেই</p>
          ) : (
            groupedConvs.map(group => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground font-bn">{group.label}</p>
                {group.items.filter(c => !c.pinned).map(conv => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-sidebar-accent transition-colors text-sm",
                      activeConvId === conv.id && "bg-sidebar-accent"
                    )}
                    onClick={() => { setActiveConvId(conv.id); navigate(`/chat/${conv.id}`); if (window.innerWidth < 768) setSidebarOpen(false); }}
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
                        <span className="flex-1 truncate font-bn text-sm">{conv.title}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={e => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-sidebar-border transition-all"
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" side="right" className="w-52">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); generateShareLink(conv.id); }} className="font-bn gap-2"><LinkIcon className="h-4 w-4" /> শেয়ার লিংক কপি</DropdownMenuItem>
                            {conv.share_token && <DropdownMenuItem onClick={e => { e.stopPropagation(); removeShareLink(conv.id); }} className="font-bn gap-2 text-muted-foreground"><X className="h-4 w-4" /> লিংক বাতিল</DropdownMenuItem>}
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }} className="font-bn gap-2"><Pencil className="h-4 w-4" /> রিনেম</DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); togglePin(conv.id, !!conv.pinned); }} className="font-bn gap-2"><Pin className="h-4 w-4" /> পিন করুন</DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setAssignFolderConvId(conv.id); }} className="font-bn gap-2"><Folder className="h-4 w-4" /> ফোল্ডারে রাখুন</DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id); }} className="font-bn gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> ডিলিট</DropdownMenuItem>
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

        {/* Sidebar bottom: user menu */}
        <div className="p-3 border-t border-sidebar-border space-y-1 shrink-0">
          {!isGuest && conversations.length > 0 && (
            <button
              onClick={() => setClearAllOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-bn"
            >
              <Trash2 className="h-4 w-4" /> সব চ্যাট মুছুন
            </button>
          )}
          {isGuest ? (
            <Link to="/auth" className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-bn">
              <LogOut className="h-4 w-4" /> লগইন / সাইন আপ
            </Link>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                  <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0 relative">
                    {avatarUrl
                      ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                      : <div className="h-full w-full gradient-brand flex items-center justify-center text-white text-sm font-bold">{userName[0]?.toUpperCase()}</div>
                    }
                  </div>
                  <span className="flex-1 text-left text-sm font-medium truncate font-bn">{userName}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 mb-1">
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="flex items-center gap-2 font-bn"><Shield className="h-4 w-4 text-primary" /> অ্যাডমিন প্যানেল</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setProfileSheetOpen(true)} className="font-bn gap-2">
                  <Camera className="h-4 w-4" /> প্রোফাইল ছবি পরিবর্তন
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggle} className="font-bn">
                  {theme === "dark" ? <><Sun className="h-4 w-4 mr-2" /> লাইট মোড</> : <><Moon className="h-4 w-4 mr-2" /> ডার্ক মোড</>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="text-destructive font-bn"><LogOut className="h-4 w-4 mr-2" /> বের হন</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* ── Top Bar (ChatGPT-style) ── */}
        <div className="h-14 flex items-center px-3 gap-2 shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-sm">
          {/* Sidebar toggle (always visible on mobile) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarOpen(v => !v)}
                className="p-2 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              >
                <Menu className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{sidebarOpen ? "সাইডবার বন্ধ করুন" : "সাইডবার খুলুন"}</TooltipContent>
          </Tooltip>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: export + new chat + user */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Export dropdown — only show when chat is active */}
            {activeConvId && messages.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-muted transition-colors" title="এক্সপোর্ট করুন">
                    <Download className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={exportTXT} className="font-bn gap-2"><FileText className="h-4 w-4" /> TXT ডাউনলোড</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportPDF} className="font-bn gap-2"><Download className="h-4 w-4" /> PDF প্রিন্ট</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => activeConvId && generateShareLink(activeConvId)} className="font-bn gap-2"><LinkIcon className="h-4 w-4" /> শেয়ার লিংক</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setActiveConvId(null); setMessages([]); navigate("/chat"); }}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Pencil className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>নতুন চ্যাট (Ctrl+N)</TooltipContent>
            </Tooltip>

            {/* Shortcuts help button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShortcutsOpen(true)}
                  className="hidden md:flex p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground items-center justify-center"
                >
                  <span className="text-xs font-mono font-bold leading-none">?</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>কীবোর্ড শর্টকাট</TooltipContent>
            </Tooltip>

            {/* User avatar / profile */}
            {isGuest ? (
              <Link to="/auth">
                <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <LogOut className="h-5 w-5 text-muted-foreground" />
                </button>
              </Link>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-8 w-8 rounded-full overflow-hidden hover:opacity-90 transition-opacity flex-shrink-0">
                    {avatarUrl
                      ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                      : <div className="h-full w-full gradient-brand flex items-center justify-center text-white text-sm font-bold">{userName[0]?.toUpperCase()}</div>
                    }
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2 border-b border-border mb-1">
                    <p className="font-semibold text-sm font-bn truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 font-bn"><Shield className="h-4 w-4 text-primary" /> অ্যাডমিন প্যানেল</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setProfileSheetOpen(true)} className="font-bn gap-2">
                    <Camera className="h-4 w-4" /> প্রোফাইল ছবি পরিবর্তন
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggle} className="font-bn">
                    {theme === "dark" ? <><Sun className="h-4 w-4 mr-2" /> লাইট মোড</> : <><Moon className="h-4 w-4 mr-2" /> ডার্ক মোড</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/terms")} className="font-bn"><FileText className="h-4 w-4 mr-2" /> শর্তাবলী</DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut} className="text-destructive font-bn"><LogOut className="h-4 w-4 mr-2" /> লগআউট</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* ── Messages area ── */}
        <ScrollArea className="flex-1">
          {messages.length === 0 && !streaming ? (
            /* Welcome screen */
            <div className="relative flex flex-col items-center justify-center min-h-full px-4 py-12 overflow-hidden">
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {["{ }", "< />", "( )", "=>", "[ ]", "//", "&&", "||", "++", "**"].map((sym, i) => (
                  <span key={i} className="absolute text-primary/[0.07] font-mono select-none" style={{ left: `${8 + (i * 9) % 85}%`, top: `${5 + (i * 13) % 80}%`, animation: `float-particle ${3 + (i % 4)}s ease-in-out infinite`, animationDelay: `${i * 0.4}s`, fontSize: `${14 + (i % 3) * 8}px` }}>{sym}</span>
                ))}
                <div className="absolute top-1/4 -left-20 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl" style={{ animation: "pulse-ring 5s ease-in-out infinite" }} />
                <div className="absolute bottom-1/4 -right-20 h-64 w-64 rounded-full bg-accent/[0.06] blur-3xl" style={{ animation: "pulse-ring 6s ease-in-out infinite", animationDelay: "2s" }} />
              </div>
               <div className="relative w-full max-w-2xl z-10 text-center">
                <div className="mb-6 animate-slide-up-fade animate-slide-up-fade-1">
                  <div className="flex justify-center mb-5">
                    <div className="relative">
                      <ShahedLogo size="lg" />
                      <div className="absolute -inset-4 rounded-full opacity-20" style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)", animation: "pulse-ring 3s ease-in-out infinite" }} />
                    </div>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold font-bn mb-2 animate-gradient-shift" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))", backgroundSize: "200% 200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                    {greeting}
                  </h1>
                  <p className="text-sm text-muted-foreground font-bn">আজ কীভাবে সাহায্য করতে পারি?</p>
                </div>

                {/* AI Capability Grid with tabs */}
                <div className="mb-4">
                  {/* Tabs */}
                  <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                    {CAPABILITY_TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setCapTab(tab.key as "ai" | "productivity" | "image" | "web");
                          if (tab.key === "web") setWebSearchMode(true);
                          else setWebSearchMode(false);
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-bn font-medium transition-all",
                          capTab === tab.key
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {/* Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {AI_CAPABILITIES[capTab].map((cap) => (
                      <button
                        key={cap.label}
                        onClick={() => {
                          if (capTab === "image") {
                            if (cap.prompt) {
                              generateImage(cap.prompt);
                            } else {
                              setInput("");
                              setTimeout(() => textareaRef.current?.focus(), 50);
                              toast({ title: "🎨 ছবি তৈরি করুন", description: "নিচে আপনার ছবির বর্ণনা লিখুন" });
                            }
                          } else if (capTab === "web") {
                            setWebSearchMode(true);
                            setInput(cap.prompt);
                            setTimeout(() => textareaRef.current?.focus(), 50);
                          } else {
                            setInput(cap.prompt);
                            setTimeout(() => textareaRef.current?.focus(), 50);
                          }
                        }}
                        className="group flex flex-col items-start gap-1.5 p-3 rounded-xl bg-muted/50 hover:bg-muted border border-border/40 hover:border-primary/30 transition-all text-left hover:shadow-sm"
                      >
                        <span className="text-xl">{cap.icon}</span>
                        <span className="text-xs font-semibold font-bn text-foreground">{cap.label}</span>
                        <span className="text-[10px] text-muted-foreground font-bn leading-tight">{cap.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick suggested prompts */}
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.label}
                        onClick={() => { setInput(p.prompt); setTimeout(() => textareaRef.current?.focus(), 50); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bn border border-border/50 bg-background/80 hover:bg-muted hover:border-primary/40 transition-all"
                      >
                        <Icon className="h-3 w-3 text-primary" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6 pb-4">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-2 md:gap-4", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && <ShahedLogo size="sm" />}
                  <div className={cn("group relative max-w-[88%] md:max-w-[80%]", msg.role === "user" ? "items-end" : "items-start")}>
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
                              <textarea value={editingMsgContent} onChange={e => setEditingMsgContent(e.target.value)} className="px-4 py-3 rounded-2xl bg-muted text-foreground text-sm outline-none resize-none font-bn min-w-[200px]" rows={3} />
                              <div className="flex flex-col gap-1">
                                <button onClick={saveEditedMessage} className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditingMsgId(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
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
                        {/* Generated image display */}
                        {msg.generatedImage && (
                          <div className="mb-2">
                            <img
                              src={msg.generatedImage}
                              alt="AI generated"
                              className="max-w-sm w-full rounded-2xl border border-border shadow-lg"
                            />
                            <div className="flex gap-1.5 mt-2">
                              <a
                                href={msg.generatedImage}
                                download="shahed-ai-image.png"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bn transition-colors"
                              >
                                <Download className="h-3 w-3" />
                                ডাউনলোড
                              </a>
                            </div>
                          </div>
                        )}
                        {/* Image generating spinner */}
                        {msg.isGeneratingImage && (
                          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm font-bn">
                            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            ছবি তৈরি হচ্ছে...
                          </div>
                        )}
                        {!msg.isGeneratingImage && <MarkdownRenderer content={msg.content} />}
                        {msg.isStreaming && !msg.content && (
                          <div className="flex items-center gap-1 py-3">
                            <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        )}
                        {msg.isStreaming && msg.content && (
                          <span className="inline-block w-[3px] h-4 bg-foreground/70 ml-0.5 animate-pulse rounded-sm align-middle" />
                        )}
                        {!msg.isStreaming && !msg.isGeneratingImage && (
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip><TooltipTrigger asChild><button onClick={() => copyMsg(msg.id, msg.content)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">{copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button></TooltipTrigger><TooltipContent>কপি করুন</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><button onClick={regenerate} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /></button></TooltipTrigger><TooltipContent>পুনরায় তৈরি করুন</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><button className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ThumbsUp className="h-3.5 w-3.5 text-muted-foreground" /></button></TooltipTrigger><TooltipContent>ভালো লেগেছে</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><button className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ThumbsDown className="h-4 w-4 text-muted-foreground" /></button></TooltipTrigger><TooltipContent>ভালো লাগেনি</TooltipContent></Tooltip>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0 mt-1">
                      {avatarUrl
                        ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                        : <div className="h-full w-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">{userName[0]?.toUpperCase()}</div>
                      }
                    </div>
                  )}
                </div>
              ))}

              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* ── Input area (fixed bottom, ChatGPT-style) ── */}
        <div
          className={cn("px-3 md:px-6 pb-4 md:pb-5 pt-2 bg-background shrink-0 transition-all", isDragging && "ring-2 ring-primary/50 ring-inset")}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-primary/10 border-2 border-dashed border-primary rounded-2xl px-8 py-4 flex flex-col items-center gap-2">
                <ImageIcon className="h-8 w-8 text-primary animate-bounce" />
                <p className="text-sm font-medium text-primary font-bn">ছবি ড্রপ করুন</p>
              </div>
            </div>
          )}
          <div className="max-w-2xl mx-auto space-y-2">
            {/* Pending images */}
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative group/img">
                    <img src={img} alt="pending" className="h-14 w-14 object-cover rounded-xl border border-border" />
                    <button onClick={() => removePendingImage(idx)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Main input pill — ChatGPT style */}
            <div
              className="flex flex-col gap-2 bg-muted/60 border border-border rounded-2xl px-3 py-2.5 shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all"
            >
              {/* Top row: Plus + Model selector + Web Search + Image Gen toggles */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Attach */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => fileInputRef.current?.click()} disabled={streaming || isGeneratingImage} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors flex-shrink-0">
                      <Plus className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ছবি যোগ করুন</TooltipContent>
                </Tooltip>

                {/* Model selector — next to Plus */}
                <DropdownMenu open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border/50 bg-muted/40 hover:bg-muted transition-all group text-sm">
                      <selectedModel.icon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <span className="font-medium text-xs font-bn text-foreground/80">{selectedModel.name}</span>
                      {(selectedModel as typeof selectedModel & { badge?: string }).badge && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                          {(selectedModel as typeof selectedModel & { badge?: string }).badge}
                        </span>
                      )}
                      <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72 p-1.5 rounded-2xl shadow-xl border border-border/60">
                    <div className="px-3 py-2 border-b border-border/50 mb-1">
                      <p className="text-xs font-semibold text-muted-foreground font-bn">AI মডেল বেছে নিন</p>
                    </div>
                    {AI_MODELS.map(model => {
                      const Icon = model.icon;
                      const isSelected = selectedModel.id === model.id;
                      return (
                        <DropdownMenuItem
                          key={model.id}
                          onClick={() => { setSelectedModel(model); setModelPickerOpen(false); }}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10" : "hover:bg-muted/70"
                          )}
                        >
                          <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0", isSelected ? "bg-primary/20" : "bg-muted")}>
                            <Icon className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold font-bn">{model.name}</p>
                              {(model as typeof model & { badge?: string }).badge && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                                  {(model as typeof model & { badge?: string }).badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-bn">{model.description}</p>
                          </div>
                          {isSelected && <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0"><Check className="h-3 w-3 text-white" /></div>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Web Search toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setWebSearchMode(v => !v)}
                      disabled={streaming || isGeneratingImage}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bn font-medium transition-all",
                        webSearchMode
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "border-border/50 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">ওয়েব</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{webSearchMode ? "ওয়েব সার্চ চালু" : "ওয়েব সার্চ বন্ধ"}</TooltipContent>
                </Tooltip>

                {/* Image generation button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        const p = input.trim();
                        if (p) { generateImage(p); setInput(""); }
                        else { toast({ title: "🎨 ছবি তৈরি করুন", description: "নিচে ছবির বর্ণনা লিখুন এবং এই বোতাম চাপুন" }); }
                      }}
                      disabled={streaming || isGeneratingImage}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bn font-medium transition-all",
                        isGeneratingImage
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "border-border/50 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {isGeneratingImage
                        ? <div className="h-3.5 w-3.5 border border-primary border-t-transparent rounded-full animate-spin" />
                        : <ImageIcon className="h-3.5 w-3.5" />
                      }
                      <span className="hidden sm:inline">ছবি</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ছবি তৈরি করুন (বর্ণনা লিখে চাপুন)</TooltipContent>
                </Tooltip>
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />

              {/* Bottom row: Textarea + actions */}
              <div className="flex items-center gap-2">
                {/* Textarea */}
                 <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                   onKeyDown={handleKeyDown}
                   onPaste={handlePaste}
                   placeholder={webSearchMode ? "🔍 ওয়েব সার্চ করুন..." : isGeneratingImage ? "ছবি তৈরি হচ্ছে..." : "Ask anything"}
                  className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground font-bn min-h-[28px] max-h-[160px] leading-relaxed py-1"
                  disabled={streaming || isGeneratingImage}
                  rows={1}
                />

                {/* Right actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {streaming ? (
                    <button onClick={handleStop} className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-all">
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  ) : (
                    <>
                      {/* Mic STT */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={toggleVoice} disabled={streaming} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", isListening ? "bg-destructive text-destructive-foreground animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-background")}>
                            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{isListening ? "থামুন" : "ভয়েস ইনপুট"}</TooltipContent>
                      </Tooltip>

                      {/* Live voice — waveform button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setVoiceChatOpen(true)}
                            disabled={streaming}
                            className="h-9 w-9 rounded-full flex items-center justify-center transition-all shadow-md hover:scale-105 active:scale-95 flex-shrink-0"
                            style={{ background: "hsl(var(--foreground))" }}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" style={{ fill: "hsl(var(--background))" }}>
                              <rect x="2" y="9" width="2.5" height="6" rx="1.25"/>
                              <rect x="6" y="5.5" width="2.5" height="13" rx="1.25"/>
                              <rect x="10" y="7.5" width="2.5" height="9" rx="1.25"/>
                              <rect x="14" y="3" width="2.5" height="18" rx="1.25"/>
                              <rect x="18" y="6" width="2.5" height="12" rx="1.25"/>
                              <rect x="22" y="9" width="2.5" height="6" rx="1.25"/>
                            </svg>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>লাইভ ভয়েস চ্যাট</TooltipContent>
                      </Tooltip>

                      {/* Send */}
                      {(input.trim() || pendingImages.length > 0) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button onClick={handleSend} className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-all shadow-md">
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>পাঠান (Enter)</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground font-bn leading-relaxed hidden sm:block">
              🔒 Shahed AI আপনার গোপনীয়তা সুরক্ষিত রাখে — তবে AI সবসময় নির্ভুল নয়
            </p>
          </div>
        </div>
      </div>

      {/* Live Voice Chat Modal */}
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
            <AlertDialogAction onClick={() => { if (deleteConfirmId) { deleteConversation(deleteConfirmId); setDeleteConfirmId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bn">হ্যাঁ, ডিলিট করুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-bn"><AlertTriangle className="h-5 w-5 text-destructive" /> সব চ্যাট মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription className="font-bn">আপনার সমস্ত কথোপকথন স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bn"
            >হ্যাঁ, সব মুছুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Profile Picture Sheet ── */}
      <Sheet open={profileSheetOpen} onOpenChange={setProfileSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-w-md mx-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-bn text-center">প্রোফাইল ছবি পরিবর্তন করুন</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center gap-5 pb-6">
            <div className="relative">
              <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-primary/20 shadow-lg">
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  : <div className="h-full w-full gradient-brand flex items-center justify-center text-white text-3xl font-bold">{userName[0]?.toUpperCase()}</div>
                }
              </div>
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-bn text-center">JPG, PNG, WebP — সর্বোচ্চ ৫MB</p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium font-bn hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {avatarUploading ? "আপলোড হচ্ছে..." : "ছবি বেছে নিন"}
              </button>
              {avatarUrl && (
                <button
                  onClick={async () => {
                    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user!.id);
                    setAvatarUrl(null);
                    toast({ title: "প্রোফাইল ছবি সরানো হয়েছে" });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm font-bn hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Folder Management Sheet ── */}
      <Sheet open={folderSheetOpen} onOpenChange={setFolderSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-w-md mx-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-bn text-center">ফোল্ডার ম্যানেজ করুন</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-6">
            <div className="flex gap-2">
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createFolder()}
                placeholder="নতুন ফোল্ডারের নাম"
                className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm outline-none font-bn placeholder:text-muted-foreground focus:border-primary transition-colors"
              />
              <button
                onClick={createFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bn hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                তৈরি করুন
              </button>
            </div>
            {folders.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground font-bn py-4">কোনো ফোল্ডার নেই</p>
            ) : (
              <div className="space-y-2">
                {folders.map(f => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/60 border border-border">
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bn">{f.name}</span>
                      <span className="text-xs text-muted-foreground">({conversations.filter(c => c.folder_id === f.id).length})</span>
                    </div>
                    <button onClick={() => deleteFolder(f.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Assign Folder Sheet ── */}
      <Sheet open={!!assignFolderConvId} onOpenChange={open => { if (!open) setAssignFolderConvId(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-w-md mx-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-bn text-center">ফোল্ডারে রাখুন</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-6">
            <button
              onClick={() => assignFolderConvId && assignToFolder(assignFolderConvId, null)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/60 hover:bg-muted transition-colors text-sm font-bn"
            >
              <X className="h-4 w-4 text-muted-foreground" /> ফোল্ডার থেকে সরিয়ে দিন
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => assignFolderConvId && assignToFolder(assignFolderConvId, f.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-bn",
                  conversations.find(c => c.id === assignFolderConvId)?.folder_id === f.id
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/60 hover:bg-muted"
                )}
              >
                <Folder className="h-4 w-4" /> {f.name}
              </button>
            ))}
            {folders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground font-bn py-4">কোনো ফোল্ডার নেই — আগে ফোল্ডার তৈরি করুন</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Keyboard Shortcuts Dialog ── */}
      <AlertDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bn flex items-center gap-2">
              ⌨️ কীবোর্ড শর্টকাট
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            {[
              { keys: ["Ctrl", "N"], desc: "নতুন চ্যাট" },
              { keys: ["Ctrl", "K"], desc: "ইনপুটে ফোকাস" },
              { keys: ["Ctrl", "B"], desc: "সাইডবার টগল" },
              { keys: ["Ctrl", "/"], desc: "চ্যাট সার্চ" },
              { keys: ["Enter"], desc: "মেসেজ পাঠান" },
              { keys: ["Shift", "Enter"], desc: "নতুন লাইন" },
              { keys: ["Esc"], desc: "AI থামান" },
              { keys: ["?"], desc: "শর্টকাট দেখুন" },
            ].map(({ keys, desc }) => (
              <div key={desc} className="flex items-center justify-between px-1 py-1.5">
                <span className="text-sm font-bn text-muted-foreground">{desc}</span>
                <div className="flex items-center gap-1">
                  {keys.map(k => (
                    <kbd key={k} className="px-2 py-0.5 text-xs font-mono bg-muted border border-border rounded-md shadow-sm">{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bn w-full">বন্ধ করুন</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
