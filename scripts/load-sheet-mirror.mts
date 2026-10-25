// Manual load of the team's sheet tabs into sheet_mirror (service role), for when the Apps Script sync
// isn't used. Steps: export each spreadsheet as .xlsx (Drive), convert with
//   python3 scripts/xlsx-to-sheet-mirror.py <xlsx dir> <out dir>      (files named <spreadsheetId>.xlsx)
// then load:
//   npx tsx scripts/load-sheet-mirror.mts <out dir>
// Tabs not in the converted set are removed from the dashboard.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const dir = process.argv[2];
const db = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const keys: string[] = JSON.parse(readFileSync(`${dir}/_keys.json`, "utf8"));
let ok = 0;
for (const key of keys) {
  const { meta, parts } = JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8"));
  const syncId = "manual" + randomUUID().replace(/-/g, "").slice(0, 18);
  const up = await db.from("sheet_mirror").upsert(meta, { onConflict: "key" });
  if (up.error) { console.log("FAIL", key, up.error.message); continue; }
  let bad = false;
  for (let i = 0; i < parts.length; i++) {
    const r = await db.from("sheet_mirror_parts").insert({ key, sync_id: syncId, part: i, styles: parts[i].styles, rows: parts[i].rows });
    if (r.error) { console.log("FAIL", key, "part", i, r.error.message); bad = true; break; }
  }
  if (bad) continue;
  const done = await db.from("sheet_mirror").update({ parts: parts.length, sync_id: syncId, synced_at: new Date().toISOString() }).eq("key", key);
  if (done.error) { console.log("FAIL", key, done.error.message); continue; }
  await db.from("sheet_mirror_parts").delete().eq("key", key).neq("sync_id", syncId);
  ok++;
}
const { data: all } = await db.from("sheet_mirror").select("key");
const gone = (all ?? []).map((r) => r.key as string).filter((k) => !keys.includes(k));
if (gone.length) await db.from("sheet_mirror").delete().in("key", gone);
console.log(`loaded ${ok} of ${keys.length}; removed ${gone.length} old: ${gone.join(", ")}`);
