import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { allRows } from "@/lib/server/paged";

export type ClientOption = { id: string; name: string };

/** VA clients for the "client" pickers in add forms: current ones first, then past ones. */
export async function vaClientOptions(): Promise<ClientOption[]> {
  const supabase = await getServerSupabase();
  const rows = await allRows<{ id: string; name: string; status: string }>((a, b) =>
    supabase.from("clients").select("id, name, status").eq("pipeline", "va").order("name").order("id").range(a, b),
  );
  const current = (s: string) => ["live", "active", "paused"].includes(s);
  return [...rows.filter((r) => current(r.status)), ...rows.filter((r) => !current(r.status))].map(({ id, name }) => ({ id, name }));
}
