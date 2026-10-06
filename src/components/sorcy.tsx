"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic, MicOff, Send, Sparkles, X, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SorcyAction, SorcyChart, SorcyReply, SorcyTurn } from "@/lib/sorcy-types";

// Minimal Web Speech API typings (not in every TS DOM lib).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Status = "idle" | "listening" | "thinking" | "speaking";

export function Sorcy() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [chart, setChart] = useState<SorcyChart | null>(null);
  const [typed, setTyped] = useState("");
  const [muted, setMuted] = useState(false);
  const history = useRef<SorcyTurn[]>([]);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (muted || !text) return setStatus("idle");
      setStatus("speaking");
      try {
        const res = await fetch("/api/sorcy/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.status === 200) {
          const url = URL.createObjectURL(await res.blob());
          const a = new Audio(url);
          audioRef.current = a;
          a.onended = () => {
            URL.revokeObjectURL(url);
            setStatus("idle");
          };
          await a.play();
          return;
        }
      } catch {
        /* fall through to the browser voice */
      }
      const synth = window.speechSynthesis;
      if (!synth) return setStatus("idle");
      const u = new SpeechSynthesisUtterance(text);
      const voice = synth.getVoices().find((v) => /en-(IE|GB)/i.test(v.lang));
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onend = () => setStatus("idle");
      synth.speak(u);
    },
    [muted],
  );

  const run = useCallback(
    (actions: SorcyAction[]) => {
      let nextChart: SorcyChart | null = null;
      for (const a of actions) {
        if (a.type === "navigate") router.push(a.href);
        if (a.type === "chart") nextChart = a.chart;
      }
      setChart(nextChart);
    },
    [router],
  );

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) return;
      stopSpeaking();
      setHeard(q);
      setReply("");
      setError("");
      setStatus("thinking");
      try {
        const res = await fetch("/api/sorcy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: q, path: pathname, history: history.current }),
        });
        const data = (await res.json()) as SorcyReply;
        if (!res.ok || data.error) {
          setError(data.error || "Sorcy couldn't answer.");
          setStatus("idle");
          return;
        }
        history.current = [...history.current, { role: "user" as const, content: q }, { role: "assistant" as const, content: data.reply }].slice(-8);
        setReply(data.reply);
        run(data.actions);
        void speak(data.reply);
      } catch {
        setError("Couldn't reach Sorcy. Check your connection.");
        setStatus("idle");
      }
    },
    [pathname, run, speak, stopSpeaking],
  );

  const listen = useCallback(() => {
    const Ctor = speechCtor();
    setOpen(true);
    if (!Ctor) {
      setError("Voice input isn't supported in this browser. Type instead, or use Chrome.");
      return;
    }
    if (status === "listening") {
      recRef.current?.stop();
      return;
    }
    stopSpeaking();
    setError("");
    const rec = new Ctor();
    rec.lang = "en-IE";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setHeard((finalText + " " + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Microphone: ${e.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      if (finalText.trim()) void ask(finalText);
      else setStatus((s) => (s === "listening" ? "idle" : s));
    };
    recRef.current = rec;
    setHeard("");
    setStatus("listening");
    rec.start();
  }, [ask, status, stopSpeaking]);

  // Option/Alt + S: talk to Sorcy from anywhere. Esc: close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        listen();
      } else if (e.key === "Escape" && open) {
        recRef.current?.stop();
        stopSpeaking();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listen, open, stopSpeaking]);

  const statusText =
    status === "listening" ? "Listening…" : status === "thinking" ? "Thinking…" : status === "speaking" ? "Speaking…" : "Ask me anything";

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="glass w-[min(92vw,380px)] rounded-2xl border border-line p-4 shadow-xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink">Sorcy</p>
              <p className={cn("text-xs", status === "listening" ? "text-accent-600" : "text-ink-faint")}>{statusText}</p>
            </div>
            <button
              onClick={() => setMuted((m) => !m)}
              className="ml-auto rounded-lg p-1.5 text-ink-faint hover:bg-fill hover:text-ink"
              aria-label={muted ? "Turn voice on" : "Mute voice"}
              title={muted ? "Voice off" : "Voice on"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                recRef.current?.stop();
                stopSpeaking();
                setOpen(false);
              }}
              className="rounded-lg p-1.5 text-ink-faint hover:bg-fill hover:text-ink"
              aria-label="Close Sorcy"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {heard && <p className="rounded-xl bg-fill px-3 py-2 text-sm text-ink-muted">“{heard}”</p>}
            {reply && <p className="text-sm text-ink">{reply}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {chart && <SorcyBarChart chart={chart} />}
            {!heard && !reply && !error && (
              <p className="text-xs text-ink-faint">
                Try: “How many leads came in today?”, “Who needs to pay?”, “Show me a graph for each department”, “Take me to
                check-ins”. Press <kbd className="rounded border border-line px-1">⌥ S</kbd> to talk.
              </p>
            )}
          </div>

          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = typed;
              setTyped("");
              void ask(t);
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type a question…"
              className="h-9 flex-1 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-400"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!typed.trim() || status === "thinking"}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-muted hover:bg-fill disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => (open ? listen() : setOpen(true))}
        className={cn(
          "flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 px-5 text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(43,127,255,0.7)] transition-transform active:scale-95",
          status === "listening" && "ring-4 ring-accent-500/40",
        )}
        aria-label={open ? (status === "listening" ? "Stop listening" : "Talk to Sorcy") : "Open Sorcy"}
        title="Sorcy (⌥ S)"
      >
        {status === "listening" ? <MicOff className="h-5 w-5" /> : open ? <Mic className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {open ? (status === "listening" ? "Stop" : "Talk") : "Sorcy"}
      </button>
    </div>
  );
}

/** Single-series horizontal bars: one brand colour, value labels, hover titles, and a table for screen readers. */
function SorcyBarChart({ chart }: { chart: SorcyChart }) {
  const max = Math.max(1, ...chart.bars.map((b) => b.value));
  const bars = chart.bars.slice(0, 14);
  return (
    <figure className="rounded-xl border border-line bg-white p-3">
      <figcaption className="mb-2">
        <p className="text-sm font-semibold text-ink">{chart.title}</p>
        {chart.subtitle && <p className="text-xs text-ink-faint">{chart.subtitle}</p>}
      </figcaption>
      {bars.length === 0 ? (
        <p className="text-xs text-ink-faint">Nothing to show for this period.</p>
      ) : (
        <div className="space-y-1.5" aria-hidden="true">
          {bars.map((b) => (
            <div key={b.label} className="group" title={`${b.label}: ${b.value}${chart.unit ? ` ${chart.unit}` : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-ink-muted">{b.label}</span>
                <span className="font-medium tabular-nums text-ink">{b.value}</span>
              </div>
              <div className="mt-0.5 h-2.5 w-full rounded bg-fill">
                <div
                  className="h-2.5 rounded bg-brand-500 transition-[width] group-hover:bg-brand-600"
                  style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>{chart.title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{b.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
