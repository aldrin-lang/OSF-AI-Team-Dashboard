import "server-only";
import { requireArea } from "@/lib/auth";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import { allRows } from "@/lib/server/paged";
import { dublinDate } from "@/lib/ops-core";
import type { ClientPayment } from "@/lib/client-payments";

export type AccountClient = { id: string; name: string; pipeline: string; status: string; country: string | null };

/**
 * Everything the Accounts pages need: every client and every payment line.
 * Accounts may not have the Clients area, so client names come from the service role,
 * only after the Payments area check (like clientNames() for Recruitment).
 */
export async function loadAccounts(): Promise<{ clients: AccountClient[]; payments: ClientPayment[]; today: string }> {
  await requireArea("payments");
  const supabase = await getServerSupabase();
  const admin = getAdminSupabase();
  const [payments, clients] = await Promise.all([
    allRows<ClientPayment>((a, b) =>
      supabase.from("client_payments").select("*").order("period_start", { ascending: false, nullsFirst: false }).order("id").range(a, b),
    ),
    allRows<AccountClient>((a, b) => admin.from("clients").select("id, name, pipeline, status, country").order("name").order("id").range(a, b)),
  ]);
  return { clients, payments: payments.map((p) => ({ ...p, amount: Number(p.amount), paid_amount: Number(p.paid_amount) })), today: dublinDate() };
}
