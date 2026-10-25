import "server-only";
import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getService } from "@/lib/server/service";
import { pipelinesFor } from "@/lib/service";
import { allRows } from "@/lib/server/paged";
import { dublinDate } from "@/lib/ops-core";
import type { ClientPayment, Stage } from "@/lib/client-payments";

/**
 * Accounts data. The database filters, counts and pages (functions in
 * migrations/20261026000001_accounts_speed.sql, run as the signed-in user so RLS applies),
 * so each page fetches only what it shows. Every read follows the sidebar's VA · AI · All switch.
 */
export type AccountsCtx = { today: string; pipelines: ("va" | "ai")[] };
export type AccountClient = { id: string; name: string; pipeline: string; status: string; country: string | null };
export type ClientSummary = {
  client_id: string;
  lines: number;
  late_lines: number;
  owed: Record<string, number> | null;
  late_owed: Record<string, number> | null;
  last_paid: string | null;
  latest_period: string | null;
  latest_vas: string | null;
};
export type StageTotals = Record<Stage, { lines: number; amount: Record<string, number>; owed: Record<string, number> }>;
export type PaymentLine = ClientPayment & { client_name?: string };

const num = (v: unknown) => Number(v) || 0;

export async function accountsCtx(): Promise<AccountsCtx> {
  await requireArea("payments");
  return { today: dublinDate(), pipelines: pipelinesFor(await getService()) };
}

/** The tiles: lines and money per tab and currency, plus what was recorded as paid this month. */
export async function getStageTotals(ctx: AccountsCtx): Promise<{ totals: StageTotals; receivedThisMonth: Record<string, number> }> {
  const supabase = await getServerSupabase();
  const monthStart = ctx.today.slice(0, 8) + "01";
  const [y, m] = monthStart.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [t, r] = await Promise.all([
    supabase.rpc("accounts_stage_totals", { p_today: ctx.today, p_pipelines: ctx.pipelines }),
    supabase.rpc("accounts_received", { p_from: monthStart, p_to: monthEnd, p_pipelines: ctx.pipelines }),
  ]);
  if (t.error) throw new Error(t.error.message);
  if (r.error) throw new Error(r.error.message);
  const totals = Object.fromEntries(
    (["for-invoice", "for-collection", "not-paid", "paid"] as Stage[]).map((s) => [s, { lines: 0, amount: {}, owed: {} }]),
  ) as StageTotals;
  for (const row of (t.data ?? []) as { stage: Stage; currency: string; lines: number; amount: number; owed: number }[]) {
    const x = totals[row.stage];
    if (!x) continue;
    x.lines += num(row.lines);
    x.amount[row.currency] = (x.amount[row.currency] ?? 0) + num(row.amount);
    x.owed[row.currency] = (x.owed[row.currency] ?? 0) + num(row.owed);
  }
  const receivedThisMonth: Record<string, number> = {};
  for (const row of (r.data ?? []) as { currency: string; received: number }[]) receivedThisMonth[row.currency] = num(row.received);
  return { totals, receivedThisMonth };
}

/** All clients on this side (VA / AI), with a payment summary for those that have payments. */
export async function getClientsWithSummary(ctx: AccountsCtx): Promise<{ client: AccountClient; summary: ClientSummary | null }[]> {
  const supabase = await getServerSupabase();
  const [clients, summary] = await Promise.all([
    allRows<AccountClient>((a, b) =>
      supabase.from("clients").select("id, name, pipeline, status, country").in("pipeline", ctx.pipelines).order("name").order("id").range(a, b),
    ),
    supabase.rpc("accounts_client_summary", { p_today: ctx.today, p_pipelines: ctx.pipelines }),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  const by = new Map(((summary.data ?? []) as ClientSummary[]).map((s) => [s.client_id, { ...s, lines: num(s.lines), late_lines: num(s.late_lines) }]));
  return clients.map((c) => ({ client: c, summary: by.get(c.id) ?? null }));
}

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** One page of a tab, newest period first. */
export async function getStageLines(
  ctx: AccountsCtx,
  stage: Stage,
  opts: { q: string; period: string; page: number; pageSize: number },
): Promise<{ rows: PaymentLine[]; total: number; periods: string[] }> {
  const supabase = await getServerSupabase();
  const [lines, periods] = await Promise.all([
    supabase.rpc("accounts_stage_lines", {
      p_today: ctx.today,
      p_pipelines: ctx.pipelines,
      p_stage: stage,
      p_q: opts.q ? escapeLike(opts.q) : null,
      p_period: opts.period || null,
      p_limit: opts.pageSize,
      p_offset: (opts.page - 1) * opts.pageSize,
    }),
    supabase.rpc("accounts_stage_periods", { p_today: ctx.today, p_pipelines: ctx.pipelines, p_stage: stage }),
  ]);
  if (lines.error) throw new Error(lines.error.message);
  if (periods.error) throw new Error(periods.error.message);
  const rows = ((lines.data ?? []) as (PaymentLine & { total_count: number })[]).map((r) => ({ ...r, amount: num(r.amount), paid_amount: num(r.paid_amount) }));
  return { rows, total: num((lines.data ?? [])[0]?.total_count), periods: ((periods.data ?? []) as { period_label: string }[]).map((p) => p.period_label) };
}

/** One client and their payment lines (newest period first). */
export async function getClientPayments(id: string): Promise<{ client: AccountClient | null; payments: ClientPayment[] }> {
  await requireArea("payments");
  const supabase = await getServerSupabase();
  const [{ data: client }, payments] = await Promise.all([
    supabase.from("clients").select("id, name, pipeline, status, country").eq("id", id).maybeSingle(),
    allRows<ClientPayment>((a, b) =>
      supabase.from("client_payments").select("*").eq("client_id", id).order("period_start", { ascending: false, nullsFirst: false }).order("id").range(a, b),
    ),
  ]);
  return {
    client: (client as AccountClient | null) ?? null,
    payments: payments.map((p) => ({ ...p, amount: num(p.amount), paid_amount: num(p.paid_amount) })),
  };
}
