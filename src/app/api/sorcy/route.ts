import { NextResponse } from "next/server";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import { askSorcy, sorcyConfigured } from "@/lib/server/sorcy";
import type { SorcyTurn } from "@/lib/sorcy-types";

// Sorcy voice assistant. Signed-in admins only (Aldrin + boss for now).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const me = await getCurrentProfile();
  if (!me || !me.active) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (!hasRole(me, "admin")) return NextResponse.json({ error: "Sorcy is only switched on for admins" }, { status: 403 });
  if (!sorcyConfigured()) {
    return NextResponse.json({ reply: "", actions: [], error: "Sorcy isn't switched on yet (OPENAI_API_KEY missing)." }, { status: 503 });
  }

  let body: { text?: unknown; path?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Say something first" }, { status: 400 });
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
  const history: SorcyTurn[] = Array.isArray(body.history)
    ? (body.history as SorcyTurn[])
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-6)
    : [];

  try {
    const r = await askSorcy({ text, path, history, userName: (me.full_name || me.email).split(" ")[0] });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[sorcy]", e);
    return NextResponse.json({ reply: "", actions: [], error: "Sorcy couldn't answer just now. Try again in a moment." }, { status: 502 });
  }
}
