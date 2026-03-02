import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background font-bn">
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
        <h1>গোপনীয়তা নীতি</h1>
        <p className="text-muted-foreground">সর্বশেষ আপডেট: {new Date().toLocaleDateString("bn-BD")}</p>

        <h2>১. তথ্য সংগ্রহ</h2>
        <p>আমরা যে তথ্য সংগ্রহ করি:</p>
        <ul>
          <li><strong>অ্যাকাউন্ট তথ্য:</strong> নাম, ইমেইল ঠিকানা</li>
          <li><strong>কথোপকথন:</strong> AI-এর সাথে আপনার বার্তাগুলো</li>
          <li><strong>ব্যবহারের তথ্য:</strong> বার্তা সংখ্যা, তারিখ</li>
        </ul>

        <h2>২. তথ্য ব্যবহার</h2>
        <p>আমরা আপনার তথ্য ব্যবহার করি:</p>
        <ul>
          <li>সার্ভিস প্রদান ও উন্নতির জন্য</li>
          <li>নিরাপত্তা নিশ্চিত করতে</li>
          <li>ব্যবহারের সীমা পর্যবেক্ষণ করতে</li>
        </ul>

        <h2>৩. তথ্য শেয়ারিং</h2>
        <p>আমরা আপনার ব্যক্তিগত তথ্য তৃতীয় পক্ষের সাথে বিক্রি বা শেয়ার করি না। শুধুমাত্র আইনি প্রয়োজনে বা আপনার সম্মতিতে তথ্য শেয়ার হতে পারে।</p>

        <h2>৪. AI প্রসেসিং</h2>
        <p>আপনার বার্তাগুলো AI মডেলের মাধ্যমে প্রক্রিয়া করা হয়। এই মডেল আপনার বার্তা দিয়ে প্রশিক্ষিত হয় না।</p>

        <h2>৫. কুকিজ</h2>
        <p>আমরা সেশন ম্যানেজমেন্টের জন্য লোকালস্টোরেজ ব্যবহার করি। কোনো তৃতীয় পক্ষের ট্র্যাকিং কুকি ব্যবহার করা হয় না।</p>

        <h2>৬. আপনার অধিকার</h2>
        <p>আপনি যেকোনো সময় আপনার অ্যাকাউন্ট মুছে ফেলতে এবং আপনার ডেটা ডিলিট করতে পারবেন।</p>

        <h2>৭. যোগাযোগ</h2>
        <p>গোপনীয়তা সংক্রান্ত প্রশ্নের জন্য: privacy@shahedit.com</p>
      </div>
    </div>
  );
}
