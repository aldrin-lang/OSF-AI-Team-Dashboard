import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";

export type ClientOption = { id: string; name: string };

/**
 * Client ids → names, and the client picker for add forms. Recruitment can't read the clients table
 * (Clients area), so — like clientNames() in staffing.ts — names come from the service role, id + name
 * only, and callers check the Candidates area first.
 */
export async function clientDirectory(): Promise<{ names: Map<string, string>; options: ClientOption[] }> {
  const admin = getAdminSupabase();
  const out: { id: string; name: string; status: string }[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("clients").select("id, name, status").eq("pipeline", "va").order("name").order("id").range(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as typeof out));
    if (!data || data.length < 1000) break;
  }
  const current = (s: string) => ["live", "active", "paused"].includes(s);
  return {
    names: new Map(out.map((c) => [c.id, c.name])),
    options: [...out.filter((c) => current(c.status)), ...out.filter((c) => !current(c.status))].map(({ id, name }) => ({ id, name })),
  };
}
