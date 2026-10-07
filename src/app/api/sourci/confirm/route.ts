import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import { executeProposal } from "@/lib/server/sourci-exec";
import type { SourciProposal } from "@/lib/sourci-types";

// Runs a change Sourci proposed, after the user confirmed it in the widget.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // bulk sends

const KINDS = new Set(["update_lead", "create_client", "add_note", "create_task", "invoice_status", "candidate_status", "send_email", "notify_team", "bulk_update_leads", "bulk_update", "move_stage", "convert_lead", "create_invoice", "create_concern", "send_reminders", "send_checkins", "add_sheet_row", "create_sheet", "create_role", "shortlist", "hire"]);

export async function POST(request: Request) {
  const me = await getCurrentProfile();
  if (!me || !me.active) return NextResponse.json({ ok: false, message: "Please sign in" }, { status: 401 });
  if (!hasRole(me, "admin")) return NextResponse.json({ ok: false, message: "Sourci is only switched on for admins" }, { status: 403 });

  let proposal: SourciProposal;
  try {
    const b = (await request.json()) as { proposal?: SourciProposal };
    if (!b.proposal || !KINDS.has(b.proposal.kind)) throw new Error();
    proposal = b.proposal;
  } catch {
    return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 });
  }

  try {
    const r = await executeProposal(proposal, me);
    revalidatePath("/", "layout");
    return NextResponse.json(r);
  } catch (e) {
    const message = e instanceof Error ? e.message : "That didn't work.";
    return NextResponse.json({ ok: false, message: `Couldn't do that: ${message}` }, { status: 422 });
  }
}
