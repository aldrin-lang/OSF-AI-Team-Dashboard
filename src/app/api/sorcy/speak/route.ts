import { getCurrentProfile, hasRole } from "@/lib/auth";

// Text-to-speech for Sorcy via ElevenLabs. Returns 204 when ElevenLabs isn't
// configured, and the widget falls back to the browser's built-in voice.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const me = await getCurrentProfile();
  if (!me || !me.active || !hasRole(me, "admin")) return new Response(null, { status: 401 });

  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return new Response(null, { status: 204 });

  let text = "";
  try {
    const b = (await request.json()) as { text?: unknown };
    text = typeof b.text === "string" ? b.text.trim().slice(0, 600) : "";
  } catch {
    /* empty */
  }
  if (!text) return new Response(null, { status: 400 });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5" }),
  });
  if (!res.ok || !res.body) {
    console.error("[sorcy speak] ElevenLabs", res.status);
    return new Response(null, { status: 204 }); // fall back to browser voice
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
