"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic, Send, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SourciAction,
  SourciCard,
  SourciChart,
  SourciConfirm,
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

/** Sourci: the team's AI, built into the CRM. Opens full screen; ⌥S to talk, Esc to close. */
export interface SourciDemo {
  heard?: string;
  reply?: string;
  card?: SourciCard;
  pipeline?: SourciPipeline;
  confirm?: SourciConfirm;
  chart?: SourciChart;
}

export function Sourci({ demo }: { demo?: SourciDemo } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(Boolean(demo));
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

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (muted || !text) return setStatus("ready");
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
            setStatus("ready");
          };
          await a.play();
          return;
        }
      } catch {
        /* fall back to the browser voice */
      }
      const synth = window.speechSynthesis;
      if (!synth) return setStatus("ready");
      const u = new SpeechSynthesisUtterance(text);
      const voice = synth.getVoices().find((v) => /en-(IE|GB)/i.test(v.lang));
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onend = () => setStatus("ready");
      synth.speak(u);
    },
    [muted],
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
        for (const a of data.actions) if (a.type === "navigate") nav = a.href;
        setChart(nextChart?.type === "chart" ? nextChart.chart : null);
        setCard(nextCard?.type === "card" ? nextCard.card : null);
        setPipeline(nextPipe?.type === "pipeline" ? nextPipe.pipeline : null);
        setPending(nextConfirm?.type === "confirm" ? nextConfirm.confirm : null);
        shown = Boolean(nextChart || nextCard || nextPipe || nextConfirm);
        setReply(data.reply);
        if (nav) {
          router.push(nav);
          if (!shown) setOpen(false); // just a page change: show the page
        }
        void speak(data.reply);
      } catch {
        setError("Couldn't reach Sourci. Check your connection.");
        setStatus("ready");
      }
    },
    [cancel, confirm, pathname, pending, router, speak, stopSpeaking],
  );

  const listen = useCallback(() => {
    setOpen(true);
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
      if (finalText.trim()) void ask(finalText);
      else setStatus((s) => (s === "listening" ? "ready" : s));
    };
    recRef.current = rec;
    setHeard("");
    setStatus("listening");
    rec.start();
  }, [ask, status, stopSpeaking]);

  const close = useCallback(() => {
    recRef.current?.stop();
    stopSpeaking();
    setOpen(false);
  }, [stopSpeaking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        listen();
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, listen, open]);

  const hasContent = Boolean(chart || card || pipeline || pending || done);
  const statusLabel = { ready: "READY", listening: "● LISTENING", working: "○ WORKING…", speaking: "● SPEAKING" }[status];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#071018] py-2 pl-2 pr-4 text-sm font-semibold tracking-wide text-cyan-100 shadow-[0_10px_30px_-8px_rgba(34,211,238,0.55)] ring-1 ring-cyan-400/30"
        aria-label="Open Sourci"
        title="Sourci (⌥ S)"
        style={{ position: "fixed" }}
      >
        <Orb size={32} />
        SOURCI
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#04080d] text-slate-200"
      role="dialog"
      aria-label="Sourci"
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage:
          "radial-gradient(ellipse at 50% 35%, rgba(34,211,238,0.10), transparent 60%), linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 48px 48px, 48px 48px",
      }}
    >
      {/* top bar */}
      <div className="flex items-center gap-3 px-5 py-3 font-mono text-[11px] tracking-[0.18em] text-cyan-300/70">
        <span className="text-cyan-300">● ONLINE</span>
        <span className="ml-auto hidden sm:inline">SOURCI · SYS 2.0 · CRM LINK ESTABLISHED</span>
        <button onClick={() => setMuted((m) => !m)} className="ml-auto rounded p-1.5 hover:bg-white/5 sm:ml-3" aria-label={muted ? "Turn voice on" : "Mute voice"}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button onClick={close} className="rounded p-1.5 hover:bg-white/5" aria-label="Close Sourci">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* what you said + status */}
      <div className="flex items-center gap-3 px-5 pb-2">
        <Orb size={22} />
        <p className="min-w-0 flex-1 truncate font-mono text-sm text-slate-300">
          {heard ? `“${heard}”` : <span className="text-slate-500">Listening for your request…</span>}
        </p>
        <span className={cn("shrink-0 font-mono text-[10px] tracking-[0.2em]", status === "listening" ? "text-orange-400" : "text-cyan-300/80")}>
          {statusLabel}
        </span>
      </div>

      {/* stage */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-y-auto overflow-x-hidden px-4 py-6">
        {status === "listening" && !hasContent ? (
          <Waveform />
        ) : !hasContent ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="relative flex items-center justify-center">
              <span className="absolute h-56 w-56 rounded-full border border-cyan-300/10" />
              <span className="absolute h-40 w-40 rounded-full border border-cyan-300/15" />
              <Orb size={96} pulse={status !== "ready"} />
            </div>
            <p className="text-5xl font-black tracking-[0.08em] text-cyan-50 drop-shadow-[0_0_24px_rgba(34,211,238,0.6)] sm:text-6xl">SOURCI</p>
            <p className="font-mono text-sm text-slate-400">Just ask.</p>
          </div>
        ) : (
          <div className="grid w-full min-w-0 max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
            {pipeline && <PipelinePanel p={pipeline} />}
            {card && <CardPanel c={card} />}
            {chart && <ChartPanel c={chart} />}
            {pending && <ConfirmPanel c={pending} onYes={() => void confirm()} onNo={cancel} busy={status === "working"} />}
            {done && (
              <DonePanel
                d={done}
                onOpen={(href) => {
                  router.push(href);
                  close();
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Sourci's reply */}
      <div className="flex min-h-[44px] justify-center px-4">
        {(reply || error) && (
          <p
            className={cn(
              "sourci-anim max-w-3xl rounded-lg border px-3 py-2 font-mono text-sm",
              error ? "border-rose-400/30 bg-rose-500/10 text-rose-200" : "border-cyan-300/20 bg-cyan-300/5 text-slate-200",
            )}
            style={{ animation: "sourci-in .25s ease-out" }}
          >
            <span className="text-cyan-300">SOURCI ›</span> {error || reply}
          </p>
        )}
      </div>

      {/* input */}
      <form
        className="mx-auto mb-5 mt-3 flex w-full max-w-2xl items-center gap-2 px-4"
        onSubmit={(e) => {
          e.preventDefault();
          const t = typed;
          setTyped("");
          void ask(t);
        }}
      >
        <button
          type="button"
          onClick={listen}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 transition",
            status === "listening" ? "bg-orange-500/20 text-orange-300 ring-orange-400/50" : "bg-cyan-400/10 text-cyan-200 ring-cyan-300/30 hover:bg-cyan-400/20",
          )}
          aria-label={status === "listening" ? "Stop listening" : "Talk"}
          title="Talk (⌥ S)"
        >
          <Mic className="h-5 w-5" />
        </button>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={pending ? "Say or type yes / no…" : "Ask Sourci anything…"}
          maxLength={500}
          className="h-11 min-w-0 flex-1 rounded-full border border-cyan-300/20 bg-white/5 px-4 font-mono text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-300/50"
        />
        <button
          type="submit"
          disabled={!typed.trim() || status === "working"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cyan-200 ring-1 ring-cyan-300/30 hover:bg-cyan-400/10 disabled:opacity-30"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <p className="pb-3 text-center font-mono text-[10px] tracking-[0.2em] text-slate-600">⌥ S TO TALK · ESC TO CLOSE</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Orb({ size, pulse }: { size: number; pulse?: boolean }) {
  return (
    <span
      className="sourci-anim inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 30%, #effcff 0%, #67e8f9 32%, #0891b2 70%, #164e63 100%)",
        boxShadow: `0 0 ${size / 2}px rgba(34,211,238,0.55), 0 0 ${size}px rgba(34,211,238,0.25)`,
        animation: pulse ? "sourci-pulse 1.6s ease-in-out infinite" : undefined,
      }}
      aria-hidden="true"
    />
  );
}

function Waveform() {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-mono text-[11px] tracking-[0.3em] text-orange-400">LISTENING</p>
      <div className="flex h-16 items-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="sourci-anim block w-[3px] rounded-full bg-orange-400/90"
            style={{
              height: `${30 + ((i * 37) % 70)}%`,
              animation: `sourci-wave ${0.7 + ((i * 13) % 7) / 10}s ease-in-out ${(i % 9) * 0.07}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
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
    <Panel className="md:col-span-2">
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
    <>
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
    </>
  );
}

function ChartPanel({ c }: { c: SourciChart }) {
  const bars = c.bars.slice(0, 14);
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <Panel className="md:col-span-2">
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
    <Panel className="md:col-span-2 border-amber-300/30">
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
    <Panel className="relative md:col-span-2">
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
