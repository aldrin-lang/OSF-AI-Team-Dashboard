import { getCurrentProfile, hasRole } from "@/lib/auth";
import { DEFAULT_VOICE, isSourciVoice, type SourciVoice } from "@/lib/sourci-voices";
import { normaliseForSpeech } from "@/lib/speech-text";

// Text-to-speech for Sourci via ElevenLabs, streamed so she starts talking
// straight away. Returns 204 when ElevenLabs isn't configured (or is out of
// credit) and the widget falls back to the browser's built-in voice.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Known IDs of ElevenLabs' default voices (used if the key can't list voices). */
const FALLBACK_IDS: Record<SourciVoice, string> = {
  Lily: "pFZP5JQG7iQjIQuC4Bku",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
  Matilda: "XrExE9yKIg1WjnnlVkGX",
  Jessica: "cgSgspJ2msm6clMCkdW9",
  Laura: "FGY2WhTYpPnrIDTdsKH5",
};

let voiceCache: { at: number; ids: Map<string, string> } | null = null;

/** Look the voice up by name on the account (cached for an hour), else use the known ID. */
async function voiceId(key: string, name: SourciVoice): Promise<string> {
  if (!voiceCache || Date.now() - voiceCache.at > 3_600_000) {
    const ids = new Map<string, string>();
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { voices?: { voice_id: string; name: string }[] };
        for (const v of d.voices ?? []) ids.set(v.name.split(/\s+[-–]\s+/)[0].trim().toLowerCase(), v.voice_id);
      }
    } catch {
      /* use the fallback IDs */
    }
    voiceCache = { at: Date.now(), ids };
  }
  return voiceCache.ids.get(name.toLowerCase()) ?? FALLBACK_IDS[name];
}

/** Spoken text only: no markdown, emojis or URLs. */
function forSpeech(t: string): string {
  return normaliseForSpeech(t)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

export async function POST(request: Request) {
  const me = await getCurrentProfile();
  if (!me || !me.active || !hasRole(me, "admin")) return new Response(null, { status: 401 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response(null, { status: 204 });

  let text = "";
  let voice: SourciVoice = DEFAULT_VOICE;
  try {
    const b = (await request.json()) as { text?: unknown; voice?: unknown };
    text = typeof b.text === "string" ? forSpeech(b.text) : "";
    if (isSourciVoice(b.voice)) voice = b.voice;
  } catch {
    /* empty */
  }
  if (!text) return new Response(null, { status: 400 });

  // A fixed ELEVENLABS_VOICE_ID (e.g. a custom/cloned voice) wins over the picker.
  const id = process.env.ELEVENLABS_VOICE_ID || (await voiceId(key, voice));
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}/stream?output_format=mp3_44100_128&optimize_streaming_latency=3`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.04 },
      }),
    },
  );
  if (!res.ok || !res.body) {
    // 401 bad key, 402/429 out of credit or busy: the widget uses the browser voice instead
    console.error("[sourci speak] ElevenLabs", res.status);
    return new Response(null, { status: 204, headers: { "X-Sourci-Voice": `fallback-${res.status}` } });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
