"use client";

/**
 * Donna's sound: streamed ElevenLabs playback, a level meter so the orb moves
 * with the voice, soft chimes, and the best female browser voice as a fallback.
 */

let ctx: AudioContext | null = null;

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("audio timeout")), ms))]);

/** Shared AudioContext. Call it from a click first so the browser lets it play. */
export function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 0..1 loudness from an analyser. */
export function levelOf(an: AnalyserNode | null): number {
  if (!an) return 0;
  const buf = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 3.5);
}

/** Soft UI chimes: on (rising), off (falling), done (sparkle). */
export function chime(kind: "on" | "off" | "done") {
  const c = audioCtx();
  if (!c || c.state !== "running") return;
  const notes = kind === "on" ? [659, 988] : kind === "off" ? [784, 523] : [784, 988, 1319];
  notes.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = c.currentTime + i * 0.085;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.45);
  });
}

function meter(a: HTMLAudioElement): AnalyserNode | null {
  const c = audioCtx();
  if (!c || c.state !== "running") return null; // play straight out rather than risk silence
  try {
    const src = c.createMediaElementSource(a);
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    an.connect(c.destination);
    return an;
  } catch {
    return null;
  }
}

/**
 * Play an mp3 response as it streams in (MediaSource), so speech starts on the
 * first chunk instead of after the whole file. Falls back to a blob.
 */
export async function playMp3(res: Response): Promise<{ audio: HTMLAudioElement; analyser: AnalyserNode | null; done: Promise<void> }> {
  const canStream = Boolean(res.body) && typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");
  if (canStream) {
    const ms = new MediaSource();
    const url = URL.createObjectURL(ms);
    const audio = new Audio();
    audio.src = url;
    await withTimeout(new Promise<void>((r) => ms.addEventListener("sourceopen", () => r(), { once: true })), 3000);
    const sb = ms.addSourceBuffer("audio/mpeg");
    const reader = res.body!.getReader();
    const append = (b: Uint8Array) =>
      new Promise<void>((resolve, reject) => {
        sb.addEventListener("updateend", () => resolve(), { once: true });
        sb.addEventListener("error", () => reject(new Error("append failed")), { once: true });
        sb.appendBuffer(b as unknown as BufferSource);
      });
    let first: () => void = () => {};
    const gotFirst = new Promise<void>((r) => (first = r));
    const pump = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) {
            await append(value);
            first();
          }
        }
      } finally {
        first();
        if (ms.readyState === "open") {
          try {
            ms.endOfStream();
          } catch {}
        }
      }
    })();
    await withTimeout(gotFirst, 8000);
    const analyser = meter(audio);
    const done = new Promise<void>((r) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        r();
      };
      audio.onerror = () => r();
    });
    void pump.catch(() => {});
    await audio.play();
    return { audio, analyser, done };
  }
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  const analyser = meter(audio);
  const done = new Promise<void>((r) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      r();
    };
    audio.onerror = () => r();
  });
  await audio.play();
  return { audio, analyser, done };
}

/** Live microphone level for the orb while listening (echo-cancelled). */
export async function micMeter(): Promise<{ analyser: AnalyserNode; stop: () => void } | null> {
  const c = audioCtx();
  if (!c || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const src = c.createMediaStreamSource(stream);
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    return {
      analyser: an,
      stop: () => {
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch {
    return null;
  }
}

const PREFERRED = [/Sonia.*Natural/i, /Libby.*Natural/i, /Maisie.*Natural/i, /Emily.*Natural/i, /Google UK English Female/i, /Moira/i, /Serena/i, /Kate/i, /Martha/i, /Stephanie/i, /Samantha/i, /Karen/i, /Tessa/i, /female/i];

/** Best-sounding female English voice the browser has (fallback when ElevenLabs is unavailable). */
export function femaleVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  const vs = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = vs.find((x) => re.test(x.name));
    if (v) return v;
  }
  return vs.find((v) => /en-(GB|IE)/i.test(v.lang)) ?? vs[0];
}

/** Play an already-fetched clip (cached acknowledgements). */
export async function playBlob(blob: Blob): Promise<{ audio: HTMLAudioElement; analyser: AnalyserNode | null; done: Promise<void> }> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const analyser = meter(audio);
  const done = new Promise<void>((r) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      r();
    };
    audio.onerror = () => r();
    audio.onpause = () => r();
  });
  await audio.play();
  return { audio, analyser, done };
}

/** Fade a voice out over ~120 ms instead of cutting it dead (feels far less abrupt when interrupted). */
export function fadeOut(audio: HTMLAudioElement | null) {
  if (!audio) return;
  const start = audio.volume;
  const steps = 6;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    audio.volume = Math.max(0, start * (1 - i / steps));
    if (i >= steps) {
      clearInterval(iv);
      audio.pause();
    }
  }, 20);
}

// Short acknowledgements, recorded once per voice then played from the browser cache (no credits after the first time).
const ACKS = ["On it.", "Checking now.", "Okay, looking.", "Right, pulling that up."];
const clipMem = new Map<string, Blob>();

async function clip(voice: string, text: string): Promise<Blob | null> {
  const key = `${voice}:${text}`;
  const hit = clipMem.get(key);
  if (hit) return hit;
  const url = `/__sourci-clip/${encodeURIComponent(voice)}/${encodeURIComponent(text)}`;
  try {
    const cache = typeof caches !== "undefined" ? await caches.open("sourci-clips-v1") : null;
    const cached = await cache?.match(url);
    if (cached) {
      const b = await cached.blob();
      clipMem.set(key, b);
      return b;
    }
    const res = await fetch("/api/sourci/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) });
    if (res.status !== 200) return null; // no ElevenLabs: skip acknowledgements rather than use the robot voice
    const b = await res.blob();
    clipMem.set(key, b);
    await cache?.put(url, new Response(b, { headers: { "Content-Type": "audio/mpeg" } }));
    return b;
  } catch {
    return null;
  }
}

/** Fetch this voice's acknowledgements in the background so they're instant later. */
export function warmAcks(voice: string) {
  void (async () => {
    for (const t of ACKS) await clip(voice, t);
  })();
}

/** A random cached acknowledgement for this voice (null if not cached yet / no ElevenLabs). */
export async function ackClip(voice: string): Promise<Blob | null> {
  const ready = ACKS.filter((t) => clipMem.has(`${voice}:${t}`));
  const t = (ready.length ? ready : ACKS)[Math.floor(Math.random() * (ready.length || ACKS.length))];
  return clipMem.get(`${voice}:${t}`) ?? (ready.length ? null : clip(voice, t));
}

