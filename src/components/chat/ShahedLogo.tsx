import { cn } from "@/lib/utils";

interface ShahedLogoProps {
  size?: "sm" | "md" | "lg";
}

/** Modern Shahed AI logo — glassmorphic coding-support icon. */
export default function ShahedLogo({ size = "md" }: ShahedLogoProps) {
  const dims = {
    sm: { outer: "h-8 w-8", radius: "rounded-xl" },
    md: { outer: "h-10 w-10", radius: "rounded-2xl" },
    lg: { outer: "h-14 w-14", radius: "rounded-2xl" },
  };
  const d = dims[size];
  return (
    <div className={cn("relative flex-shrink-0", d.outer)} aria-hidden="true">
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
