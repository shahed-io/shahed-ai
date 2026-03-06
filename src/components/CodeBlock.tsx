import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Terminal } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  language?: string;
  children: string;
}

export default function CodeBlock({ language = "text", children }: CodeBlockProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = language === "text" ? "plain text" : language;

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border text-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-b border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          <span className="text-xs font-mono font-medium lowercase">{displayLang}</span>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-all",
            copied
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5" /> কপি হয়েছে</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> কপি</>
          )}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={language}
        style={theme === "dark" ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "0.8125rem",
          lineHeight: "1.6",
          padding: "1rem",
          background: theme === "dark" ? "hsl(220 22% 10%)" : "hsl(220 20% 97%)",
        }}
        wrapLongLines
        showLineNumbers={children.split("\n").length > 4}
        lineNumberStyle={{
          color: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
          fontSize: "0.7rem",
          paddingRight: "1rem",
          userSelect: "none",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
