/** Sourci's voices (ElevenLabs default voices, usable on the free plan). Shared by the picker and the server. */
export const SOURCI_VOICES = [
  { name: "Lily", blurb: "Warm, velvety British" },
  { name: "Sarah", blurb: "Confident, reassuring" },
  { name: "Alice", blurb: "Clear, friendly British" },
  { name: "Matilda", blurb: "Polished, professional" },
  { name: "Jessica", blurb: "Bright, upbeat" },
  { name: "Laura", blurb: "Sunny, playful" },
] as const;
export type SourciVoice = (typeof SOURCI_VOICES)[number]["name"];
export const DEFAULT_VOICE: SourciVoice = "Lily";
export const isSourciVoice = (v: unknown): v is SourciVoice => SOURCI_VOICES.some((x) => x.name === v);
