import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { DEFAULT_SERVICE, SERVICE_COOKIE, isService, type Service } from "@/lib/service";

export const NIL_ID = "00000000-0000-0000-0000-000000000000";

/** The service the signed-in user is viewing (cookie, default VA). Memoised per request. */
export const getService = cache(async (): Promise<Service> => {
  const v = (await cookies()).get(SERVICE_COOKIE)?.value;
  return isService(v) ? v : DEFAULT_SERVICE;
});

/** Client ids on the current side, or null when viewing all services. */
export const scopeClientIds = cache(async (): Promise<string[] | null> => {
  const s = await getService();
  if (s === "all") return null;
  const db = await getServerSupabase();
  const { data } = await db.from("clients").select("id").eq("pipeline", s).limit(5000);
  const ids = (data ?? []).map((r) => r.id as string);
  return ids.length ? ids : [NIL_ID];
});
