import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/**
 * One place for every AI call in the dashboard (candidate screening, check-in
 * and reminder drafting, daily report summary).
 *
 * - Needs ANTHROPIC_API_KEY on the server. Without it every caller falls back
 *   to plain templates, so the app keeps working.
 * - Model: AI_MODEL env var, default claude-opus-5-5.
 * - Server-side refusal fallback is on ("default" routing) so a safety decline
 *   is retried on Anthropic's recommended model instead of failing.
 */
export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  return client;
}

type Effort = "low" | "medium" | "high";

async function create(opts: {
  system: string;
  prompt: string;
  effort: Effort;
  maxTokens: number;
  format?: { type: "json_schema"; schema: Record<string, unknown> };
}) {
  const res = await getClient().beta.messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort, ...(opts.format ? { format: opts.format } : {}) },
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("The AI declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("The AI response was cut off");
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("The AI returned no text");
  return text;
}

/** Plain-text completion (drafts, summaries). */
export async function aiText(system: string, prompt: string, effort: Effort = "low"): Promise<string> {
  return create({ system, prompt, effort, maxTokens: 16000 });
}

/** JSON completion validated against a zod schema (structured output). */
export async function aiJson<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
  effort: Effort = "medium",
): Promise<z.infer<T>> {
  const fmt = zodOutputFormat(schema);
  const text = await create({
    system,
    prompt,
    effort,
    maxTokens: 16000,
    format: { type: "json_schema", schema: fmt.schema as Record<string, unknown> },
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The AI returned invalid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("The AI answer did not match the expected format");
  return parsed.data;
}

/** Short, user-safe description of an AI failure for the UI. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "AI key is invalid (check ANTHROPIC_API_KEY)";
  if (e instanceof Anthropic.RateLimitError) return "AI is busy (rate limited), try again in a minute";
  if (e instanceof Anthropic.APIError) return `AI error ${e.status ?? ""}`.trim();
  if (e instanceof Error) return e.message.slice(0, 200);
  return "AI request failed";
}
