import { Lightbulb, Code, FileText, Globe, type LucideIcon } from "lucide-react";

export interface SuggestedPrompt {
  icon: LucideIcon;
  label: string;
  prompt: string;
}

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { icon: Lightbulb, label: "ব্যাখ্যা করুন", prompt: "কোয়ান্টাম কম্পিউটিং কী এবং এটি কীভাবে কাজ করে সহজভাবে বুঝিয়ে দিন" },
  { icon: Code, label: "কোড লিখুন", prompt: "Python এ একটি সিম্পল ক্যালকুলেটর প্রোগ্রাম লিখুন" },
  { icon: FileText, label: "লেখালেখি", prompt: "বাংলাদেশের প্রকৃতি নিয়ে একটি সুন্দর অনুচ্ছেদ লিখুন" },
  { icon: Globe, label: "অনুবাদ", prompt: "এই বাক্যটি ইংরেজিতে অনুবাদ করুন: আমি বাংলাদেশকে ভালোবাসি" },
];

export const CAPABILITY_TABS = [
  { key: "ai", label: "🤖 AI বুদ্ধিমত্তা" },
  { key: "productivity", label: "⚡ উৎপাদনশীলতা" },
  { key: "image", label: "🎨 ছবি তৈরি" },
  { key: "web", label: "🌐 ওয়েব সার্চ" },
];

export interface Capability {
  icon: string;
  label: string;
  desc: string;
  prompt: string;
}

export const AI_CAPABILITIES: Record<string, Capability[]> = {
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
