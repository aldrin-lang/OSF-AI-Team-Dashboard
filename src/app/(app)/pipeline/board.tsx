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
      cs.map((c) => (c.id === cardId ? { ...c, stageId: toStageId, stageEnteredAt: new Date().toISOString() } : c)),
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
        <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((st) => (
            <Column
              key={st.id}
              stage={st}
              cards={cards.filter((c) => c.stageId === st.id)}
            />
          ))}
        </div>
        <DragOverlay>{active ? <CardChip card={active} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ stage, cards }: { stage: Stage; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-lg border p-2 ${
        isOver ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-slate-100/50"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-slate-700">{stage.name}</p>
        <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-600">{cards.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
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
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? "opacity-30" : ""}
    >
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
      className={`rounded-md border bg-white p-2 text-sm shadow-sm ${
        dragging ? "border-slate-900" : "border-slate-200"
      }`}
    >
      <Link
        href={`/clients/${card.id}`}
        className="font-medium text-slate-900 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {card.name}
      </Link>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span>{card.manager ?? "Unassigned"}</span>
        <span className={over ? "text-red-600" : ""}>{d != null ? `${d}d` : ""}</span>
      </div>
    </div>
  );
}
