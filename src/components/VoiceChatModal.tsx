import { useState, useEffect, useRef, useCallback } from "react";
import { X, Volume2, VolumeX, Loader2 } from "lucide-react";
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

const BENGALI_STT_LANG = "bn-BD";

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
  const [error, setError] = useState<string | null>(null);
  const [autoListen, setAutoListen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const SpeechRecognition =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const hasSpeechSupport = !!SpeechRecognition;

  const stopAll = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!open) {
      stopAll();
      setTranscript("");
      setAiText("");
      setVoiceState("idle");
      setError(null);
    }
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Find best Bengali TTS voice
  const getBengaliVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find(v => v.lang === "bn-BD") ||
      voices.find(v => v.lang === "bn-IN") ||
      voices.find(v => v.lang.startsWith("bn")) ||
      voices.find(v => v.name.toLowerCase().includes("bengali") || v.name.toLowerCase().includes("bangla")) ||
      voices[0] || // fallback to first available voice
      null
    );
  }, []);

  const startListeningFn = useCallback(() => {
    if (!SpeechRecognition) { setError("আপনার ব্রাউজার ভয়েস সাপোর্ট করে না"); return; }
    window.speechSynthesis?.cancel();
    setVoiceState("listening");
    setTranscript("");
    setError(null);
    const recognition = new SpeechRecognition();
    recognition.lang = BENGALI_STT_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition._lastTranscript = "";
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join("");
      setTranscript(t);
      recognition._lastTranscript = t;
    };
    recognition.onend = () => {
      const final = recognition._lastTranscript;
      recognitionRef.current = null;
      if (final?.trim()) sendToAIFn(final);
      else setVoiceState("idle");
    };
    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") { setError("মাইক্রোফোন ত্রুটি: " + e.error); setVoiceState("idle"); }
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SpeechRecognition]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (isMutedRef.current) { onEnd?.(); return; }
      const synth = window.speechSynthesis;
      synth.cancel();

      const doSpeak = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        const best = getBengaliVoice();
        if (best) utterance.voice = best;
        utterance.lang = "bn-BD";
        utterance.rate = 0.88;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onstart = () => setVoiceState("speaking");
        utterance.onend = () => {
          setVoiceState("idle");
          onEnd?.();
        };
        utterance.onerror = (ev) => {
          console.warn("TTS error:", ev.error);
          setVoiceState("idle");
          onEnd?.();
        };
        setVoiceState("speaking");
        synth.speak(utterance);
      };

      // Chrome needs voices to be loaded — wait for voiceschanged if empty
      const voices = synth.getVoices();
      if (voices.length === 0) {
        const handler = () => { synth.removeEventListener("voiceschanged", handler); doSpeak(); };
        synth.addEventListener("voiceschanged", handler);
        // Fallback: if event never fires, just speak after 400ms
        setTimeout(() => { if (synth.getVoices().length > 0) doSpeak(); }, 400);
      } else {
        doSpeak();
      }
    },
    [getBengaliVoice]
  );

  // Use a ref to always have fresh `speak` & `autoListen` in sendToAI
  const speakRef = useRef(speak);
  const autoListenRef = useRef(autoListen);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  useEffect(() => { autoListenRef.current = autoListen; }, [autoListen]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sendToAIFn = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;
      setVoiceState("thinking");
      setAiText("");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const messages = [
          ...conversationHistory.slice(-8),
          { role: "user", content: userMessage },
        ];

        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ messages, model: selectedModelId }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "সার্ভার ত্রুটি" }));
          throw new Error(err.error ?? "সার্ভার ত্রুটি");
        }
        if (!resp.body) throw new Error("No stream");
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ""; let fullContent = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") break;
            try {
              const parsed = JSON.parse(json);
              const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (chunk) { fullContent += chunk; setAiText(fullContent); }
            } catch { /* partial */ }
          }
        }

        onAIResponse(fullContent);

        // Clean text for TTS
        const speakText = fullContent
          .replace(/```[\s\S]*?```/g, " কোড ব্লক। ")
          .replace(/`[^`]*`/g, " কোড। ")
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/\*(.*?)\*/g, "$1")
          .replace(/#{1,6}\s/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/\s{2,}/g, " ")
          .trim()
          .slice(0, 600);

        if (speakText) {
          speakRef.current(speakText, () => {
            if (autoListenRef.current) {
              autoListenTimerRef.current = setTimeout(() => startListeningFn(), 700);
            }
          });
        } else {
          setVoiceState("idle");
        }
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message ?? "ত্রুটি হয়েছে");
        setVoiceState("idle");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationHistory, selectedModelId, onAIResponse, startListeningFn]
  );

  const handleMicClick = () => {
    if (voiceState === "listening") { recognitionRef.current?.stop(); setVoiceState("idle"); }
    else if (voiceState === "speaking") { window.speechSynthesis?.cancel(); setVoiceState("idle"); }
    else if (voiceState === "idle") startListeningFn();
  };

  const handleClose = () => { stopAll(); onClose(); };

  const waveBarCount = 28;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={handleClose} />

      <div className="relative w-full max-w-sm mx-3 mb-0 sm:mb-0 bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">

        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
              {/* Waveform icon */}
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white fill-white">
                <rect x="2" y="9" width="2" height="6" rx="1"/>
                <rect x="6" y="5" width="2" height="14" rx="1"/>
                <rect x="10" y="7" width="2" height="10" rx="1"/>
                <rect x="14" y="3" width="2" height="18" rx="1"/>
                <rect x="18" y="6" width="2" height="12" rx="1"/>
                <rect x="22" y="9" width="2" height="6" rx="1"/>
              </svg>
            </div>
            <div>
              <p className="font-semibold font-bn text-sm">লাইভ ভয়েস চ্যাট</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm">🇧🇩</span>
                <p className="text-[11px] text-muted-foreground font-bn">বাংলা ভাষা</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
              title={isMuted ? "সাউন্ড চালু" : "মিউট"}
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

        {/* Orb + Waveform */}
        <div className="flex flex-col items-center justify-center px-6 pt-2 pb-6">

          {/* Animated orb */}
          <div className="relative mb-6">
            {voiceState !== "idle" && (
              <>
                <div className="absolute -inset-8 rounded-full opacity-10 animate-ping" style={{ background: "hsl(var(--primary))", animationDuration: "2s" }} />
                <div className="absolute -inset-4 rounded-full opacity-20 animate-ping" style={{ background: "hsl(var(--primary))", animationDuration: "1.2s", animationDelay: "0.3s" }} />
              </>
            )}
            <button
              onClick={handleMicClick}
              disabled={voiceState === "thinking"}
              className={cn(
                "relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95",
                voiceState === "listening" ? "scale-110" :
                voiceState === "thinking"  ? "cursor-wait" :
                voiceState === "speaking"  ? "scale-105" :
                "hover:opacity-90"
              )}
              style={{
                background:
                  voiceState === "listening" ? "hsl(var(--destructive))" :
                  voiceState === "thinking"  ? "hsl(var(--primary) / 0.15)" :
                  voiceState === "speaking"  ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" :
                  "hsl(var(--foreground))",
              }}
            >
              {voiceState === "thinking" ? (
                <Loader2 className="h-9 w-9 animate-spin" style={{ color: "hsl(var(--primary))" }} />
              ) : voiceState === "listening" ? (
                /* Animated mic bars */
                <svg viewBox="0 0 40 40" className="h-10 w-10 fill-white">
                  <rect x="6" y="18" width="4" height="8" rx="2" style={{ animation: "voice-bar 0.5s ease-in-out infinite alternate" }} />
                  <rect x="12" y="13" width="4" height="18" rx="2" style={{ animation: "voice-bar 0.4s ease-in-out infinite alternate", animationDelay: "0.1s" }} />
                  <rect x="18" y="10" width="4" height="24" rx="2" style={{ animation: "voice-bar 0.35s ease-in-out infinite alternate", animationDelay: "0.05s" }} />
                  <rect x="24" y="13" width="4" height="18" rx="2" style={{ animation: "voice-bar 0.45s ease-in-out infinite alternate", animationDelay: "0.15s" }} />
                  <rect x="30" y="18" width="4" height="8" rx="2" style={{ animation: "voice-bar 0.5s ease-in-out infinite alternate", animationDelay: "0.2s" }} />
                </svg>
              ) : voiceState === "speaking" ? (
                <Volume2 className="h-9 w-9 text-white" />
              ) : (
                /* Idle: static waveform */
                <svg viewBox="0 0 40 40" className="h-10 w-10" style={{ color: "hsl(var(--background))" }}>
                  <rect x="6" y="16" width="4" height="8" rx="2" fill="currentColor" opacity="0.9"/>
                  <rect x="12" y="12" width="4" height="16" rx="2" fill="currentColor" opacity="0.9"/>
                  <rect x="18" y="8" width="4" height="24" rx="2" fill="currentColor" opacity="0.9"/>
                  <rect x="24" y="12" width="4" height="16" rx="2" fill="currentColor" opacity="0.9"/>
                  <rect x="30" y="16" width="4" height="8" rx="2" fill="currentColor" opacity="0.9"/>
                </svg>
              )}
            </button>
          </div>

          {/* Status label */}
          <p className={cn(
            "text-sm font-bn font-semibold text-center mb-4",
            voiceState === "listening" ? "text-destructive" :
            voiceState === "thinking"  ? "text-primary" :
            voiceState === "speaking"  ? "text-primary" :
            "text-muted-foreground"
          )}>
            {voiceState === "listening" ? "🎙️ শুনছি... কথা বলুন" :
             voiceState === "thinking"  ? "⏳ Shahed AI ভাবছে..." :
             voiceState === "speaking"  ? "🔊 Shahed AI বলছে..." :
             hasSpeechSupport ? "বাটনে চাপুন ও বাংলায় কথা বলুন" :
             "⚠️ ব্রাউজার ভয়েস সাপোর্ট করে না"}
          </p>

          {/* Waveform bars */}
          <div className="flex items-center gap-[3px] h-10 mb-2">
            {Array.from({ length: waveBarCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: "3px",
                  backgroundColor:
                    voiceState === "listening" ? "hsl(var(--destructive))" :
                    voiceState === "speaking"  ? "hsl(var(--primary))" :
                    voiceState === "thinking"  ? "hsl(var(--primary) / 0.5)" :
                    "hsl(var(--muted-foreground) / 0.25)",
                  height: voiceState !== "idle" ? `${8 + Math.abs(Math.sin((i / waveBarCount) * Math.PI * 4)) * 20}px` : "3px",
                  animation: voiceState !== "idle" ? `voice-bar ${0.35 + (i % 7) * 0.07}s ease-in-out infinite alternate` : "none",
                  animationDelay: `${i * 0.025}s`,
                }}
              />
            ))}
          </div>

          {error && (
            <p className="mt-2 text-xs text-destructive font-bn text-center bg-destructive/10 px-3 py-1.5 rounded-xl">
              ⚠️ {error}
            </p>
          )}
        </div>

        {/* Transcript / AI text */}
        <div className="px-4 pb-3 space-y-2 max-h-32 overflow-y-auto">
          {transcript && voiceState === "listening" && (
            <div className="px-3 py-2.5 rounded-2xl bg-muted text-sm font-bn text-right">
              <span className="text-[10px] text-muted-foreground block mb-1">আপনি বলছেন:</span>
              {transcript}
            </div>
          )}
          {aiText && (voiceState === "thinking" || voiceState === "speaking") && (
            <div
              className="px-3 py-2.5 rounded-2xl text-sm font-bn"
              style={{ background: "hsl(var(--primary) / 0.07)", border: "1px solid hsl(var(--primary) / 0.15)" }}
            >
              <span className="text-[10px] text-primary block mb-1 font-semibold">Shahed AI:</span>
              <p className="line-clamp-3 leading-relaxed">{aiText}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-5 pt-2 flex items-center justify-between border-t border-border">
          <button
            onClick={() => setAutoListen(v => !v)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bn transition-colors",
              autoListen ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground"
            )}
          >
            <div className={cn("w-7 h-4 rounded-full transition-colors flex items-center px-0.5", autoListen ? "bg-primary" : "bg-muted-foreground/30")}>
              <div className={cn("w-3 h-3 rounded-full bg-white shadow-sm transition-transform", autoListen ? "translate-x-3" : "translate-x-0")} />
            </div>
            অটো-লিসেন
          </button>
          <p className="text-[10px] text-muted-foreground font-bn">
            {isMuted ? "🔇 মিউট করা আছে" : "🔊 সাউন্ড চালু"}
          </p>
        </div>

        <div className="pb-safe h-1" />
      </div>

      <style>{`
        @keyframes voice-bar {
          0%   { transform: scaleY(0.3); }
          100% { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}
