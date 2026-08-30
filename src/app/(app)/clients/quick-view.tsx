"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Zap, MessageSquarePlus, Phone, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/primitives";
import { RB_STATUS, CHECKLIST_STATUS, CLIENT_STATUS } from "@/lib/labels";
import { portalLinkFor } from "@/lib/constants";
import { relativeTime } from "@/lib/utils";
import { moveClientStage, setChecklistStatus } from "./actions";
import {
  getClientQuick,
  quickSetField,
  quickSetRb,
  quickSaveLine,
  quickDeleteLine,
  quickAddNote,
  type ClientQuick,
} from "./quick-actions";

const RB_OPTS = Object.entries(RB_STATUS);

export function QuickView({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<ClientQuick | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!clientId) return;
    setData(null);
    setErr(null);
    setLoading(true);
    getClientQuick(clientId)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (clientId) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clientId, onClose]);

  function refresh() {
    if (clientId) getClientQuick(clientId).then((d) => setData(d));
    router.refresh();
  }

  if (!clientId) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="glass absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto rounded-l-2xl border-l border-line p-5">
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}
        {err && <p className="text-sm text-rose-600">{err}</p>}

        {data && (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">{data.client.company_name || data.client.name}</h2>
                <p className="text-xs text-ink-faint">
                  {[data.client.industry, data.client.country].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-fill-strong hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {data.risk.level !== "ok" && (
                <Badge tone={data.risk.level === "risk" ? "red" : "amber"}>
                  {data.risk.level === "risk" ? "At risk" : "Watch"}
                </Badge>
              )}
              <a
                href={portalLinkFor(data.client)}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
              >
                Client portal <ExternalLink className="h-3 w-3" />
              </a>
              <Link
                href={`/clients/${data.client.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800"
              >
                Full page <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {/* Next action */}
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent-500/25 bg-accent-500/10 p-3">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-600">
                  Next action
                </p>
                <p className="text-sm text-ink">{data.nextAction.label}</p>
                {data.risk.reasons.length > 0 && (
                  <p className="mt-1 text-xs text-ink-faint">{data.risk.reasons.join(" · ")}</p>
                )}
              </div>
            </div>

            {/* Stage */}
            <Section label="Stage">
              <div className="flex flex-wrap gap-1.5">
                {data.stages.map((s) => {
                  const current = s.id === data.client.stage_id;
                  return (
                    <button
                      key={s.id}
                      disabled={pending || current}
                      title={!s.allowed ? `Blocked: ${s.blockedBy.join(", ")}` : undefined}
                      onClick={() =>
                        start(async () => {
                          setErr(null);
                          const r = await moveClientStage({ clientId: data.client.id, toStageId: s.id });
                          if (!r.ok) setErr(r.error ?? "Blocked");
                          else refresh();
                        })
                      }
                      className={[
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        current
                          ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white"
                          : s.allowed
                            ? "bg-fill-strong text-ink-muted hover:bg-fill-strong"
                            : "cursor-not-allowed bg-fill text-ink-faint",
                      ].join(" ")}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Section label="Manager">
                <Select
                  value={data.client.manager_id ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    start(async () => {
                      await quickSetField({ clientId: data.client.id, field: "manager_id", value: e.target.value });
                      refresh();
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {data.managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </Section>
              <Section label="Status">
                <Select
                  value={data.client.status}
                  disabled={pending}
                  onChange={(e) =>
                    start(async () => {
                      await quickSetField({ clientId: data.client.id, field: "status", value: e.target.value });
                      refresh();
                    })
                  }
                >
                  {Object.entries(CLIENT_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </Select>
              </Section>
            </div>

            <Section label={`AI phones${data.lines.length ? ` · ${data.lines.length}` : ""}`}>
              <div className="space-y-2">
                {data.lines.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-xl border border-line bg-fill p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      <Input
                        defaultValue={l.label ?? ""}
                        placeholder="Name / label (e.g. Shannon)"
                        disabled={pending}
                        className="h-8 flex-1 text-xs"
                        onBlur={(e) => {
                          if ((e.target.value.trim() || "") !== (l.label ?? ""))
                            start(async () => {
                              await quickSaveLine({
                                clientId: data.client.id,
                                lineId: l.id,
                                label: e.target.value,
                                ai_phone_number: l.ai_phone_number,
                              });
                              refresh();
                            });
                        }}
                      />
                      <button
                        onClick={() =>
                          start(async () => {
                            await quickDeleteLine({ clientId: data.client.id, lineId: l.id });
                            refresh();
                          })
                        }
                        className="rounded p-1 text-ink-faint hover:bg-fill-strong hover:text-rose-600"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        defaultValue={l.ai_phone_number ?? ""}
                        placeholder="Phone number"
                        disabled={pending}
                        className="h-8 flex-1 text-xs"
                        onBlur={(e) => {
                          if ((e.target.value.trim() || "") !== (l.ai_phone_number ?? ""))
                            start(async () => {
                              await quickSaveLine({
                                clientId: data.client.id,
                                lineId: l.id,
                                label: l.label,
                                ai_phone_number: e.target.value,
                              });
                              refresh();
                            });
                        }}
                      />
                      <Select
                        value={l.regulatory_bundle_status}
                        disabled={pending}
                        className="h-8 w-32 text-xs"
                        onChange={(e) =>
                          start(async () => {
                            await quickSetRb({
                              clientId: data.client.id,
                              lineId: l.id,
                              value: e.target.value,
                            });
                            refresh();
                          })
                        }
                      >
                        {RB_OPTS.map(([k, v]) => (
                          <option key={k} value={k}>
                            RB: {v.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ))}
                <button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await quickSaveLine({
                        clientId: data.client.id,
                        label: null,
                        ai_phone_number: null,
                      });
                      refresh();
                    })
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-medium text-ink-muted hover:border-brand-400/40 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add AI phone
                </button>
              </div>
            </Section>

            <Section label="Build checklist">
              <ul className="space-y-1">
                {data.checklist.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={it.status === "done"}
                      disabled={pending}
                      onChange={() =>
                        start(async () => {
                          await setChecklistStatus({
                            itemId: it.id,
                            clientId: data.client.id,
                            status: it.status === "done" ? "todo" : "done",
                          });
                          refresh();
                        })
                      }
                      className="h-4 w-4 rounded border-line-strong accent-brand-500"
                    />
                    <span className={it.status === "done" ? "text-ink-faint line-through" : "text-ink-muted"}>
                      {it.label}
                    </span>
                    {it.status !== "done" && it.status !== "todo" && (
                      <Badge tone={CHECKLIST_STATUS[it.status].tone} className="ml-auto">
                        {CHECKLIST_STATUS[it.status].label}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            <Section label="Add a note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's the update?" />
              <Button
                size="sm"
                className="mt-2"
                disabled={pending || !note.trim()}
                onClick={() =>
                  start(async () => {
                    await quickAddNote({ clientId: data.client.id, body: note });
                    setNote("");
                    refresh();
                  })
                }
              >
                <MessageSquarePlus className="h-3.5 w-3.5" /> Post note
              </Button>
            </Section>

            {data.activity.length > 0 && (
              <Section label="Recent activity">
                <ul className="space-y-1.5">
                  {data.activity.map((a) => (
                    <li key={a.id} className="text-xs text-ink-muted">
                      {a.summary}
                      <span className="text-ink-faint"> · {relativeTime(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      {children}
    </div>
  );
}
