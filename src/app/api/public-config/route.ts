import { NextResponse } from "next/server";

// Runtime config for the browser Supabase client. Avoids depending on
// build-time NEXT_PUBLIC_ inlining (unreliable on this Vercel account).
export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
  }
  return NextResponse.json(
    { url, anonKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
