import { useState, useEffect, useRef, useCallback } from "react";
import { X, Volume2, VolumeX, Mic, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface VoiceChatModalProps {
  open: boolean;
  onClose: () => void;
  selectedModelId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  onAIResponse: (text: string) => void;
  userToken: string | null;
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

// ── Utility: clean markdown for TTS ───────────────────────────
function cleanForTTS(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " কোড ব্লক। ")
    .replace(/`[^`]*`/g, " কোড। ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, "। ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 700);
}

// ── Utility: pick best voice ───────────────────────────────────
function pickVoice(lang = "bn"): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang === "bn-BD") ||
    voices.find(v => v.lang === "bn-IN") ||
    voices.find(v => v.lang.startsWith(lang)) ||
    voices.find(v => v.name.toLowerCase().includes("bengali") || v.name.toLowerCase().includes("bangla")) ||
    voices[0] ||
    null
  );
}

export default function VoiceChatModal({
  open,
  onClose,
  selectedModelId,
  conversationHistory,
  onAIResponse,
}: VoiceChatModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [autoListen, setAutoListen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable refs to avoid stale closures
  const isMutedRef      = useRef(isMuted);
  const autoListenRef   = useRef(autoListen);
  const voiceStateRef   = useRef<VoiceState>("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convRef         = useRef(conversationHistory);
  const modelRef        = useRef(selectedModelId);
  const onAIResponseRef = useRef(onAIResponse);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { autoListenRef.current = autoListen; }, [autoListen]);
  useEffect(() => { convRef.current = conversationHistory; }, [conversationHistory]);
  useEffect(() => { modelRef.current = selectedModelId; }, [selectedModelId]);
  useEffect(() => { onAIResponseRef.current = onAIResponse; }, [onAIResponse]);

  const setVS = (s: VoiceState) => { voiceStateRef.current = s; setVoiceState(s); };

  // ── SpeechRecognition support ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR: any = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;
  const hasSpeech = !!SR;

  // ── Stop everything ────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { /* ignore */ } recognitionRef.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!open) {
      stopAll();
      setTranscript("");
      setAiText("");
      setVS("idle");
      setError(null);
    }
    return () => stopAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── STEP 3 → Text-to-Speech ────────────────────────────────
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (isMutedRef.current || !text) { setVS("idle"); onDone?.(); return; }

    const synth = window.speechSynthesis;
    synth.cancel();

    const doSpeak = () => {
      const utt = new SpeechSynthesisUtterance(text);
      const voice = pickVoice("bn");
      if (voice) utt.voice = voice;
      utt.lang   = "bn-BD";
      utt.rate   = 0.88;
      utt.pitch  = 1.05;
      utt.volume = 1.0;

      utt.onstart = () => setVS("speaking");
      utt.onend   = () => { setVS("idle"); onDone?.(); };
      utt.onerror = (ev) => {
        console.warn("TTS error:", ev.error);
        setVS("idle");
        onDone?.();
      };

      setVS("speaking");
      synth.speak(utt);

      // Chrome bug: speaking can silently hang — watchdog
      const duration = Math.max(3000, text.length * 80);
      timerRef.current = setTimeout(() => {
        if (voiceStateRef.current === "speaking") {
          synth.cancel();
          setVS("idle");
          onDone?.();
        }
      }, duration);
    };

    const voices = synth.getVoices();
    if (voices.length === 0) {
      const handler = () => { synth.removeEventListener("voiceschanged", handler); doSpeak(); };
      synth.addEventListener("voiceschanged", handler);
      setTimeout(doSpeak, 500); // fallback
    } else {
      doSpeak();
    }
  }, []);

  // ── STEP 2 → LLM ──────────────────────────────────────────
  const sendToAI = useCallback(async (userMsg: string) => {
    if (!userMsg.trim()) return;
    setVS("thinking");
    setAiText("");
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const messages = [
        ...convRef.current.slice(-8),
        { role: "user", content: userMsg },
      ];

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages, model: modelRef.current }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "সার্ভার ত্রুটি" }));
        throw new Error(err.error ?? "সার্ভার ত্রুটি");
      }
      if (!resp.body) throw new Error("No stream");

      // Stream response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) { full += chunk; setAiText(full); }
          } catch { /* partial chunk */ }
        }
      }

      // Save to chat history
      onAIResponseRef.current(full);

      // ── STEP 3: Speak the response ──
      const ttsText = cleanForTTS(full);
      if (ttsText) {
        speak(ttsText, () => {
          // Auto-listen after AI finishes speaking
          if (autoListenRef.current) {
            timerRef.current = setTimeout(() => startListening(), 800);
          }
        });
      } else {
        setVS("idle");
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message ?? "ত্রুটি হয়েছে");
      setVS("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak]);

  // ── STEP 1 → Speech-to-Text ────────────────────────────────
  const startListening = useCallback(() => {
    if (!SR) { setError("আপনার ব্রাউজার ভয়েস সাপোর্ট করে না (Chrome ব্যবহার করুন)"); return; }

    // Stop any ongoing TTS first
    window.speechSynthesis?.cancel();
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { /* ignore */ } recognitionRef.current = null; }

    setVS("listening");
    setTranscript("");
    setAiText("");
    setError(null);

    const rec = new SR();
    rec.lang = "bn-BD";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = "";

    rec.onresult = (e: { results: SpeechRecognitionResultList }) => {
      let interim = "";
      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal) { finalText = e.results[i][0].transcript; break; }
        interim = e.results[i][0].transcript;
      }
      setTranscript(finalText || interim);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      const spoken = finalText.trim();
      if (spoken) {
        // ── STEP 2: Send to AI ──
        sendToAI(spoken);
      } else {
        setVS("idle");
      }
    };

    rec.onerror = (e: { error: string }) => {
      recognitionRef.current = null;
      if (e.error === "aborted" || e.error === "no-speech") { setVS("idle"); return; }
      setError("মাইক্রোফোন ত্রুটি: " + e.error);
      setVS("idle");
    };

    recognitionRef.current = rec;
    try { rec.start(); }
    catch (err) { setError("মাইক্রোফোন শুরু করতে পারছি না"); setVS("idle"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SR, sendToAI]);

  // ── Mic button handler ─────────────────────────────────────
  const handleMicClick = () => {
    if (voiceState === "listening") {
      recognitionRef.current?.stop();
      setVS("idle");
    } else if (voiceState === "speaking") {
      window.speechSynthesis?.cancel();
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setVS("idle");
    } else if (voiceState === "thinking") {
      abortRef.current?.abort();
      setVS("idle");
    } else {
      startListening();
    }
  };

  const handleClose = () => { stopAll(); onClose(); };

  const BAR_COUNT = 30;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={handleClose} />

      <div className="relative w-full max-w-sm mx-3 mb-0 sm:mb-0 bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">

        {/* Top accent */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
                <rect x="2" y="9" width="2" height="6" rx="1"/>
                <rect x="6" y="5" width="2" height="14" rx="1"/>
                <rect x="10" y="7" width="2" height="10" rx="1"/>
                <rect x="14" y="3" width="2" height="18" rx="1"/>
                <rect x="18" y="6" width="2" height="12" rx="1"/>
                <rect x="22" y="9" width="2" height="6" rx="1"/>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm font-bn">লাইভ ভয়েস চ্যাট</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm">🇧🇩</span>
                <p className="text-[11px] text-muted-foreground font-bn">বাংলা • ভয়েস পাইপলাইন</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
              title={isMuted ? "সাউন্ড চালু করুন" : "মিউট করুন"}
            >
              {isMuted
                ? <VolumeX className="h-4 w-4 text-muted-foreground" />
                : <Volume2 className="h-4 w-4 text-foreground" />}
            </button>
            <button onClick={handleClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Pipeline indicator */}
        <div className="flex items-center justify-center gap-2 px-6 mb-4">
          {[
            { label: "ভয়েস",   active: voiceState === "listening" },
            { label: "→",       active: false, arrow: true },
            { label: "AI",      active: voiceState === "thinking"  },
            { label: "→",       active: false, arrow: true },
            { label: "রিপ্লাই", active: voiceState === "speaking"  },
          ].map((step, i) =>
            step.arrow ? (
              <span key={i} className="text-muted-foreground text-xs">→</span>
            ) : (
              <span
                key={i}
                className={cn(
                  "text-[11px] font-bn px-2.5 py-1 rounded-full transition-all duration-300",
                  step.active
                    ? "text-primary-foreground font-semibold"
                    : "text-muted-foreground bg-muted"
                )}
                style={step.active ? { background: "hsl(var(--primary))" } : undefined}
              >
                {step.label}
              </span>
            )
          )}
        </div>

        {/* Orb area */}
        <div className="flex flex-col items-center justify-center px-6 pb-6">

          {/* Animated orb */}
          <div className="relative mb-6">
            {voiceState !== "idle" && (
              <>
                <div
                  className="absolute -inset-10 rounded-full opacity-[0.07] animate-ping"
                  style={{ background: "hsl(var(--primary))", animationDuration: "2s" }}
                />
                <div
                  className="absolute -inset-5 rounded-full opacity-[0.12] animate-ping"
                  style={{ background: "hsl(var(--primary))", animationDuration: "1.3s", animationDelay: "0.25s" }}
                />
              </>
            )}

            <button
              onClick={handleMicClick}
              className={cn(
                "relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 focus:outline-none",
                voiceState === "listening" ? "scale-110" :
                voiceState === "thinking"  ? "opacity-80" :
                voiceState === "speaking"  ? "scale-105" :
                "hover:scale-105"
              )}
              style={{
                background:
                  voiceState === "listening" ? "hsl(var(--destructive))" :
                  voiceState === "thinking"  ? "hsl(var(--primary) / 0.12)" :
                  voiceState === "speaking"  ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" :
                  "hsl(var(--foreground))",
                boxShadow:
                  voiceState === "listening" ? "0 0 30px hsl(var(--destructive) / 0.4)" :
                  voiceState === "speaking"  ? "0 0 30px hsl(var(--primary) / 0.4)" :
                  undefined,
              }}
              title={
                voiceState === "listening" ? "থামান" :
                voiceState === "speaking"  ? "বন্ধ করুন" :
                voiceState === "thinking"  ? "বাতিল করুন" :
                "কথা বলুন"
              }
            >
              {voiceState === "thinking" ? (
                <Loader2 className="h-10 w-10 animate-spin" style={{ color: "hsl(var(--primary))" }} />
              ) : voiceState === "listening" ? (
                /* Animated equalizer bars */
                <svg viewBox="0 0 44 44" className="h-11 w-11">
                  {[5, 11, 17, 23, 29, 35].map((x, i) => (
                    <rect
                      key={x}
                      x={x} rx="2" width="4" fill="white"
                      style={{
                        transformOrigin: `${x + 2}px 22px`,
                        animation: `voice-eq ${0.4 + i * 0.06}s ease-in-out infinite alternate`,
                        animationDelay: `${i * 0.07}s`,
                        height: `${12 + (i % 3) * 8}px`,
                        y: `${22 - (12 + (i % 3) * 8) / 2}`,
                      }}
                    />
                  ))}
                </svg>
              ) : voiceState === "speaking" ? (
                <Volume2 className="h-10 w-10 text-white" />
              ) : (
                <Mic className="h-10 w-10" style={{ color: "hsl(var(--background))" }} />
              )}
            </button>
          </div>

          {/* Status label */}
          <p className={cn(
            "text-sm font-bn font-semibold text-center mb-5 transition-colors",
            voiceState === "listening" ? "text-destructive" :
            voiceState === "thinking"  ? "text-primary" :
            voiceState === "speaking"  ? "text-primary" :
            "text-muted-foreground"
          )}>
            {voiceState === "listening" ? "🎙️ শুনছি... বাংলায় কথা বলুন" :
             voiceState === "thinking"  ? "⏳ Shahed AI উত্তর তৈরি করছে..." :
             voiceState === "speaking"  ? "🔊 Shahed AI উত্তর বলছে..." :
             hasSpeech
               ? "মাইক বাটনে চাপুন ও বাংলায় কথা বলুন"
               : "⚠️ Chrome ব্রাউজার দরকার"}
          </p>

          {/* Waveform visualizer */}
          <div className="flex items-center gap-[2.5px] h-10 mb-3">
            {Array.from({ length: BAR_COUNT }).map((_, i) => {
              const baseH = 4 + Math.abs(Math.sin((i / BAR_COUNT) * Math.PI * 3.5)) * 18;
              return (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: "2.5px",
                    backgroundColor:
                      voiceState === "listening" ? "hsl(var(--destructive))" :
                      voiceState === "speaking"  ? "hsl(var(--primary))" :
                      voiceState === "thinking"  ? "hsl(var(--primary) / 0.4)" :
                      "hsl(var(--muted-foreground) / 0.2)",
                    height: voiceState !== "idle" ? `${baseH}px` : "3px",
                    animation: voiceState !== "idle"
                      ? `voice-eq ${0.3 + (i % 8) * 0.05}s ease-in-out infinite alternate`
                      : "none",
                    animationDelay: `${i * 0.02}s`,
                    transition: "height 0.3s ease, background-color 0.3s ease",
                  }}
                />
              );
            })}
          </div>

          {error && (
            <p className="mt-1 text-xs text-destructive font-bn text-center bg-destructive/10 px-3 py-2 rounded-xl">
              ⚠️ {error}
            </p>
          )}
        </div>

        {/* Transcript & AI text */}
        <div className="px-4 pb-3 space-y-2 max-h-36 overflow-y-auto">
          {transcript && (voiceState === "listening" || voiceState === "thinking") && (
            <div className="px-3 py-2.5 rounded-2xl bg-muted text-sm font-bn text-right">
              <span className="text-[10px] text-muted-foreground block mb-1">আপনি বললেন:</span>
              {transcript}
            </div>
          )}
          {aiText && (voiceState === "thinking" || voiceState === "speaking") && (
            <div
              className="px-3 py-2.5 rounded-2xl text-sm font-bn"
              style={{ background: "hsl(var(--primary) / 0.07)", border: "1px solid hsl(var(--primary) / 0.15)" }}
            >
              <span className="text-[10px] text-primary block mb-1 font-semibold">Shahed AI:</span>
              <p className="line-clamp-4 leading-relaxed">{aiText}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-5 pt-2 flex items-center justify-between border-t border-border">
          <button
            onClick={() => setAutoListen(v => !v)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bn transition-colors",
              autoListen
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-muted text-muted-foreground"
            )}
          >
            <div className={cn(
              "w-7 h-4 rounded-full transition-colors flex items-center px-0.5",
              autoListen ? "bg-primary" : "bg-muted-foreground/30"
            )}>
              <div className={cn(
                "w-3 h-3 rounded-full bg-white shadow-sm transition-transform",
                autoListen ? "translate-x-3" : "translate-x-0"
              )} />
            </div>
            অটো-লিসেন
          </button>
          <p className="text-[10px] text-muted-foreground font-bn">
            {isMuted ? "🔇 মিউট" : "🔊 সাউন্ড চালু"}
          </p>
        </div>

        <div className="pb-safe h-1" />
      </div>

      <style>{`
        @keyframes voice-eq {
          0%   { transform: scaleY(0.25); }
          100% { transform: scaleY(1.5);  }
        }
      `}</style>
    </div>
  );
}
