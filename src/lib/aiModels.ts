import { Zap, Brain, Sparkles, Star, Cpu, type LucideIcon } from "lucide-react";

export interface AIModel {
  id: string;
  name: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  badge?: string;
}

// Shahed AI-5 is default (fastest, Gemini+ChatGPT hybrid)
export const AI_MODELS: AIModel[] = [
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
    id: "anthropic/claude-opus-4-5",
    name: "Claude Opus 4.5",
    label: "Latest",
    description: "Anthropic-এর সর্বশেষ ও সবচেয়ে শক্তিশালী মডেল",
    icon: Brain,
    color: "text-primary",
    badge: "নতুন",
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
