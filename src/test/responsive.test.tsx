import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useState } from "react";
import { setViewport } from "./setup";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

// Common mobile / tablet / desktop widths
const SCREENS = [
  { name: "small mobile", width: 320, mobile: true },
  { name: "iPhone", width: 390, mobile: true },
  { name: "large mobile", width: 414, mobile: true },
  { name: "tablet portrait", width: 768, mobile: false },
  { name: "tablet landscape", width: 1024, mobile: false },
  { name: "desktop", width: 1440, mobile: false },
];

describe("useIsMobile across screen sizes", () => {
  beforeEach(() => setViewport(1024));

  SCREENS.forEach(({ name, width, mobile }) => {
    it(`returns ${mobile} for ${name} (${width}px)`, () => {
      setViewport(width);
      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(mobile);
    });
  });

  it("updates reactively when viewport changes", () => {
    setViewport(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => setViewport(360));
    expect(result.current).toBe(true);
    act(() => setViewport(1200));
    expect(result.current).toBe(false);
  });
});

describe("Mobile sidebar (Sheet)", () => {
  beforeEach(() => setViewport(375));

  function SidebarHarness() {
    return (
      <Sheet>
        <SheetTrigger>Open sidebar</SheetTrigger>
        <SheetContent side="left" aria-label="sidebar">
          <SheetHeader>
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          <button>New chat</button>
        </SheetContent>
      </Sheet>
    );
  }

  it("opens and closes from a mobile trigger", async () => {
    render(<SidebarHarness />);
    expect(screen.queryByText("Conversations")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Open sidebar"));
    await waitFor(() => expect(screen.getByText("Conversations")).toBeInTheDocument());
    expect(screen.getByText("New chat")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByText("Conversations")).not.toBeInTheDocument());
  });
});

describe("Chat input behaviour", () => {
  function ChatInput({ onSend }: { onSend: (v: string) => void }) {
    const [v, setV] = useState("");
    const send = () => {
      if (!v.trim()) return;
      onSend(v.trim());
      setV("");
    };
    return (
      <div>
        <textarea
          aria-label="message"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={send} disabled={!v.trim()}>Send</button>
      </div>
    );
  }

  SCREENS.forEach(({ name, width }) => {
    it(`sends a message and clears input on ${name}`, () => {
      setViewport(width);
      const onSend = vi.fn();
      render(<ChatInput onSend={onSend} />);
      const ta = screen.getByLabelText("message") as HTMLTextAreaElement;

      fireEvent.change(ta, { target: { value: "হ্যালো" } });
      expect((screen.getByText("Send") as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(screen.getByText("Send"));
      expect(onSend).toHaveBeenCalledWith("হ্যালো");
      expect(ta.value).toBe("");
    });
  });

  it("submits on Enter, inserts newline on Shift+Enter", () => {
    setViewport(390);
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const ta = screen.getByLabelText("message") as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hi");

    fireEvent.change(ta, { target: { value: "line1" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("ignores empty / whitespace-only submissions", () => {
    setViewport(360);
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("message"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Send"));
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("Streaming token append", () => {
  function Streamer({ chunks }: { chunks: string[] }) {
    const [text, setText] = useState("");
    return (
      <div>
        <button
          onClick={async () => {
            for (const c of chunks) {
              await new Promise((r) => setTimeout(r, 1));
              setText((t) => t + c);
            }
          }}
        >
          start
        </button>
        <div data-testid="stream">{text}</div>
      </div>
    );
  }

  SCREENS.forEach(({ name, width }) => {
    it(`accumulates streamed chunks on ${name}`, async () => {
      setViewport(width);
      render(<Streamer chunks={["আমি ", "Shahed ", "AI"]} />);
      fireEvent.click(screen.getByText("start"));
      await waitFor(() =>
        expect(screen.getByTestId("stream")).toHaveTextContent("আমি Shahed AI")
      );
    });
  });
});

describe("Toaster", () => {
  function ToastHarness() {
    const { toast } = useToast();
    return (
      <>
        <Button onClick={() => toast({ title: "সীমা শেষ", description: "আজকের কোটা শেষ" })}>
          fire
        </Button>
        <Toaster />
      </>
    );
  }

  SCREENS.forEach(({ name, width }) => {
    it(`renders a toast on ${name}`, async () => {
      setViewport(width);
      render(<ToastHarness />);
      fireEvent.click(screen.getByText("fire"));
      await waitFor(() => expect(screen.getByText("সীমা শেষ")).toBeInTheDocument());
      expect(screen.getByText("আজকের কোটা শেষ")).toBeInTheDocument();
    });
  });
});
