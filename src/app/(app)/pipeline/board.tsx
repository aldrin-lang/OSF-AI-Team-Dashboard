"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { daysSince } from "@/lib/utils";
import { moveClientStage } from "../clients/actions";

type Stage = { id: string; name: string; slaDays: number | null };
type Card = {
  id: string;
  name: string;
  stageId: string | null;
  manager: string | null;
  country: string | null;
  stageEnteredAt: string;
  status: string;
};

const ACCENTS = [
  "bg-brand-500",
  "bg-navy-700",
  "bg-accent-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-sky-500",
];

export function Board({ stages, cards: initial }: { stages: Stage[]; cards: Card[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const active = cards.find((c) => c.id === activeId) ?? null;

  function onStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setError(null);
  }

  async function onEnd(e: DragEndEvent) {
    setActiveId(null);
    const cardId = String(e.active.id);
    const toStageId = e.over ? String(e.over.id) : null;
    if (!toStageId) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stageId === toStageId) return;

    const prev = card.stageId;
    setCards((cs) =>
      cs.map((c) =>
        c.id === cardId ? { ...c, stageId: toStageId, stageEnteredAt: new Date().toISOString() } : c,
      ),
    );
    const res = await moveClientStage({ clientId: cardId, toStageId });
    if (!res.ok) {
      setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, stageId: prev } : c)));
      setError(res.error ?? "Move blocked");
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((st, i) => (
            <Column
              key={st.id}
              stage={st}
              accent={ACCENTS[i % ACCENTS.length]}
              cards={cards.filter((c) => c.stageId === st.id)}
            />
          ))}
        </div>
        <DragOverlay>{active ? <CardChip card={active} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  stage,
  cards,
  accent,
}: {
  stage: Stage;
  cards: Card[];
  accent: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-surface/70 backdrop-blur-sm transition-colors ${
        isOver ? "border-brand-400 ring-2 ring-brand-200" : "border-line"
      }`}
    >
      <div className={`h-1 ${accent}`} />
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{stage.name}</p>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-ink-muted">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
        {cards.length === 0 && (
          <p className="rounded-lg border border-dashed border-line py-6 text-center text-xs text-ink-faint">
            Drop here
          </p>
        )}
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} slaDays={stage.slaDays} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ card, slaDays }: { card: Card; slaDays: number | null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? "opacity-30" : ""}>
      <CardChip card={card} slaDays={slaDays} />
    </div>
  );
}

function CardChip({
  card,
  slaDays,
  dragging,
}: {
  card: Card;
  slaDays?: number | null;
  dragging?: boolean;
}) {
  const d = daysSince(card.stageEnteredAt);
  const over = slaDays != null && d != null && d > slaDays;
  return (
    <div
      className={`cursor-grab rounded-lg border bg-surface p-2.5 text-sm shadow-sm transition-shadow active:cursor-grabbing ${
        dragging ? "border-brand-400 shadow-md" : "border-line hover:shadow-md"
      }`}
    >
      <Link
        href={`/clients/${card.id}`}
        className="font-medium text-ink hover:text-brand-300"
        onClick={(e) => e.stopPropagation()}
      >
        {card.name}
      </Link>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-faint">{card.manager ?? "Unassigned"}</span>
        <span
          className={`rounded px-1.5 py-0.5 font-medium ${
            over ? "bg-red-500/15 text-red-400" : "bg-white/[0.03] text-ink-faint"
          }`}
        >
          {d != null ? `${d}d` : "—"}
        </span>
      </div>
    </div>
  );
}
