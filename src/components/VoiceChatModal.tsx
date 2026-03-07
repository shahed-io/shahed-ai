import { useState, useEffect, useRef, useCallback } from "react";
import { X, Volume2, VolumeX, Mic, MicOff, Loader2 } from "lucide-react";
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

// Clean markdown for TTS
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
    .slice(0, 500);
}

// Pick Bengali voice
function pickBengaliVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefs = ["bn-BD", "bn-IN", "bn"];
  for (const pref of prefs) {
    const exact = voices.find(v => v.lang === pref);
    if (exact) return exact;
    const partial = voices.find(v => v.lang.startsWith(pref));
    if (partial) return partial;
  }
  return voices[0] || null;
}

export default function VoiceChatModal({
  open,
  onClose,
  conversationHistory,
  onAIResponse,
}: VoiceChatModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [autoListen, setAutoListen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMutedRef      = useRef(isMuted);
  const autoListenRef   = useRef(autoListen);
  const voiceStateRef   = useRef<VoiceState>("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convRef         = useRef(conversationHistory);
  const onAIResponseRef = useRef(onAIResponse);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { autoListenRef.current = autoListen; }, [autoListen]);
  useEffect(() => { convRef.current = conversationHistory; }, [conversationHistory]);
  useEffect(() => { onAIResponseRef.current = onAIResponse; }, [onAIResponse]);

  const setVS = (s: VoiceState) => { voiceStateRef.current = s; setVoiceState(s); };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR: any = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

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

  // TTS — বাংলা voice
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (isMutedRef.current || !text) { setVS("idle"); onDone?.(); return; }

    const synth = window.speechSynthesis;
    synth.cancel();

    let called = false;

    const doSpeak = () => {
      if (called) return;
      called = true;

      const utt = new SpeechSynthesisUtterance(text);
      const voice = pickBengaliVoice();
      if (voice) utt.voice = voice;
      utt.lang   = "bn-BD";
      utt.rate   = 0.88;
      utt.pitch  = 1.0;
      utt.volume = 1.0;

      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setVS("idle");
        onDone?.();
      };

      utt.onstart = () => setVS("speaking");
      utt.onend   = finish;
      utt.onerror = (ev) => {
        if (ev.error === "interrupted" || ev.error === "canceled") return;
        finish();
      };

      setVS("speaking");
      synth.speak(utt);

      const duration = Math.max(5000, text.length * 100);
      timerRef.current = setTimeout(() => {
        if (voiceStateRef.current === "speaking") { synth.cancel(); finish(); }
      }, duration);
    };

    const voices = synth.getVoices();
    if (voices.length === 0) {
      const handler = () => { synth.removeEventListener("voiceschanged", handler); doSpeak(); };
      synth.addEventListener("voiceschanged", handler);
      setTimeout(() => { synth.removeEventListener("voiceschanged", handler); doSpeak(); }, 800);
    } else {
      doSpeak();
    }
  }, []);

  // LLM — Gemini 2.5 Flash, always Bengali
  const sendToAI = useCallback(async (userMsg: string) => {
    if (!userMsg.trim()) return;
    setVS("thinking");
    setAiText("");
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const VOICE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-chat`;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const messages = [
        ...convRef.current.slice(-6),
        { role: "user", content: userMsg },
      ];

      const resp = await fetch(VOICE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        let errMsg = "সার্ভার ত্রুটি হয়েছে";
        try { const d = await resp.json(); errMsg = d.error ?? errMsg; } catch { /* ignore */ }
        if (resp.status === 429) errMsg = "AI সার্ভিস ব্যস্ত। একটু পরে চেষ্টা করুন।";
        if (resp.status === 402) errMsg = "AI ক্রেডিট শেষ।";
        throw new Error(errMsg);
      }
      if (!resp.body) throw new Error("কোনো response নেই");

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
          } catch { /* partial */ }
        }
      }

      if (!full) throw new Error("AI কোনো উত্তর দেয়নি। আবার চেষ্টা করুন।");

      onAIResponseRef.current(full);

      const ttsText = cleanForTTS(full);
      speak(ttsText, () => {
        if (autoListenRef.current) timerRef.current = setTimeout(() => startListening(), 700);
      });
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message ?? "অজানা ত্রুটি");
      setVS("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak]);

  // STT — বাংলা only
  const startListening = useCallback(() => {
    if (!SR) { setError("আপনার ব্রাউজার ভয়েস সাপোর্ট করে না। Chrome ব্যবহার করুন।"); return; }

    window.speechSynthesis?.cancel();
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { /* ignore */ } recognitionRef.current = null; }

    setVS("listening");
    setTranscript("");
    setAiText("");
    setError(null);

    const rec = new SR();
    rec.lang = "bn-BD"; // সবসময় বাংলা
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
      if (spoken) sendToAI(spoken);
      else setVS("idle");
    };

    rec.onerror = (e: { error: string }) => {
      recognitionRef.current = null;
      if (e.error === "aborted" || e.error === "no-speech") { setVS("idle"); return; }
      setError("মাইক্রোফোন ত্রুটি: " + e.error);
      setVS("idle");
    };

    recognitionRef.current = rec;
    try { rec.start(); }
    catch { setError("মাইক্রোফোন শুরু করতে পারছি না"); setVS("idle"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SR, sendToAI]);

  const handleMicClick = () => {
    if (voiceState === "listening") { recognitionRef.current?.stop(); setVS("idle"); }
    else if (voiceState === "speaking") { window.speechSynthesis?.cancel(); if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } setVS("idle"); }
    else if (voiceState === "thinking") { abortRef.current?.abort(); setVS("idle"); }
    else startListening();
  };

  const handleClose = () => { stopAll(); onClose(); };

  if (!open) return null;

  const stateLabel = {
    idle:      "মাইক বাটন চেপে বাংলায় কথা বলুন",
    listening: "🎙️ শুনছি... বাংলায় কথা বলুন",
    thinking:  "⏳ Shahed AI উত্তর তৈরি করছে...",
    speaking:  "🔊 Shahed AI বলছে...",
  }[voiceState];

  const isActive = voiceState !== "idle";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={handleClose} />

      <div className="relative w-full max-w-sm mx-3 bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">

        {/* Top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl flex items-center justify-center shadow"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
              <Mic className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm font-bn">বাংলা ভয়েস চ্যাট</p>
              <p className="text-[11px] text-muted-foreground">Gemini 2.5 Flash • বাংলায় কথা বলুন</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setIsMuted(v => !v); if (!isMuted) window.speechSynthesis?.cancel(); }}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
              title={isMuted ? "মিউট চালু আছে" : "মিউট করুন"}
            >
              {isMuted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button onClick={handleClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Waveform / State Visual */}
        <div className="flex flex-col items-center px-6 py-6 gap-5">

          {/* Big mic button */}
          <button
            onClick={handleMicClick}
            className={cn(
              "relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg",
              voiceState === "listening" && "scale-110",
              voiceState === "speaking"  && "scale-105",
            )}
            style={{
              background: voiceState === "idle"
                ? "hsl(var(--muted))"
                : voiceState === "listening"
                ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))"
                : voiceState === "thinking"
                ? "hsl(var(--muted))"
                : "linear-gradient(135deg, hsl(var(--accent)), hsl(var(--primary)))",
              boxShadow: isActive
                ? "0 0 0 12px hsl(var(--primary) / 0.15), 0 8px 32px hsl(var(--primary) / 0.3)"
                : undefined,
            }}
          >
            {/* Pulse rings when listening */}
            {voiceState === "listening" && (
              <>
                <span className="absolute inset-0 rounded-full animate-ping opacity-30"
                  style={{ background: "hsl(var(--primary))" }} />
                <span className="absolute -inset-2 rounded-full animate-ping opacity-20 animation-delay-150"
                  style={{ background: "hsl(var(--primary))" }} />
              </>
            )}

            {voiceState === "thinking"
              ? <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
              : voiceState === "listening"
              ? <Mic className="h-10 w-10 text-white" />
              : voiceState === "speaking"
              ? <Volume2 className="h-10 w-10 text-white" />
              : <Mic className="h-10 w-10 text-muted-foreground" />
            }
          </button>

          {/* Status label */}
          <p className="text-sm text-center text-muted-foreground font-bn min-h-[20px]">{stateLabel}</p>

          {/* Transcript */}
          {transcript && (
            <div className="w-full rounded-2xl px-4 py-3 text-sm font-bn text-center"
              style={{ background: "hsl(var(--muted))" }}>
              <span className="text-xs text-muted-foreground block mb-1">আপনি বললেন:</span>
              <span className="text-foreground">{transcript}</span>
            </div>
          )}

          {/* AI Response */}
          {aiText && (
            <div className="w-full rounded-2xl px-4 py-3 text-sm font-bn text-center"
              style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
              <span className="text-xs text-primary block mb-1">Shahed AI বলছে:</span>
              <span className="text-foreground">{aiText}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="w-full rounded-2xl px-4 py-3 text-sm font-bn text-center text-destructive"
              style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.2)" }}>
              {error}
            </div>
          )}
        </div>

        {/* Auto-listen toggle + hint */}
        <div className="flex items-center justify-between px-5 pb-5 gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setAutoListen(v => !v)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                autoListen ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <div className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                autoListen ? "translate-x-5" : "translate-x-0.5"
              )} />
            </div>
            <span className="text-xs text-muted-foreground font-bn">অটো শুনুন</span>
          </label>
          <p className="text-[11px] text-muted-foreground font-bn text-right">
            {voiceState === "listening" ? "বলা শেষ হলে থামুন" : "মাইক চাপুন → বলুন → উত্তর শুনুন"}
          </p>
        </div>

      </div>
    </div>
  );
}
