import { memo } from "react";
import ReactMarkdown from "react-markdown";
import CodeBlock from "./CodeBlock";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const markdownComponents = {
  code({ node, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const codeStr = String(children).replace(/\n$/, "");
    const isBlock = codeStr.includes("\n") || match != null;
    if (isBlock) {
      return <CodeBlock language={match ? match[1] : "text"}>{codeStr}</CodeBlock>;
    }
    return (
      <code
        className="bg-muted/80 text-primary px-1.5 py-0.5 rounded-md text-[0.8em] font-mono border border-border/50"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }: any) {
    // pre is handled by CodeBlock, just return children
    return <>{children}</>;
  },
  p({ children }: any) {
    return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
  },
  h1({ children }: any) {
    return <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>;
  },
  h2({ children }: any) {
    return <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>;
  },
  h3({ children }: any) {
    return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>;
  },
  ul({ children }: any) {
    return <ul className="list-disc list-outside ml-5 mb-3 space-y-1">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal list-outside ml-5 mb-3 space-y-1">{children}</ol>;
  },
  li({ children }: any) {
    return <li className="leading-relaxed">{children}</li>;
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-2 border-primary/40 pl-4 py-1 my-3 text-muted-foreground italic bg-muted/30 rounded-r-lg">
        {children}
      </blockquote>
    );
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-3 rounded-xl border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-muted/60 border-b border-border">{children}</thead>;
  },
  th({ children }: any) {
    return <th className="px-4 py-2 text-left font-semibold">{children}</th>;
  },
  td({ children }: any) {
    return <td className="px-4 py-2 border-t border-border/40">{children}</td>;
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        {children}
      </a>
    );
  },
  strong({ children }: any) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
};

function MarkdownRendererImpl({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("text-sm leading-relaxed font-bn", className)}>
      <ReactMarkdown components={markdownComponents as any}>{content}</ReactMarkdown>
    </div>
  );
}

// Memoize: re-render only when content/className actually change. This avoids
// re-parsing markdown for every assistant bubble on each input keystroke.
const MarkdownRenderer = memo(MarkdownRendererImpl, (prev, next) =>
  prev.content === next.content && prev.className === next.className
);

export default MarkdownRenderer;
