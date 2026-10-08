import type { SupabaseClient } from "@supabase/supabase-js";

type SendTable = "payment_reminders" | "client_emails" | "checkins";

/** A claim older than this counts as abandoned (the server died mid-send). */
const CLAIM_MS = 5 * 60_000;

/**
 * Atomically claims one row for sending: only succeeds if the row is still in
 * `status` and nobody else holds a fresh claim. Two clicks (or two people) at
 * once → exactly one gets `true`, so the email goes out once.
 * Call `releaseSend` if the send fails; clear `send_claimed_at` when marking sent.
 */
export async function claimSend(db: SupabaseClient, table: SendTable, id: string, status: string): Promise<boolean> {
  const stale = new Date(Date.now() - CLAIM_MS).toISOString();
  const { data, error } = await db
    .from(table)
    .update({ send_claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", status)
    .or(`send_claimed_at.is.null,send_claimed_at.lt."${stale}"`)
    .select("id");
  if (error) {
    console.error(`[send-claim] ${table} claim failed`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function releaseSend(db: SupabaseClient, table: SendTable, id: string): Promise<void> {
  const { error } = await db.from(table).update({ send_claimed_at: null }).eq("id", id);
  if (error) console.error(`[send-claim] ${table} release failed`, error.message);
}
