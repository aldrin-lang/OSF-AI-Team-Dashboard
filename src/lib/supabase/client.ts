"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

async function resolveConfig(): Promise<{ url: string; anonKey: string }> {
  // Prefer build-time values when present (local dev). Fall back to the runtime
  // route because this account's Vercel NEXT_PUBLIC_ inlining is unreliable.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey };

  const res = await fetch("/api/public-config", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load public config");
  return res.json();
}

/** Browser Supabase client (singleton). Async because config may be fetched at runtime. */
export async function getBrowserSupabase(): Promise<SupabaseClient> {
  if (cached) return cached;
  const { url, anonKey } = await resolveConfig();
  cached = createBrowserClient(url, anonKey);
  return cached;
}
