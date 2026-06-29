import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, ArrowLeft } from "lucide-react";
import SEO from "@/components/SEO";

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-background font-bn">
      <SEO
        title="ব্যবহারের শর্তাবলী — Shahed AI"
        description="Shahed AI ব্যবহারের শর্তাবলী — অনুমতিযোগ্য ব্যবহার, নিষিদ্ধ কার্যকলাপ, ব্যবহারের সীমা এবং দায়বদ্ধতা।"
        path="/terms"
      />
      <header className="border-b border-border">
        <div className="container h-16 flex items-center gap-4">
          <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" /> হোম</Button></Link>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center"><Brain className="h-4 w-4 text-white" /></div>
            <span className="font-bold">শাহেদ AI</span>
          </div>
        </div>
      </header>
      <div className="container max-w-3xl py-12 prose dark:prose-invert">
        <h1>ব্যবহারের শর্তাবলী</h1>
        <p className="text-muted-foreground">সর্বশেষ আপডেট: {new Date().toLocaleDateString("bn-BD")}</p>

        <h2>১. গ্রহণযোগ্যতা</h2>
        <p>শাহেদ AI ব্যবহার করে আপনি এই শর্তাবলী মেনে নিচ্ছেন। আপনার বয়স কমপক্ষে ১৩ বছর হতে হবে।</p>

        <h2>২. অনুমতিযোগ্য ব্যবহার</h2>
        <p>আপনি শাহেদ AI ব্যবহার করতে পারবেন শিক্ষা, গবেষণা, সৃজনশীল কাজ এবং সাধারণ প্রশ্নের জন্য।</p>

        <h2>৩. নিষিদ্ধ কার্যকলাপ</h2>
        <p>নিম্নলিখিত কাজ সম্পূর্ণ নিষিদ্ধ:</p>
        <ul>
          <li>অবৈধ বা ক্ষতিকর বিষয়বস্তু তৈরি করা</li>
          <li>অন্যের ব্যক্তিগত তথ্য সংগ্রহ করা</li>
          <li>সিস্টেম হ্যাক বা অপব্যবহার করার চেষ্টা করা</li>
          <li>মিথ্যা তথ্য ছড়ানো</li>
          <li>ঘৃণ্য বা হয়রানিমূলক বিষয়বস্তু তৈরি করা</li>
        </ul>

        <h2>৪. ব্যবহারের সীমা</h2>
        <p>ফ্রি প্ল্যানে প্রতিদিন ২০টি বার্তার সীমা রয়েছে। এই সীমা লঙ্ঘনের চেষ্টা করলে অ্যাকাউন্ট বাতিল হতে পারে।</p>

        <h2>৫. দায়বদ্ধতা</h2>
        <p>শাহেদ AI AI-জেনারেটেড কনটেন্টের নির্ভুলতার নিশ্চয়তা দেয় না। গুরুত্বপূর্ণ সিদ্ধান্তের জন্য বিশেষজ্ঞের পরামর্শ নিন।</p>

        <h2>৬. পরিবর্তন</h2>
        <p>আমরা যেকোনো সময় এই শর্তাবলী পরিবর্তন করার অধিকার রাখি। পরিবর্তনের পরেও ব্যবহার অব্যাহত রাখলে নতুন শর্ত মেনে নেওয়া হবে।</p>

        <h2>৭. যোগাযোগ</h2>
        <p>প্রশ্নের জন্য: support@shahedit.com</p>
      </div>
    </div>
  );
}
