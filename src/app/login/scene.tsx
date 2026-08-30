"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";

const WORDS = ["onboarding", "regulatory bundles", "handover emails", "go-lives"];

export function LoginScene({ form }: { form: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setWord((w) => (w + 1) % WORDS.length);
        setFading(false);
      }, 280);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  // ambient soft-gradient wash + faint grain
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const blobs = [
      { x: 0.8, y: 0.08, r: 0.75, col: "43,127,255", a: 0.2 },
      { x: 1.05, y: 0.5, r: 0.6, col: "43,127,255", a: 0.14 },
      { x: 0.5, y: 1.08, r: 0.62, col: "242,105,31", a: 0.09 },
      { x: 0.05, y: -0.08, r: 0.55, col: "20,40,77", a: 0.08 },
    ];

    let raf = 0;
    let last = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!reduce && now - last < 50) return;
      last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#f4f6fb";
      ctx.fillRect(0, 0, w, h);
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(now * 0.00004 + i * 1.3) * 0.05) * w;
        const y = (b.y + Math.cos(now * 0.000032 + i) * 0.05) * h;
        const rad = b.r * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${b.col},${b.a})`);
        g.addColorStop(1, `rgba(${b.col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      ctx.fillStyle = "rgba(15,23,42,0.02)";
      for (let i = 0; i < 70; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  const onMove = (e: React.PointerEvent) => {
    const root = rootRef.current;
    const glow = glowRef.current;
    if (!root || !glow) return;
    const r = root.getBoundingClientRect();
    glow.style.left = `${e.clientX - r.left}px`;
    glow.style.top = `${e.clientY - r.top}px`;
    glow.style.opacity = "1";
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onMove}
      className="relative min-h-screen overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* real dashboard, tilted + dimmed, receding to the right */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] overflow-hidden [perspective:2000px] lg:block"
        aria-hidden
      >
        <div
          className="absolute left-[6%] top-1/2 h-[640px] w-[1040px] origin-left -translate-y-1/2"
          style={{
            transform: "rotateY(-21deg) rotateX(6deg)",
            maskImage:
              "radial-gradient(155% 135% at 16% 50%, #000 44%, transparent 90%)",
            WebkitMaskImage:
              "radial-gradient(155% 135% at 16% 50%, #000 44%, transparent 90%)",
          }}
        >
          <DashboardPreview />
        </div>
        {/* gentle dimming wash + left fade toward the form */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, rgba(244,246,251,0.62) 0%, rgba(244,246,251,0.3) 20%, rgba(244,246,251,0.04) 46%, rgba(244,246,251,0.2) 100%)",
          }}
        />
      </div>

      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute z-[5] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-500"
        style={{ background: "radial-gradient(circle, rgba(43,127,255,0.22), transparent 66%)" }}
      />

      {/* foreground */}
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(0,520px)_1fr]">
        <div
          className="flex flex-col justify-center px-6 py-14 sm:px-10 lg:pl-16 lg:pr-10"
          style={{
            background:
              "linear-gradient(100deg, rgba(249,250,253,0.96) 55%, rgba(249,250,253,0.7) 78%, rgba(249,250,253,0) 100%)",
          }}
        >
          <div className="w-full max-w-[360px]">
            <div className="mb-9 flex items-center gap-2.5">
              <Logo size={28} />
              <span className="text-[15px] font-semibold tracking-tight text-navy-900">
                OutsourceForce<span className="text-brand-500">.ai</span>
              </span>
            </div>

            <h1 className="text-[27px] font-semibold leading-[1.16] tracking-tight text-navy-900 sm:text-[31px]">
              Run the{" "}
              <span
                className="inline-block text-brand-600 transition-all duration-300"
                style={{
                  opacity: fading ? 0 : 1,
                  transform: fading ? "translateY(6px)" : "translateY(0)",
                }}
              >
                {WORDS[word]}
              </span>
              <br />
              <span className="text-ink-faint">from one place.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Internal team access only. Accounts are created by an admin.
            </p>

            <div className="mt-8">{form}</div>

            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              AI receptionist onboarding · OutsourceForce.ai
            </p>
          </div>
        </div>
        <div className="hidden lg:block" />
      </div>
    </div>
  );
}

function DashboardPreview() {
  const cols: { name: string; cards: ("ok" | "warn" | "risk")[]; bar: string }[] = [
    { name: "Docs", cards: ["ok", "warn"], bar: "from-brand-500 to-accent-500" },
    { name: "Reg. bundle", cards: ["risk"], bar: "from-cyan-400 to-brand-500" },
    { name: "Build", cards: ["ok", "ok", "warn"], bar: "from-violet-400 to-accent-500" },
    { name: "Testing", cards: ["ok"], bar: "from-emerald-400 to-cyan-400" },
  ];
  const dot = { ok: "bg-emerald-400", warn: "bg-accent-500", risk: "bg-rose-500" };

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.35)] backdrop-blur-sm">
      <div className="grid grid-cols-3 gap-3">
        {[
          { v: "30", l: "Active clients", g: "from-brand-400 to-brand-600" },
          { v: "4", l: "Past SLA", g: "from-accent-400 to-accent-600" },
          { v: "11", l: "Live", g: "from-emerald-300 to-emerald-500" },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm">
            <div
              className={`mb-2 h-8 w-8 rounded-lg bg-gradient-to-b ${k.g} shadow-[0_8px_16px_-8px_rgba(43,127,255,0.6)]`}
            />
            <p className="text-2xl font-semibold tracking-tight text-navy-900">{k.v}</p>
            <p className="text-[11px] text-ink-faint">{k.l}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {cols.map((c) => (
          <div
            key={c.name}
            className="flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-sm"
          >
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                {c.name}
              </span>
              <span className={`h-[3px] w-6 rounded-full bg-gradient-to-r ${c.bar}`} />
            </div>
            {c.cards.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-200/70 bg-slate-50/80 p-2">
                <span className={`float-right h-1.5 w-1.5 rounded-full ${dot[s]}`} />
                <div className="h-1.5 w-4/5 rounded-full bg-slate-300" />
                <div className="mt-1.5 h-1 w-2/5 rounded-full bg-slate-200" />
              </div>
            ))}
            <div className="mt-auto rounded-lg border border-dashed border-slate-200 py-2 text-center text-[8px] text-slate-300">
              drop here
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-sm">
        <span className="h-6 w-6 shrink-0 rounded-full bg-brand-50" />
        <div className="h-1.5 w-2/5 rounded-full bg-slate-200" />
        <span className="ml-auto h-1 w-10 rounded-full bg-slate-200" />
      </div>
    </div>
  );
}
