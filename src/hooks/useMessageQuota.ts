import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export const DAILY_MESSAGE_LIMIT = 1000;

/**
 * Atomically consumes one message from the user's daily quota.
 * Returns true when the action is allowed, false (with toast) otherwise.
 * Fails open on transient DB errors so users are not blocked.
 */
export function useMessageQuota(dailyLimit: number = DAILY_MESSAGE_LIMIT) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  return useCallback(async (): Promise<boolean> => {
    if (!user) {
      toast({ title: "লগইন প্রয়োজন", description: "মেসেজ পাঠাতে সাইন ইন করুন।", variant: "destructive" });
      navigate("/auth");
      return false;
    }
    const { data, error } = await supabase.rpc("consume_message_quota", { _daily_limit: dailyLimit });
    if (error) {
      console.error("quota error", error);
      return true; // fail-open
    }
    const result = data as { allowed: boolean; reason?: string; used?: number; limit?: number };
    if (!result?.allowed) {
      if (result?.reason === "limit_reached") {
        toast({
          title: "দৈনিক সীমা শেষ",
          description: `আপনি আজকের ${dailyLimit}টি ফ্রি মেসেজ ব্যবহার করে ফেলেছেন। আগামীকাল আবার চেষ্টা করুন।`,
          variant: "destructive",
        });
      } else {
        toast({ title: "লগইন প্রয়োজন", variant: "destructive" });
      }
      return false;
    }
    return true;
  }, [user, navigate, toast, dailyLimit]);
}
