import { NextResponse } from "next/server";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import { askSourci, sourciConfigured, sourciHello } from "@/lib/server/sourci";
import type { SourciTurn } from "@/lib/sourci-types";

// Sourci voice assistant. Signed-in admins only (Aldrin + boss for now).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const me = await getCurrentProfile();
  if (!me || !me.active) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (!hasRole(me, "admin")) return NextResponse.json({ error: "Sourci is only switched on for admins" }, { status: 403 });
  if (!sourciConfigured()) {
    return NextResponse.json({ reply: "", actions: [], error: "Sourci isn't switched on yet (OPENAI_API_KEY missing)." }, { status: 503 });
  }

  let body: { text?: unknown; path?: unknown; history?: unknown; memory?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Say something first" }, { status: 400 });
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
  const history: SourciTurn[] = Array.isArray(body.history)
    ? (body.history as SourciTurn[])
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-6)
    : [];

  try {
    if (text === "__hello__") return NextResponse.json(await sourciHello((me.full_name || me.email).split(" ")[0]));
    const memory = Array.isArray(body.memory)
      ? (body.memory as unknown[]).filter((m): m is string => typeof m === "string").map((m) => m.slice(0, 200)).slice(0, 30)
      : [];
    const r = await askSourci({ text, path, history, memory, userName: (me.full_name || me.email).split(" ")[0] });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[sourci]", e);
    return NextResponse.json({ reply: "", actions: [], error: "Sourci couldn't answer just now. Try again in a moment." }, { status: 502 });
  }
}
