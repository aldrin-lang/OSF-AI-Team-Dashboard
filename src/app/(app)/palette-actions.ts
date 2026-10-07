"use server";

import { requireActorArea } from "@/lib/server/rbac";
import { getClientsMini } from "@/lib/data/queries";

/** ⌘K client search list, fetched the first time the palette opens (not on every page load). */
export async function loadPaletteClients() {
  await requireActorArea("clients");
  return getClientsMini();
}
