"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import { addComment } from "../actions";
import type { ActivityRow, Comment, EntityType } from "@/lib/types";

type Person = { id: string; name: string };

export function Feed({
  entity,
  entityId,
  activity,
  comments,
  people,
}: {
  entity: EntityType;
  entityId: string;
  activity: ActivityRow[];
  comments: Comment[];
  people: Person[];
}) {
  const nameById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const [selected, setSelected] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => {
      await addComment(fd);
      setBody("");
      setSelected([]);
      return null;
    },
    null,
  );

  const merged = useMemo(() => {
    const items: Array<{ id: string; at: string; kind: "comment" | "activity"; text: string; who: string | null }> = [];
    for (const c of comments)
      items.push({ id: `c${c.id}`, at: c.created_at, kind: "comment", text: c.body, who: c.author_id ? nameById.get(c.author_id) ?? null : null });
    for (const a of activity)
      items.push({ id: `a${a.id}`, at: a.created_at, kind: "activity", text: a.summary, who: a.actor_id ? nameById.get(a.actor_id) ?? null : null });
    return items.sort((x, y) => (x.at < y.at ? 1 : -1));
  }, [comments, activity, nameById]);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="entity" value={entity} />
        <input type="hidden" name="entity_id" value={entityId} />
        {selected.map((id) => (
          <input key={id} type="hidden" name="mention" value={id} />
        ))}
        <Textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an update…"
          required
        />
        <div className="flex items-center justify-between gap-2">
          <select
            className="h-8 rounded border border-neutral-200 bg-white px-1 text-xs"
            value=""
            onChange={(e) => {
              if (e.target.value && !selected.includes(e.target.value))
                setSelected([...selected, e.target.value]);
            }}
          >
            <option value="">+ Notify someone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button size="sm" type="submit" disabled={pending || !body.trim()}>
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
        {selected.length > 0 && (
          <p className="text-xs text-neutral-500">
            Notifying: {selected.map((id) => nameById.get(id)).join(", ")}{" "}
            <button type="button" className="underline" onClick={() => setSelected([])}>
              clear
            </button>
          </p>
        )}
      </form>

      <ul className="space-y-2.5">
        {merged.length === 0 && <li className="text-sm text-neutral-400">No activity yet.</li>}
        {merged.map((m) => (
          <li key={m.id} className="flex gap-3 text-sm">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                m.kind === "comment" ? "bg-blue-500" : "bg-neutral-300"
              }`}
            />
            <div className="min-w-0">
              <p className={m.kind === "comment" ? "text-neutral-900" : "text-neutral-600"}>
                {m.text}
              </p>
              <p className="text-xs text-neutral-400">
                {m.who ?? "System"} · {relativeTime(m.at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
