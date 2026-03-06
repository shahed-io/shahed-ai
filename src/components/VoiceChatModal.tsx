import { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic, MicOff, Volume2, VolumeX, Loader2, Phone, ChevronDown, Check } from "lucide-react";
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

// ====== Voice Language Models ======
interface VoiceModel {
  id: string;
  label: string;
  lang: string;        // STT lang code
  ttsLang: string;     // TTS lang code
  flag: string;
  description: string;
}

const VOICE_MODELS: VoiceModel[] = [
  {
    id: "bn",
    label: "বাংলা",
    lang: "bn-BD",
    ttsLang: "bn-BD",
    flag: "🇧🇩",
    description: "বাংলায় কথা বলুন ও শুনুন",
  },
  {
    id: "en",
    label: "English",
    lang: "en-US",
    ttsLang: "en-US",
    flag: "🇺🇸",
    description: "Speak and listen in English",
  },
  {
    id: "hi",
    label: "हिन्दी",
    lang: "hi-IN",
    ttsLang: "hi-IN",
    flag: "🇮🇳",
    description: "हिंदी में बोलें और सुनें",
  },
];

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
  const [selectedVoice, setSelectedVoice] = useState<VoiceModel>(VOICE_MODELS[0]);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SpeechRecognition =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const hasSpeechSupport = !!SpeechRecognition;

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

  const stopAll = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  // Pick best matching TTS voice for given lang
  const getBestVoice = useCallback((ttsLang: string) => {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find(v => v.lang === ttsLang) ||
      voices.find(v => v.lang.startsWith(ttsLang.split("-")[0])) ||
      null
    );
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (isMuted) { onEnd?.(); return; }
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const best = getBestVoice(selectedVoice.ttsLang);
      if (best) utterance.voice = best;
      utterance.lang = selectedVoice.ttsLang;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => { setVoiceState("idle"); onEnd?.(); };
      utterance.onerror = () => { setVoiceState("idle"); onEnd?.(); };
      setVoiceState("speaking");
      synth.speak(utterance);
    },
    [isMuted, selectedVoice, getBestVoice]
  );

  const sendToAI = useCallback(
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
          ...conversationHistory.slice(-10),
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
        const cleaned = fullContent.replace(/([A-Za-z0-9])\s*।/g, "$1");
        onAIResponse(cleaned);
        setAiText(cleaned);
        const speakText = cleaned
          .replace(/```[\s\S]*?```/g, selectedVoice.id === "bn" ? " কোড ব্লক। " : " code block. ")
          .replace(/`[^`]*`/g, selectedVoice.id === "bn" ? " কোড। " : " code. ")
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/\*(.*?)\*/g, "$1")
          .replace(/#{1,6}\s/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .slice(0, 600);
        speak(speakText, () => {
          if (autoListen) autoListenTimerRef.current = setTimeout(() => startListening(), 700);
        });
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message ?? "ত্রুটি হয়েছে");
        setVoiceState("idle");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationHistory, selectedModelId, speak, onAIResponse, autoListen, selectedVoice]
  );

  const startListening = useCallback(() => {
    if (!SpeechRecognition) { setError("আপনার ব্রাউজার ভয়েস সাপোর্ট করে না"); return; }
    window.speechSynthesis?.cancel();
    setVoiceState("listening");
    setTranscript("");
    setError(null);
    const recognition = new SpeechRecognition();
    recognition.lang = selectedVoice.lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition._lastTranscript = "";
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results as SpeechRecognitionResultList).map((r: any) => r[0].transcript).join("");
      setTranscript(t);
      recognition._lastTranscript = t;
    };
    recognition.onend = () => {
      const final = recognition._lastTranscript;
      if (final?.trim()) sendToAI(final);
      else setVoiceState("idle");
      recognitionRef.current = null;
    };
    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") { setError("মাইক্রোফোন ত্রুটি: " + e.error); setVoiceState("idle"); }
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognition, selectedVoice, sendToAI]);

  const handleMicClick = () => {
    if (voiceState === "listening") { recognitionRef.current?.stop(); }
    else if (voiceState === "speaking") { window.speechSynthesis?.cancel(); setVoiceState("idle"); }
    else if (voiceState === "idle") startListening();
  };

  const handleClose = () => { stopAll(); onClose(); };

  const waveBarCount = 24;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={handleClose} />

      <div className="relative w-full max-w-sm mx-3 mb-0 sm:mb-0 bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">
        {/* Top accent gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
              <Phone className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold font-bn text-sm">লাইভ ভয়েস চ্যাট</p>
              <p className="text-[10px] text-muted-foreground">Shahed AI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }} className="p-2 rounded-xl hover:bg-muted transition-colors" title={isMuted ? "সাউন্ড চালু" : "মিউট"}>
              {isMuted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button onClick={handleClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Voice Language Selector */}
        <div className="px-4 pb-3">
          <div className="relative">
            <button
              onClick={() => setVoicePickerOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border border-border bg-muted/40 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{selectedVoice.flag}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold font-bn">{selectedVoice.label}</p>
                  <p className="text-[10px] text-muted-foreground font-bn">{selectedVoice.description}</p>
                </div>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", voicePickerOpen && "rotate-180")} />
            </button>

            {voicePickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setVoicePickerOpen(false)} />
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-2xl shadow-xl z-20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground font-bn">ভয়েস ভাষা বেছে নিন</p>
                  </div>
                  {VOICE_MODELS.map(vm => {
                    const isSelected = selectedVoice.id === vm.id;
                    return (
                      <button
                        key={vm.id}
                        onClick={() => { setSelectedVoice(vm); setVoicePickerOpen(false); }}
                        className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left", isSelected && "bg-primary/10")}
                      >
                        <span className="text-2xl">{vm.flag}</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold font-bn">{vm.label}</p>
                          <p className="text-xs text-muted-foreground font-bn">{vm.description}</p>
                        </div>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Orb + Waveform */}
        <div className="flex flex-col items-center justify-center px-6 py-6">
          <div className="relative mb-5">
            {voiceState !== "idle" && (
              <>
                <div className="absolute -inset-6 rounded-full opacity-15 animate-ping" style={{ background: "hsl(var(--primary))", animationDuration: "1.5s" }} />
                <div className="absolute -inset-3 rounded-full opacity-25 animate-ping" style={{ background: "hsl(var(--primary))", animationDuration: "1s", animationDelay: "0.3s" }} />
              </>
            )}
            <button
              onClick={handleMicClick}
              disabled={voiceState === "thinking"}
              className={cn(
                "relative h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95",
                voiceState === "listening" ? "bg-destructive text-white scale-110" :
                voiceState === "thinking"  ? "bg-primary/20 text-primary cursor-wait" :
                voiceState === "speaking"  ? "bg-primary/25 text-primary" :
                "bg-foreground text-background hover:opacity-90"
              )}
            >
              {voiceState === "thinking" ? <Loader2 className="h-8 w-8 animate-spin" /> :
               voiceState === "listening" ? <MicOff className="h-8 w-8" /> :
               voiceState === "speaking"  ? <Volume2 className="h-8 w-8" /> :
               <Mic className="h-8 w-8" />}
            </button>
          </div>

          {/* Waveform bars */}
          <div className="flex items-center gap-[2px] h-8 mb-3">
            {Array.from({ length: waveBarCount }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-all",
                  voiceState === "listening" ? "bg-destructive" :
                  voiceState === "speaking"  ? "bg-primary" :
                  voiceState === "thinking"  ? "bg-primary/40" :
                  "bg-muted-foreground/25"
                )}
                style={{
                  height: voiceState !== "idle" ? `${10 + Math.sin((i / waveBarCount) * Math.PI * 3) * 10}px` : "3px",
                  animation: voiceState !== "idle" ? `voice-bar ${0.4 + (i % 6) * 0.08}s ease-in-out infinite alternate` : "none",
                  animationDelay: `${i * 0.03}s`,
                }}
              />
            ))}
          </div>

          <p className={cn(
            "text-sm font-bn font-medium text-center",
            voiceState === "listening" ? "text-destructive" :
            voiceState === "thinking"  ? "text-primary" :
            voiceState === "speaking"  ? "text-primary" :
            "text-muted-foreground"
          )}>
            {voiceState === "listening" ? `${selectedVoice.flag} শুনছি...` :
             voiceState === "thinking"  ? "Shahed AI ভাবছে..." :
             voiceState === "speaking"  ? `${selectedVoice.flag} Shahed AI বলছে...` :
             hasSpeechSupport ? "মাইক বাটনে চাপুন এবং কথা বলুন" :
             "ব্রাউজার ভয়েস সাপোর্ট করে না"}
          </p>
          {error && <p className="mt-1 text-xs text-destructive font-bn text-center">{error}</p>}
        </div>

        {/* Transcript / AI text */}
        <div className="px-4 pb-3 space-y-2 max-h-28 overflow-y-auto">
          {transcript && voiceState === "listening" && (
            <div className="px-3 py-2 rounded-2xl bg-muted text-sm font-bn text-right">
              <span className="text-[10px] text-muted-foreground block mb-0.5">আপনি বলছেন:</span>
              {transcript}
            </div>
          )}
          {aiText && (voiceState === "thinking" || voiceState === "speaking") && (
            <div className="px-3 py-2 rounded-2xl text-sm font-bn" style={{ background: "hsl(var(--primary) / 0.07)", border: "1px solid hsl(var(--primary) / 0.15)" }}>
              <span className="text-[10px] text-primary block mb-0.5">Shahed AI:</span>
              <p className="line-clamp-3">{aiText}</p>
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
          <p className="text-[10px] text-muted-foreground">{isMuted ? "🔇 মিউট" : "🔊 সাউন্ড চালু"}</p>
        </div>

        <div className="pb-safe h-1" />
      </div>

      <style>{`
        @keyframes voice-bar {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1.3); }
        }
      `}</style>
    </div>
  );
}
