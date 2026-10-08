"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AudioLines, Check, Keyboard, Send, Volume2, VolumeX, X } from "lucide-react";
import { ackClip, audioCtx, chime, fadeOut, femaleVoice, levelOf, micMeter, playBlob, playMp3, warmAcks } from "@/components/sourci-audio";
import { DEFAULT_VOICE, SOURCI_VOICES, isSourciVoice, type SourciVoice } from "@/lib/sourci-voices";
import { cn } from "@/lib/utils";
import { isNoOrUnclear, isStrongYes, isYes } from "@/lib/confirm-words";
import type {
  SourciAction,
  SourciCard,
  SourciChart,
  SourciConfirm,
  SourciDashboard,
  SourciPipeline,
  SourciProposal,
  SourciReply,
  SourciTurn,
} from "@/lib/sourci-types";

// ---------------------------------------------------------------------------
// Web Speech API (minimal typings; not in every TS DOM lib)
// ---------------------------------------------------------------------------
interface RecResult {
  isFinal: boolean;
  length: number;
  [i: number]: { transcript: string };
}
interface RecEvent {
  resultIndex: number;
  results: ArrayLike<RecResult>;
}
interface Rec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecCtor = new () => Rec;
function recCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Status = "ready" | "listening" | "working" | "speaking";
type Done = Extract<SourciAction, { type: "done" }>;


/** Always-on switches itself off after this long with nothing said (saves the mic/battery). */
const IDLE_OFF_MS = 10 * 60_000;

// Barge-in: words that mean "stop, let me talk" even on their own.
const CUT_IN = new Set(["stop", "wait", "sorry", "hold", "hang", "no", "actually", "cancel", "pause", "hey"]);
const ONLY_CUT_IN = /^\s*(stop|wait|sorry|hold on|hang on|no|actually|cancel|pause|hey( donna| sourci)?)[.!,]*\s*$/i;
const words = (t: string) => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];
/**
 * Is this the user talking over Donna, or the mic hearing Donna's own voice?
 * Echo is mostly words Donna is saying; the user says new words.
 */
function isUserSpeech(heard: string, said: Set<string>): boolean {
  const w = words(heard);
  if (!w.length) return false;
  const fresh = w.filter((x) => !said.has(x));
  if (w.length <= 3 && fresh.some((x) => CUT_IN.has(x))) return true;
  return fresh.length >= 4 || (fresh.length >= 3 && fresh.length / w.length >= 0.5);
}

/**
 * Donna: the team's AI, built into the CRM. A glowing orb in the corner:
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
  const [, setHeard] = useState(demo?.heard ?? "");
  const [on, setOn] = useState(false); // always-on mode: listens until you switch it off
  const [voice, setVoice] = useState<SourciVoice>(() => {
    try {
      const v = typeof window !== "undefined" ? localStorage.getItem("sourci-voice") : null;
      return isSourciVoice(v) ? v : DEFAULT_VOICE;
    } catch {
      return DEFAULT_VOICE;
    }
  });
  const [voiceMenu, setVoiceMenu] = useState(false);
  // live level meters that make the orb move with the voice (hers or yours)
  const outAnRef = useRef<AnalyserNode | null>(null);
  const micRef = useRef<{ analyser: AnalyserNode; stop: () => void } | null>(null);
  const statusRef = useRef<Status>("ready");
  const ackRef = useRef<{ audio: HTMLAudioElement; done: Promise<void> } | null>(null);
  const sayingRef = useRef<{ text: string; audio: HTMLAudioElement | null } | null>(null); // for trimming history when interrupted
  const orbRef = useRef<HTMLSpanElement | null>(null);
  const [reply, setReply] = useState(demo?.reply ?? "");
  const [error, setError] = useState("");
  const [chart, setChart] = useState<SourciChart | null>(demo?.chart ?? null);
  const [card, setCard] = useState<SourciCard | null>(demo?.card ?? null);
  const [pipeline, setPipeline] = useState<SourciPipeline | null>(demo?.pipeline ?? null);
  const [pending, setPending] = useState<SourciConfirm | null>(demo?.confirm ?? null);
  const [done, setDone] = useState<Done | null>(null);
  const [lastUndo, setLastUndo] = useState<SourciProposal | null>(null); // the last bulk change, so "undo" can put it back
  const [typed, setTyped] = useState("");
  const [muted, setMuted] = useState(false);
  const history = useRef<SourciTurn[]>([]);
  // Things you've asked Donna to remember (per browser, max 30) + recent conversation (survives a reload)
  const memoryRef = useRef<string[]>([]);
  useEffect(() => {
    try {
      memoryRef.current = JSON.parse(localStorage.getItem("sourci-memory") ?? "[]");
      history.current = JSON.parse(sessionStorage.getItem("sourci-history") ?? "[]");
    } catch {}
  }, []);
  const recRef = useRef<Rec | null>(null);
  const bargeRef = useRef<Rec | null>(null); // listens while Donna speaks, so you can cut in
  const speakIdRef = useRef(0); // ignores "finished speaking" from a voice we already cut off
  const reqRef = useRef(0); // ignores answers to a question we already replaced
  const askRef = useRef<((t: string, alts?: string[]) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Always-on: once switched on, Donna keeps listening (between answers, while
  // dashboards are open, through silence) until you switch it off.
  const convoRef = useRef(false);
  const lastActivity = useRef(0);
  const listenRef = useRef<(() => void) | null>(null);
  const afterSpeak = useCallback(() => {
    setStatus("ready");
    lastActivity.current = Date.now();
    if (convoRef.current) setTimeout(() => listenRef.current?.(), 350);
  }, []);

  const stopSpeaking = useCallback(() => {
    speakIdRef.current++;
    // If she was cut off mid-sentence, remember only what was actually said.
    const said = sayingRef.current;
    if (said?.audio && !said.audio.ended && said.audio.duration > 0) {
      const frac = Math.min(1, said.audio.currentTime / said.audio.duration);
      const words = said.text.split(/\s+/);
      const cut = words.slice(0, Math.max(1, Math.round(words.length * frac))).join(" ");
      const h = history.current;
      if (h.length && h[h.length - 1].role === "assistant" && frac < 0.95) {
        h[h.length - 1] = { role: "assistant", content: `${cut}… (interrupted)` };
      }
    }
    sayingRef.current = null;
    fadeOut(audioRef.current);
    audioRef.current = null;
    ackRef.current?.audio.pause();
    ackRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const stopBarge = useCallback(() => {
    const b = bargeRef.current;
    bargeRef.current = null;
    if (!b) return;
    b.onresult = null;
    b.onend = null;
    b.onerror = null;
    try {
      b.abort();
    } catch {}
  }, []);

  /** While Donna talks, keep an ear open: if you start talking, it stops and listens to you. */
  const startBarge = useCallback(
    (spoken: string) => {
      const Ctor = recCtor();
      if (!Ctor || !convoRef.current) return;
      stopBarge();
      const said = new Set(words(spoken));
      const rec = new Ctor();
      rec.lang = "en-IE";
      rec.continuous = true;
      rec.interimResults = true;
      let from = -1;
      let text = "";
      let quiet: ReturnType<typeof setTimeout> | undefined;
      rec.onresult = (e) => {
        if (from < 0) {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (isUserSpeech(e.results[i][0].transcript, said)) {
              from = i;
              break;
            }
          }
          if (from < 0) return;
          stopSpeaking(); // cut Donna off mid-sentence
          setStatus("listening");
        }
        let t = "";
        for (let i = from; i < e.results.length; i++) t += e.results[i][0].transcript;
        text = t.trim();
        setHeard(text);
        clearTimeout(quiet);
        quiet = setTimeout(() => rec.stop(), 1300); // you've finished talking
      };
      rec.onerror = () => {};
      rec.onend = () => {
        clearTimeout(quiet);
        if (bargeRef.current === rec) bargeRef.current = null;
        if (from < 0) return;
        if (text && !ONLY_CUT_IN.test(text)) askRef.current?.(text);
        else setTimeout(() => listenRef.current?.(), 150); // "stop" / "wait": listen for the real question
      };
      bargeRef.current = rec;
      try {
        rec.start();
      } catch {
        bargeRef.current = null;
      }
    },
    [stopBarge, stopSpeaking],
  );

  const speak = useCallback(
    async (text: string, opts: { voiceOverride?: SourciVoice } = {}) => {
      if (muted || !text) return afterSpeak();
      const id = ++speakIdRef.current;
      const finished = () => {
        if (id !== speakIdRef.current) return; // cut off: whoever interrupted takes over
        outAnRef.current = null;
        stopBarge();
        afterSpeak();
      };
      setStatus("speaking");
      try {
        const res = await fetch("/api/sourci/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: opts.voiceOverride ?? voice }),
        });
        if (id !== speakIdRef.current) return;
        if (res.status === 200) {
          if (ackRef.current) await ackRef.current.done; // let "On it." finish first
          ackRef.current = null;
          if (id !== speakIdRef.current) return;
          const p = await playMp3(res); // starts on the first streamed chunk
          if (id !== speakIdRef.current) {
            p.audio.pause();
            return;
          }
          audioRef.current = p.audio;
          outAnRef.current = p.analyser;
          sayingRef.current = { text, audio: p.audio };
          startBarge(text);
          void p.done.then(finished);
          return;
        }
      } catch {
        /* fall back to the browser voice */
      }
      if (id !== speakIdRef.current) return;
      ackRef.current = null;
      const synth = window.speechSynthesis;
      if (!synth) return finished();
      const u = new SpeechSynthesisUtterance(text);
      const v = femaleVoice();
      if (v) u.voice = v;
      u.rate = 1.03;
      u.pitch = 1.05;
      u.onend = finished;
      synth.speak(u);
      startBarge(text);
    },
    [afterSpeak, muted, startBarge, stopBarge, voice],
  );

  // keep the browser's voice list warm (it loads async) and track status for the meter loop
  useEffect(() => {
    window.speechSynthesis?.getVoices();
  }, []);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // The orb breathes with whoever is talking: her voice while speaking, yours while listening.
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const st = statusRef.current;
      const an = st === "speaking" ? outAnRef.current : st === "listening" ? (micRef.current?.analyser ?? null) : null;
      const target = levelOf(an);
      smooth += (target - smooth) * 0.35;
      const el = orbRef.current;
      if (el) {
        el.style.transform = `scale(${(1 + smooth * 0.28).toFixed(3)})`;
        el.style.filter = smooth > 0.02 ? `brightness(${(1 + smooth * 0.5).toFixed(2)}) drop-shadow(0 0 ${Math.round(6 + smooth * 26)}px rgba(34,211,238,0.85))` : "";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const chooseVoice = useCallback(
    (v: SourciVoice) => {
      setVoice(v);
      setVoiceMenu(false);
      try {
        localStorage.setItem("sourci-voice", v);
      } catch {}
      audioCtx();
      stopSpeaking();
      void speak(`Hi, I'm Donna. This is how I'll sound from now on.`, { voiceOverride: v });
      warmAcks(v);
    },
    [speak, stopSpeaking],
  );

  const remember = (role: SourciTurn["role"], content: string) => {
    history.current = [...history.current, { role, content }].slice(-8);
    try {
      sessionStorage.setItem("sourci-history", JSON.stringify(history.current));
    } catch {}
  };

  /** Run a confirmed change (or an undo) on the server and show the stamp. */
  const execute = useCallback(
    async (proposal: SourciProposal, title: string) => {
      setStatus("working");
      setError("");
      try {
        const res = await fetch("/api/sourci/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposal }),
        });
        const r = (await res.json()) as { ok: boolean; message: string; stamp?: string; title?: string; href?: string; undo?: SourciProposal };
        setReply(r.message);
        remember("assistant", r.ok ? `Done: ${r.message}` : r.message);
        if (r.ok) {
          setLastUndo(proposal.kind === "restore" ? null : (r.undo ?? null));
          chime("done");
          setDone({ type: "done", stamp: r.stamp ?? "DONE", title: r.title ?? title, detail: r.message, href: r.href, undo: r.undo });
          setPanelOpen(true);
          router.refresh();
        } else {
          setError(r.message);
        }
        void speak(r.message);
      } catch {
        setError("Couldn't reach Donna.");
        setStatus("ready");
      }
    },
    [router, speak],
  );

  const confirm = useCallback(async () => {
    if (!pending) return;
    const c = pending;
    setPending(null);
    await execute(c.proposal, c.title);
  }, [execute, pending]);

  const undo = useCallback(() => {
    const u = lastUndo;
    if (!u) {
      const m = "There's nothing for me to undo.";
      setReply(m);
      return void speak(m);
    }
    setLastUndo(null);
    void execute(u, "Undo");
  }, [execute, lastUndo, speak]);

  const cancel = useCallback(() => {
    setPending(null);
    const m = "No problem, I've left it.";
    setReply(m);
    remember("assistant", "Cancelled, nothing was changed.");
    void speak(m);
  }, [speak]);

  const ask = useCallback(
    async (text: string, alternatives: string[] = []) => {
      const q = text.trim();
      if (!q) return;
      stopSpeaking();
      stopBarge();
      const hello = q === "__hello__";
      if (!hello) setHeard(q);
      setError("");
      if (!hello && /^\s*(undo( that| it| the last( one| change)?)?|put (it|them) back|revert( that| it)?)[.!]*\s*$/i.test(q)) return undo();
      // A spoken yes/no answers the pending confirmation directly.
      // Only a clean "yes" confirms; "yes, but..." / "not yet" cancels (see src/lib/confirm-words.ts).
      if (!hello && pending && isYes(q)) {
        if (pending.strong && !isStrongYes(q)) {
          const m = "Just to be safe with this one, say confirm, or tap the button.";
          setReply(m);
          return void speak(m);
        }
        return void confirm();
      }
      if (!hello && pending && isNoOrUnclear(q)) return cancel();
      if (/^\s*(that'?s all|that is all|stop listening|turn off|switch off|go to sleep|bye|goodbye|good night)\b/i.test(q) && q.split(/\s+/).length <= 6) {
        convoRef.current = false;
        setOn(false);
        setReply("Talk soon.");
        return void speak("Talk soon.");
      }
      if (/^\s*(thanks|thank you|cheers|nice one|perfect|great)[.!]*\s*(donna|sourci)?[.!]*\s*$/i.test(q)) {
        setReply("Anytime.");
        return void speak("Anytime."); // stays on, listening for the next thing
      }

      setReply("");
      setDone(null);
      setStatus("working");
      const id = ++reqRef.current;
      // If the answer isn't back in ~0.7s, say a quick cached "On it." so there's no dead air.
      const ackTimer = setTimeout(() => {
        if (id !== reqRef.current || muted || !convoRef.current || hello) return;
        void ackClip(voice).then(async (b) => {
          if (!b || id !== reqRef.current || statusRef.current !== "working") return;
          try {
            const p = await playBlob(b);
            ackRef.current = { audio: p.audio, done: p.done };
            outAnRef.current = p.analyser;
          } catch {}
        });
      }, 700);
      try {
        const res = await fetch("/api/sourci", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: q, path: pathname, history: history.current, memory: memoryRef.current, alternatives: alternatives.filter((a) => a.trim().toLowerCase() !== q.toLowerCase()) }),
        });
        const data = (await res.json()) as SourciReply;
        clearTimeout(ackTimer);
        if (id !== reqRef.current) return; // you asked something else meanwhile
        if (!res.ok || data.error) {
          setError(data.error || "Donna couldn't answer.");
          setStatus("ready");
          return;
        }
        if (!hello) remember("user", q);
        remember("assistant", data.reply);
        let nav: string | null = null;
        let shown = false;
        const nextChart = data.actions.find((a) => a.type === "chart");
        const nextCard = data.actions.find((a) => a.type === "card");
        const nextPipe = data.actions.find((a) => a.type === "pipeline");
        const nextConfirm = data.actions.find((a) => a.type === "confirm");
        const nextDash = data.actions.find((a) => a.type === "dashboard");
        for (const a of data.actions) if (a.type === "navigate") nav = a.href;
        for (const a of data.actions) {
          if (a.type === "remember") memoryRef.current = [...memoryRef.current.filter((m) => m.toLowerCase() !== a.fact.toLowerCase()), a.fact].slice(-30);
          if (a.type === "forget") memoryRef.current = /^(all|everything)$/i.test(a.match) ? [] : memoryRef.current.filter((m) => !m.toLowerCase().includes(a.match.toLowerCase()));
          if (a.type === "remember" || a.type === "forget") {
            try {
              localStorage.setItem("sourci-memory", JSON.stringify(memoryRef.current));
            } catch {}
          }
        }
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
        clearTimeout(ackTimer);
        if (id !== reqRef.current) return;
        setError("Couldn't reach Donna. Check your connection.");
        setStatus("ready");
      }
    },
    [cancel, confirm, muted, pathname, pending, router, speak, stopBarge, stopSpeaking, undo, voice],
  );

  useEffect(() => {
    askRef.current = (t: string, alts?: string[]) => {
      convoRef.current = true;
      void ask(t, alts);
    };
  }, [ask]);

  const listen = useCallback(() => {
    setBubble(true);
    const Ctor = recCtor();
    if (!Ctor) {
      setError("Voice input needs Chrome. You can type instead.");
      return;
    }
    if (status === "listening" && recRef.current) {
      recRef.current.stop();
      return;
    }
    stopSpeaking();
    stopBarge();
    setError("");
    const rec = new Ctor();
    rec.lang = "en-IE";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    let finalText = "";
    let alts: string[] = [];
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          // other ways the last bit could have been heard (names especially)
          const others: string[] = [];
          for (let k = 1; k < Math.min(r.length, 3); k++) if (r[k]?.transcript) others.push(finalText + r[k].transcript);
          alts = others;
          finalText += r[0].transcript;
        }
        else interim += r[0].transcript;
      }
      setHeard((finalText + " " + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        convoRef.current = false;
        setOn(false);
        setBubble(true);
        setError(e.error === "audio-capture" ? "No microphone found." : "Microphone is blocked. Allow it in the address bar, then click the orb again.");
      } else if (e.error !== "no-speech" && e.error !== "aborted" && e.error !== "network") setError(`Microphone: ${e.error}`);
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      if (finalText.trim()) {
        lastActivity.current = Date.now();
        void ask(finalText, alts);
      } else if (convoRef.current && Date.now() - lastActivity.current < IDLE_OFF_MS) {
        setTimeout(() => convoRef.current && listenRef.current?.(), 250); // silence: keep listening
      } else {
        convoRef.current = false; // nothing said for a long while: switch off
        setOn(false);
        setStatus((s) => (s === "listening" ? "ready" : s));
      }
    };
    recRef.current = rec;
    setHeard("");
    setStatus("listening");
    try {
      rec.start();
    } catch {
      // the previous microphone session is still closing; try again a moment later
      setTimeout(() => {
        try {
          rec.start();
        } catch {
          recRef.current = null;
          setStatus("ready");
        }
      }, 300);
    }
  }, [ask, status, stopBarge, stopSpeaking]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const close = useCallback(() => {
    convoRef.current = false;
    setOn(false);
    micRef.current?.stop();
    micRef.current = null;
    const r = recRef.current;
    recRef.current = null;
    try {
      r?.abort();
    } catch {}
    stopBarge();
    stopSpeaking();
    reqRef.current++;
    setStatus("ready");
    setPanelOpen(false);
    setBubble(false);
    setTyping(false);
  }, [stopBarge, stopSpeaking]);

  /**
   * Orb click / ⌥S is an on/off switch. On = Donna keeps listening (between
   * answers, while dashboards are open) until you click again, press Esc or say
   * "that's all". While it's speaking, a click (or just talking) cuts it off and
   * it listens to you straight away.
   */
  const toggle = useCallback(() => {
    audioCtx(); // unlock audio on this click
    if (status === "speaking" && convoRef.current) {
      stopSpeaking();
      stopBarge();
      setTimeout(() => listenRef.current?.(), 120);
      return;
    }
    if (convoRef.current) {
      chime("off");
      micRef.current?.stop();
      micRef.current = null;
      return close();
    }
    convoRef.current = true;
    setOn(true);
    lastActivity.current = Date.now();
    chime("on");
    if (!muted) warmAcks(voice);
    void micMeter().then((m) => {
      if (convoRef.current) micRef.current = m;
      else m?.stop();
    });
    if (status === "working") reqRef.current++;
    // First switch-on of the day: a short personal hello with what matters most.
    let greet = false;
    try {
      const today = new Date().toISOString().slice(0, 10);
      greet = localStorage.getItem("sourci-hello") !== today;
      if (greet) localStorage.setItem("sourci-hello", today);
    } catch {}
    if (greet) void askRef.current?.("__hello__");
    else listen();
  }, [close, listen, muted, status, stopBarge, stopSpeaking, voice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") {
        // first Esc closes the pop-up (Donna stays on); next Esc switches it off
        if (panelOpen) setPanelOpen(false);
        else if (bubble || convoRef.current) close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bubble, close, panelOpen, toggle]);

  const hasPanel = Boolean(dash || chart || card || pipeline || pending || done);
  const caption = {
    ready: on ? "On: just talk. Click the orb to switch off" : "Click the orb or press ⌥S to switch Donna on",
    listening: "Listening. Click the orb to switch off",
    working: "Working on it…",
    speaking: "Talk over me or click the orb to interrupt",
  }[status];

  return (
    <>
      {/* pop-up dashboard in the middle of the CRM; you can keep talking while it's open */}
      {panelOpen && hasPanel && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ position: "fixed" }}>
          <section
            className="sourci-anim pointer-events-auto flex max-h-[80vh] w-[min(94vw,880px)] flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#05090f]/95 text-slate-200 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),0_0_60px_-30px_rgba(34,211,238,0.6)] backdrop-blur"
            style={{ animation: "sourci-in .25s ease-out" }}
            aria-label="Donna results"
          >
            <div className="flex items-center gap-2 border-b border-cyan-300/10 px-4 py-3">
              <Orb size={18} pulse={status === "listening"} glow={status !== "ready"} />
              <p className="font-mono text-[11px] tracking-[0.25em] text-cyan-200">DONNA</p>
              <span className="flex-1" />
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
              {done && <DonePanel d={done} onOpen={(href) => router.push(href)} onUndo={done.undo && lastUndo ? undo : undefined} />}
            </div>
          </section>
        </div>
      )}

      {/* bubble + orb in the corner */}
      <div
        className="fixed bottom-5 right-5 z-[61] flex flex-col items-end gap-2"
        style={{ position: "fixed" }}
      >
        {bubble && (typing || muted || error) && (
          <div
            className="sourci-anim w-[min(86vw,340px)] rounded-2xl border border-cyan-300/20 bg-[#05090f]/95 p-3 text-slate-200 shadow-xl backdrop-blur"
            style={{ animation: "sourci-in .2s ease-out" }}
          >
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.18em] text-cyan-300/80">
                {status === "listening" ? <span className="text-orange-400">● LISTENING</span> : status === "working" ? "○ WORKING…" : status === "speaking" ? "● SPEAKING" : "DONNA"}
              </p>
              <button onClick={() => setMuted((m) => !m)} className="text-slate-500 hover:text-white" aria-label={muted ? "Turn voice on" : "Mute voice"}>
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <button onClick={close} className="text-slate-500 hover:text-white" aria-label="Close Donna">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Voice stays clean (no captions). Text only when typing, muted, or something went wrong. */}
            {(error || ((typing || muted) && reply)) && (
              <p className={cn("mt-1.5 text-sm", error ? "text-rose-300" : "text-slate-100")}>{error || reply}</p>
            )}
            {typing && (
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = typed;
                  setTyped("");
                  void ask(t);
                }}
              >
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={pending ? "yes / no…" : "Type to Donna…"}
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

        <div className="flex items-center gap-2" title={caption}>
          {hasPanel && !panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-full bg-[#05090f]/80 px-3 py-2 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-300/30 transition hover:ring-cyan-300/60"
            >
              Show details
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setVoiceMenu((v) => !v)}
              className="rounded-full bg-[#05090f]/80 p-2 text-slate-400 opacity-60 ring-1 ring-white/10 transition hover:opacity-100"
              aria-label="Choose Donna's voice"
              title={`Voice: ${voice}`}
            >
              <AudioLines className="h-4 w-4" />
            </button>
            {voiceMenu && (
              <div
                className="sourci-anim absolute bottom-11 right-0 w-56 rounded-xl border border-cyan-300/20 bg-[#05090f]/95 p-1.5 text-slate-200 shadow-xl backdrop-blur"
                style={{ animation: "sourci-in .15s ease-out" }}
              >
                <p className="px-2 pb-1 pt-0.5 font-mono text-[10px] tracking-[0.18em] text-cyan-300/80">VOICE</p>
                {SOURCI_VOICES.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => chooseVoice(v.name)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-100">{v.name}</span>
                      <span className="block text-[11px] text-slate-500">{v.blurb}</span>
                    </span>
                    {voice === v.name && <Check className="h-3.5 w-3.5 text-cyan-300" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setMuted((m) => !m);
              stopSpeaking();
            }}
            className="rounded-full bg-[#05090f]/80 p-2 text-slate-400 opacity-60 ring-1 ring-white/10 transition hover:opacity-100"
            aria-label={muted ? "Turn voice on" : "Mute voice"}
            title={muted ? "Voice is off (answers show as text)" : "Mute voice"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
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
          <OrbButton status={status} on={on} onClick={toggle} orbRef={orbRef} />
        </div>
      </div>
    </>
  );
}

/** The corner orb. Calm when idle; glows and pulses while listening; spinning ring while working; ripples while speaking. */
function OrbButton({ status, on, onClick, orbRef }: { status: Status; on: boolean; onClick: () => void; orbRef?: React.Ref<HTMLSpanElement> }) {
  const label = !on
    ? "Switch Donna on (⌥S)"
    : { ready: "Donna is on. Click to switch off", listening: "Listening. Click to switch off", working: "Working. Click to switch off", speaking: "Click to interrupt" }[status];
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
      {on && <span className="absolute -right-0.5 -top-0.5 z-10 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#05090f]" title="Always on" />}
      <span ref={orbRef} className="inline-flex transition-[filter] duration-75 will-change-transform">
        <Orb size={status === "listening" ? 56 : 48} pulse={status === "listening" && !on} glow={status !== "ready" || on} />
      </span>
    </button>
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
          {c.strong ? "Confirm" : "Yes, do it"}
        </button>
        <button onClick={onNo} disabled={busy} className="rounded-full px-5 py-2 text-sm text-slate-300 ring-1 ring-white/15 hover:bg-white/5">
          Cancel
        </button>
        <span className="ml-auto hidden self-center font-mono text-[10px] tracking-widest text-slate-500 sm:inline">{c.strong ? "OR SAY “CONFIRM” / “CANCEL”" : "OR SAY “YES” / “NO”"}</span>
      </div>
    </Panel>
  );
}

function DonePanel({ d, onOpen, onUndo }: { d: Done; onOpen: (href: string) => void; onUndo?: () => void }) {
  return (
    <Panel className="relative">
      <Eyebrow>DONE · BY DONNA</Eyebrow>
      <h3 className="mt-1 text-xl font-bold text-white">{d.title}</h3>
      {d.detail && <p className="mt-1 text-sm text-slate-300">{d.detail}</p>}
      <div className="mt-3 flex items-center gap-4">
        {d.href && (
          <button onClick={() => onOpen(d.href!)} className="text-sm font-semibold text-cyan-300 hover:underline">
            Open →
          </button>
        )}
        {onUndo && (
          <button onClick={onUndo} className="rounded-lg px-2.5 py-1 text-sm font-semibold text-slate-300 ring-1 ring-white/15 hover:bg-white/5 hover:text-white">
            ↶ Undo
          </button>
        )}
      </div>
      <span
        className="sourci-anim absolute bottom-4 right-5 rounded-lg border-2 border-cyan-300 px-3 py-1 text-xl font-black tracking-[0.15em] text-cyan-200"
        style={{ animation: "sourci-stamp .35s ease-out forwards", transform: "rotate(-8deg)" }}
      >
        {d.stamp}
      </span>
    </Panel>
  );
}
