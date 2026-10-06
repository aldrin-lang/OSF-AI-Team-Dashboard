"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Keyboard, Send, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SourciAction,
  SourciCard,
  SourciChart,
  SourciConfirm,
  SourciDashboard,
  SourciPipeline,
  SourciReply,
  SourciTurn,
} from "@/lib/sourci-types";

// ---------------------------------------------------------------------------
// Web Speech API (minimal typings; not in every TS DOM lib)
// ---------------------------------------------------------------------------
interface RecResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecEvent {
  resultIndex: number;
  results: ArrayLike<RecResult>;
}
interface Rec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecCtor = new () => Rec;
function recCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Status = "ready" | "listening" | "working" | "speaking";
type Done = Extract<SourciAction, { type: "done" }>;

const YES = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|confirm(ed)?|do it|go ahead|send it|create it|please do|correct)\b/i;
const NO = /^\s*(no|nope|cancel|stop|don'?t|never ?mind|not now)\b/i;

/**
 * Sourci: the team's AI, built into the CRM. A glowing orb in the corner:
 * click (or ⌥S) to talk, click again to stop. Short answers show in a bubble;
 * charts, briefs and confirmations open a side panel. Esc closes.
 */
export interface SourciDemo {
  heard?: string;
  reply?: string;
  card?: SourciCard;
  pipeline?: SourciPipeline;
  confirm?: SourciConfirm;
  chart?: SourciChart;
  dashboard?: SourciDashboard;
}

export function Sourci({ demo }: { demo?: SourciDemo } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(Boolean(demo && (demo.card || demo.pipeline || demo.confirm || demo.chart || demo.dashboard)));
  const [dash, setDash] = useState<SourciDashboard | null>(demo?.dashboard ?? null);
  const [bubble, setBubble] = useState(Boolean(demo));
  const [typing, setTyping] = useState(false);
  const [status, setStatus] = useState<Status>("ready");
  const [heard, setHeard] = useState(demo?.heard ?? "");
  const [reply, setReply] = useState(demo?.reply ?? "");
  const [error, setError] = useState("");
  const [chart, setChart] = useState<SourciChart | null>(demo?.chart ?? null);
  const [card, setCard] = useState<SourciCard | null>(demo?.card ?? null);
  const [pipeline, setPipeline] = useState<SourciPipeline | null>(demo?.pipeline ?? null);
  const [pending, setPending] = useState<SourciConfirm | null>(demo?.confirm ?? null);
  const [done, setDone] = useState<Done | null>(null);
  const [typed, setTyped] = useState("");
  const [muted, setMuted] = useState(false);
  const history = useRef<SourciTurn[]>([]);
  const recRef = useRef<Rec | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Conversation mode: after Sourci answers a spoken question, it listens again.
  const convoRef = useRef(false);
  const listenRef = useRef<(() => void) | null>(null);
  const afterSpeak = useCallback(() => {
    setStatus("ready");
    if (convoRef.current) setTimeout(() => listenRef.current?.(), 350);
  }, []);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (muted || !text) return afterSpeak();
      setStatus("speaking");
      try {
        const res = await fetch("/api/sourci/speak", {
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
            afterSpeak();
          };
          await a.play();
          return;
        }
      } catch {
        /* fall back to the browser voice */
      }
      const synth = window.speechSynthesis;
      if (!synth) return afterSpeak();
      const u = new SpeechSynthesisUtterance(text);
      const voice = synth.getVoices().find((v) => /en-(IE|GB)/i.test(v.lang));
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onend = () => afterSpeak();
      synth.speak(u);
    },
    [afterSpeak, muted],
  );

  const remember = (role: SourciTurn["role"], content: string) => {
    history.current = [...history.current, { role, content }].slice(-8);
  };

  const confirm = useCallback(async () => {
    if (!pending) return;
    const c = pending;
    setPending(null);
    setStatus("working");
    setError("");
    try {
      const res = await fetch("/api/sourci/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: c.proposal }),
      });
      const r = (await res.json()) as { ok: boolean; message: string; stamp?: string; title?: string; href?: string };
      setReply(r.message);
      remember("assistant", r.ok ? `Done: ${r.message}` : r.message);
      if (r.ok) {
        setDone({ type: "done", stamp: r.stamp ?? "DONE", title: r.title ?? c.title, detail: r.message, href: r.href });
        router.refresh();
      } else {
        setError(r.message);
      }
      void speak(r.message);
    } catch {
      setError("Couldn't reach Sourci.");
      setStatus("ready");
    }
  }, [pending, router, speak]);

  const cancel = useCallback(() => {
    setPending(null);
    const m = "No problem, I've left it.";
    setReply(m);
    remember("assistant", "Cancelled, nothing was changed.");
    void speak(m);
  }, [speak]);

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) return;
      stopSpeaking();
      setHeard(q);
      setError("");
      // A spoken yes/no answers the pending confirmation directly.
      if (pending && YES.test(q)) return void confirm();
      if (pending && NO.test(q)) return cancel();
      if (/^\s*(thanks|thank you|cheers|that'?s all|that is all|stop|bye|goodbye|nothing)\b/i.test(q) && q.split(/\s+/).length <= 5) {
        convoRef.current = false;
        setReply("Anytime.");
        return void speak("Anytime.");
      }

      setReply("");
      setDone(null);
      setStatus("working");
      try {
        const res = await fetch("/api/sourci", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: q, path: pathname, history: history.current }),
        });
        const data = (await res.json()) as SourciReply;
        if (!res.ok || data.error) {
          setError(data.error || "Sourci couldn't answer.");
          setStatus("ready");
          return;
        }
        remember("user", q);
        remember("assistant", data.reply);
        let nav: string | null = null;
        let shown = false;
        const nextChart = data.actions.find((a) => a.type === "chart");
        const nextCard = data.actions.find((a) => a.type === "card");
        const nextPipe = data.actions.find((a) => a.type === "pipeline");
        const nextConfirm = data.actions.find((a) => a.type === "confirm");
        const nextDash = data.actions.find((a) => a.type === "dashboard");
        for (const a of data.actions) if (a.type === "navigate") nav = a.href;
        setChart(nextChart?.type === "chart" ? nextChart.chart : null);
        setCard(nextCard?.type === "card" ? nextCard.card : null);
        setPipeline(nextPipe?.type === "pipeline" ? nextPipe.pipeline : null);
        setPending(nextConfirm?.type === "confirm" ? nextConfirm.confirm : null);
        setDash(nextDash?.type === "dashboard" ? nextDash.dashboard : null);
        shown = Boolean(nextChart || nextCard || nextPipe || nextConfirm || nextDash);
        setReply(data.reply);
        setBubble(true);
        if (shown) setPanelOpen(true);
        else setPanelOpen(false);
        if (nav) router.push(nav);
        void speak(data.reply);
      } catch {
        setError("Couldn't reach Sourci. Check your connection.");
        setStatus("ready");
      }
    },
    [cancel, confirm, pathname, pending, router, speak, stopSpeaking],
  );

  const listen = useCallback(() => {
    setBubble(true);
    const Ctor = recCtor();
    if (!Ctor) {
      setError("Voice input needs Chrome. You can type instead.");
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
      if (finalText.trim()) {
        convoRef.current = true;
        void ask(finalText);
      } else {
        convoRef.current = false; // silence ends the conversation
        setStatus((s) => (s === "listening" ? "ready" : s));
      }
    };
    recRef.current = rec;
    setHeard("");
    setStatus("listening");
    rec.start();
  }, [ask, status, stopSpeaking]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const close = useCallback(() => {
    convoRef.current = false;
    recRef.current?.stop();
    stopSpeaking();
    setStatus((st) => (st === "working" ? st : "ready"));
    setPanelOpen(false);
    setBubble(false);
    setTyping(false);
  }, [stopSpeaking]);

  /** Orb click / ⌥S: start listening, or stop whatever Sourci is doing. */
  const toggle = useCallback(() => {
    if (status === "listening") {
      convoRef.current = false;
      return recRef.current?.stop();
    }
    if (status === "speaking") {
      convoRef.current = false;
      stopSpeaking();
      return setStatus("ready");
    }
    if (status === "working") return;
    listen();
  }, [listen, status, stopSpeaking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && (panelOpen || bubble)) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bubble, close, panelOpen, toggle]);

  const hasPanel = Boolean(dash || chart || card || pipeline || pending || done);
  const caption = {
    ready: "Click the orb or press ⌥S to talk",
    listening: "Listening… click the orb to stop",
    working: "Working on it…",
    speaking: "Speaking… click the orb to stop",
  }[status];

  return (
    <>
      {/* pop-up dashboard in the middle of the CRM; you can keep talking while it's open */}
      {panelOpen && hasPanel && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ position: "fixed" }}>
          <section
            className="sourci-anim pointer-events-auto flex max-h-[80vh] w-[min(94vw,880px)] flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#05090f]/95 text-slate-200 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),0_0_60px_-30px_rgba(34,211,238,0.6)] backdrop-blur"
            style={{ animation: "sourci-in .25s ease-out" }}
            aria-label="Sourci results"
          >
            <div className="flex items-center gap-2 border-b border-cyan-300/10 px-4 py-3">
              <Orb size={18} pulse={status === "listening"} glow={status !== "ready"} />
              <p className="font-mono text-[11px] tracking-[0.25em] text-cyan-200">SOURCI</p>
              <p className="ml-2 min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">{heard ? `“${heard}”` : ""}</p>
              <button onClick={() => setPanelOpen(false)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {dash && (
                <DashboardPanel
                  d={dash}
                  onOpen={(href) => {
                    router.push(href);
                    setPanelOpen(false);
                  }}
                />
              )}
              {pipeline && <PipelinePanel p={pipeline} />}
              {card && <CardPanel c={card} />}
              {chart && <ChartPanel c={chart} />}
              {pending && <ConfirmPanel c={pending} onYes={() => void confirm()} onNo={cancel} busy={status === "working"} />}
              {done && <DonePanel d={done} onOpen={(href) => router.push(href)} />}
            </div>
          </section>
        </div>
      )}

      {/* bubble + orb in the corner */}
      <div
        className="fixed bottom-5 right-5 z-[61] flex flex-col items-end gap-2"
        style={{ position: "fixed" }}
      >
        {bubble && (
          <div
            className="sourci-anim w-[min(86vw,340px)] rounded-2xl border border-cyan-300/20 bg-[#05090f]/95 p-3 text-slate-200 shadow-xl backdrop-blur"
            style={{ animation: "sourci-in .2s ease-out" }}
          >
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.18em] text-cyan-300/80">
                {status === "listening" ? <span className="text-orange-400">● LISTENING</span> : status === "working" ? "○ WORKING…" : status === "speaking" ? "● SPEAKING" : "SOURCI"}
              </p>
              <button onClick={() => setMuted((m) => !m)} className="text-slate-500 hover:text-white" aria-label={muted ? "Turn voice on" : "Mute voice"}>
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <button onClick={close} className="text-slate-500 hover:text-white" aria-label="Close Sourci">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {heard && <p className="mt-1.5 text-xs text-slate-400">“{heard}”</p>}
            {status === "listening" && !heard && <MiniWave />}
            {(error || reply) && (
              <p className={cn("mt-1.5 text-sm", error ? "text-rose-300" : "text-slate-100")}>{error || reply}</p>
            )}
            {!heard && !reply && !error && status === "ready" && <p className="mt-1.5 text-xs text-slate-400">{caption}</p>}
            {hasPanel && !panelOpen && (
              <button onClick={() => setPanelOpen(true)} className="mt-2 text-xs font-semibold text-cyan-300 hover:underline">
                Show details →
              </button>
            )}
            {typing && (
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = typed;
                  setTyped("");
                  convoRef.current = false;
                  void ask(t);
                }}
              >
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={pending ? "yes / no…" : "Type to Sourci…"}
                  maxLength={500}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-cyan-300/20 bg-white/5 px-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-300/50"
                />
                <button type="submit" disabled={!typed.trim()} className="rounded-lg px-2 text-cyan-200 ring-1 ring-cyan-300/30 disabled:opacity-30" aria-label="Send">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setBubble(true);
              setTyping((t) => !t);
            }}
            className="rounded-full bg-[#05090f]/80 p-2 text-slate-400 opacity-60 ring-1 ring-white/10 transition hover:opacity-100"
            aria-label="Type instead"
            title="Type instead"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <OrbButton status={status} onClick={toggle} />
        </div>
      </div>
    </>
  );
}

/** The corner orb. Calm when idle; glows and pulses while listening; spinning ring while working; ripples while speaking. */
function OrbButton({ status, onClick }: { status: Status; onClick: () => void }) {
  const label = { ready: "Talk to Sourci (⌥S)", listening: "Stop listening", working: "Sourci is working", speaking: "Stop speaking" }[status];
  return (
    <button onClick={onClick} className="relative flex h-14 w-14 items-center justify-center rounded-full" aria-label={label} title={label}>
      {status === "speaking" && (
        <>
          <span className="sourci-anim absolute inset-0 rounded-full border-2 border-cyan-300/60" style={{ animation: "sourci-ring 1.4s ease-out infinite" }} />
          <span className="sourci-anim absolute inset-0 rounded-full border-2 border-cyan-300/40" style={{ animation: "sourci-ring 1.4s ease-out .7s infinite" }} />
        </>
      )}
      {status === "working" && (
        <span
          className="sourci-anim absolute -inset-1.5 rounded-full border-2 border-transparent border-t-cyan-300 border-r-cyan-300/40"
          style={{ animation: "sourci-spin .9s linear infinite" }}
        />
      )}
      {status === "listening" && <span className="absolute -inset-2 rounded-full bg-cyan-400/25 blur-md" />}
      <Orb size={status === "listening" ? 56 : 48} pulse={status === "listening"} glow={status !== "ready"} />
    </button>
  );
}

function MiniWave() {
  return (
    <div className="mt-2 flex h-6 items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="sourci-anim block w-[2px] rounded-full bg-orange-400/90"
          style={{ height: `${30 + ((i * 37) % 70)}%`, animation: `sourci-wave ${0.7 + ((i * 13) % 7) / 10}s ease-in-out ${(i % 9) * 0.07}s infinite` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Orb({ size, pulse, glow }: { size: number; pulse?: boolean; glow?: boolean }) {
  return (
    <span
      className="sourci-anim inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 30%, #effcff 0%, #67e8f9 32%, #0891b2 70%, #164e63 100%)",
        boxShadow: glow
          ? `0 0 ${size * 0.7}px rgba(34,211,238,0.8), 0 0 ${size * 1.4}px rgba(34,211,238,0.4)`
          : `0 0 ${size / 3}px rgba(34,211,238,0.45), 0 0 ${size * 0.7}px rgba(34,211,238,0.18)`,
        animation: pulse ? "sourci-pulse 1.6s ease-in-out infinite" : undefined,
      }}
      aria-hidden="true"
    />
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("sourci-anim min-w-0 rounded-xl border border-cyan-300/15 bg-[#0a1520]/90 p-5 shadow-[0_0_40px_-20px_rgba(34,211,238,0.5)]", className)}
      style={{ animation: "sourci-in .3s ease-out" }}
    >
      {children}
    </div>
  );
}

const Eyebrow = ({ children, tone = "cyan" }: { children: React.ReactNode; tone?: "cyan" | "red" }) => (
  <p className={cn("font-mono text-[10px] tracking-[0.22em]", tone === "red" ? "text-rose-300" : "text-cyan-300/80")}>{children}</p>
);

function CardPanel({ c }: { c: SourciCard }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        {c.eyebrow && <Eyebrow>{c.eyebrow}</Eyebrow>}
        <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 font-mono text-[10px] tracking-widest text-cyan-200">READY ✓</span>
      </div>
      <h3 className="mt-2 text-2xl font-bold text-white">{c.title}</h3>
      {!!c.facts?.length && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {c.facts.map((f) => (
            <div key={f.label} className="rounded-lg bg-white/[0.04] px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{f.label}</p>
              <p className="mt-0.5 text-sm text-slate-100">{f.value}</p>
            </div>
          ))}
        </div>
      )}
      {!!c.bullets?.length && (
        <div className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Talking points</p>
          <ol className="mt-1 space-y-1 text-sm text-slate-100">
            {c.bullets.map((b, i) => (
              <li key={i}>
                {i + 1} · {b}
              </li>
            ))}
          </ol>
        </div>
      )}
      {c.headsUp && (
        <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2">
          <Eyebrow tone="red">HEADS UP</Eyebrow>
          <p className="mt-0.5 text-sm text-rose-100">{c.headsUp}</p>
        </div>
      )}
    </Panel>
  );
}

function PipelinePanel({ p }: { p: SourciPipeline }) {
  const max = Math.max(1, ...p.stages.map((s) => s.value));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel>
        <Eyebrow>PIPELINE · NOW</Eyebrow>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="text-6xl font-black text-white">{p.total}</span>
          <span className="text-sm text-slate-400">{p.label}</span>
        </p>
        <div className="mt-4 flex h-36 items-end gap-3" role="img" aria-label={p.stages.map((s) => `${s.label} ${s.value}`).join(", ")}>
          {p.stages.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${s.label}: ${s.value}`}>
              <span className="text-sm font-semibold text-slate-100">{s.value}</span>
              <span
                className="w-full rounded-t bg-gradient-to-t from-cyan-700/60 to-cyan-300"
                style={{ height: `${Math.max(4, (s.value / max) * 100)}px` }}
              />
              <span className="w-full truncate text-center font-mono text-[9px] uppercase tracking-wider text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <Eyebrow tone="red">NEEDS ATTENTION · {p.attention.length}</Eyebrow>
        {p.attention.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Nothing urgent. Nice.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {p.attention.map((a, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                <span>
                  <span className="block text-sm font-semibold text-slate-100">{a.title}</span>
                  <span className="block text-xs text-slate-400">{a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function DashboardPanel({ d, onOpen }: { d: SourciDashboard; onOpen: (href: string) => void }) {
  const max = Math.max(1, ...(d.bars ?? []).map((b) => b.value));
  return (
    <Panel>
      <Eyebrow>{d.eyebrow}</Eyebrow>
      <h3 className="mt-1 text-2xl font-bold text-white">{d.title}</h3>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {d.stats.map((st) => (
          <div key={st.label} className="rounded-lg bg-white/[0.04] px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{st.label}</p>
            <p className={cn("mt-1 text-lg font-bold tabular-nums", st.tone === "alert" ? "text-orange-300" : st.tone === "good" ? "text-emerald-300" : "text-white")}>
              {st.value}
            </p>
          </div>
        ))}
      </div>
      {!!d.bars?.length && (
        <div className="mt-4 space-y-1.5">
          {d.bars.slice(0, 6).map((b) => (
            <div key={b.label} title={`${b.label}: ${b.value}`}>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{b.label}</span>
                <span className="font-semibold tabular-nums text-slate-100">{b.value}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-white/[0.06]">
                <div className="h-2 rounded bg-cyan-300" style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {d.list && d.list.items.length > 0 && (
        <div className="mt-4">
          <Eyebrow tone={d.list.items.some((x) => x.tone === "alert") ? "red" : "cyan"}>
            {d.list.title.toUpperCase()} · {d.list.items.length}
          </Eyebrow>
          <ul className="mt-2 space-y-1.5">
            {d.list.items.map((it, i) => (
              <li key={i}>
                <button
                  disabled={!it.href}
                  onClick={() => it.href && onOpen(it.href)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition",
                    it.tone === "alert" ? "border-rose-400/20 bg-rose-500/[0.07] hover:bg-rose-500/[0.14]" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.07]",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", it.tone === "alert" ? "bg-orange-400" : "bg-cyan-300/70")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-100">{it.title}</span>
                    {it.detail && <span className="block truncate text-xs text-slate-400">{it.detail}</span>}
                  </span>
                  {it.href && <span className="self-center text-xs text-cyan-300">Open →</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.link && (
        <button onClick={() => onOpen(d.link!.href)} className="mt-4 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#04080d] hover:bg-cyan-200">
          {d.link.label} →
        </button>
      )}
    </Panel>
  );
}

function ChartPanel({ c }: { c: SourciChart }) {
  const bars = c.bars.slice(0, 14);
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <Panel>
      <Eyebrow>{(c.subtitle ?? "").toUpperCase() || "CHART"}</Eyebrow>
      <h3 className="mt-1 text-lg font-bold text-white">{c.title}</h3>
      {bars.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nothing to show for this period.</p>
      ) : (
        <div className="mt-4 space-y-2" aria-hidden="true">
          {bars.map((b) => (
            <div key={b.label} title={`${b.label}: ${b.value}${c.unit ? ` ${c.unit}` : ""}`}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="truncate text-slate-400">{b.label}</span>
                <span className="font-semibold tabular-nums text-slate-100">{b.value}</span>
              </div>
              <div className="mt-1 h-2.5 rounded bg-white/[0.06]">
                <div className="h-2.5 rounded bg-cyan-300" style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>{c.title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{b.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function ConfirmPanel({ c, onYes, onNo, busy }: { c: SourciConfirm; onYes: () => void; onNo: () => void; busy: boolean }) {
  return (
    <Panel className="border-amber-300/30">
      <Eyebrow>AWAITING YOUR OK</Eyebrow>
      <h3 className="mt-1 text-xl font-bold text-white">{c.title}</h3>
      <dl className="mt-3 space-y-2">
        {c.preview.map((r) => (
          <div key={r.label} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
            <dt className="font-mono text-[11px] uppercase tracking-[0.15em] text-slate-500">{r.label}</dt>
            <dd className="whitespace-pre-wrap break-words text-slate-100">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onYes}
          disabled={busy}
          className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-[#04080d] hover:bg-cyan-200 disabled:opacity-50"
        >
          Yes, do it
        </button>
        <button onClick={onNo} disabled={busy} className="rounded-full px-5 py-2 text-sm text-slate-300 ring-1 ring-white/15 hover:bg-white/5">
          Cancel
        </button>
        <span className="ml-auto hidden self-center font-mono text-[10px] tracking-widest text-slate-500 sm:inline">OR SAY “YES” / “NO”</span>
      </div>
    </Panel>
  );
}

function DonePanel({ d, onOpen }: { d: Done; onOpen: (href: string) => void }) {
  return (
    <Panel className="relative">
      <Eyebrow>DONE · BY SOURCI</Eyebrow>
      <h3 className="mt-1 text-xl font-bold text-white">{d.title}</h3>
      {d.detail && <p className="mt-1 text-sm text-slate-300">{d.detail}</p>}
      {d.href && (
        <button onClick={() => onOpen(d.href!)} className="mt-3 text-sm font-semibold text-cyan-300 hover:underline">
          Open →
        </button>
      )}
      <span
        className="sourci-anim absolute bottom-4 right-5 rounded-lg border-2 border-cyan-300 px-3 py-1 text-xl font-black tracking-[0.15em] text-cyan-200"
        style={{ animation: "sourci-stamp .35s ease-out forwards", transform: "rotate(-8deg)" }}
      >
        {d.stamp}
      </span>
    </Panel>
  );
}
