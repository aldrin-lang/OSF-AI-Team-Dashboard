"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
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
import { QuickView } from "./quick-view";

type Stage = { id: string; name: string; slaDays: number | null };
type Card = {
  id: string;
  name: string;
  stageId: string | null;
  manager: string | null;
  country: string | null;
  stageEnteredAt: string;
  status: string;
  risk: "ok" | "watch" | "risk";
};

const ACCENTS = [
  "from-brand-400 to-brand-600",
  "from-cyan-300 to-cyan-500",
  "from-violet-400 to-violet-600",
  "from-accent-400 to-accent-600",
  "from-emerald-300 to-emerald-500",
  "from-rose-400 to-rose-600",
];

export function Board({ stages, cards: initial }: { stages: Stage[]; cards: Card[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const active = cards.find((c) => c.id === activeId) ?? null;

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
        c.id === cardId
          ? { ...c, stageId: toStageId, stageEnteredAt: new Date().toISOString() }
          : c,
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
        <p className="mb-3 rounded-xl border border-rose-400/25 bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => {
          setActiveId(String(e.active.id));
          setError(null);
        }}
        onDragEnd={onEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((st, i) => (
            <Column
              key={st.id}
              stage={st}
              accent={ACCENTS[i % ACCENTS.length]}
              cards={cards.filter((c) => c.stageId === st.id)}
              onOpen={setOpenId}
            />
          ))}
        </div>
        <DragOverlay>{active ? <CardChip card={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <QuickView clientId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Column({
  stage,
  cards,
  accent,
  onOpen,
}: {
  stage: Stage;
  cards: Card[];
  accent: string;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`glass flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl transition-all ${
        isOver ? "-translate-y-0.5 border-brand-400/60 ring-2 ring-brand-500/30" : ""
      }`}
    >
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex items-center justify-between px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {stage.name}
        </p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-ink">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
        {cards.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/12 py-7 text-center text-xs text-ink-faint">
            Drop here
          </p>
        )}
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} slaDays={stage.slaDays} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({
  card,
  slaDays,
  onOpen,
}: {
  card: Card;
  slaDays: number | null;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.id)}
      className={isDragging ? "opacity-30" : ""}
    >
      <CardChip card={card} slaDays={slaDays} />
    </div>
  );
}

const RISK_DOT: Record<Card["risk"], string> = {
  ok: "bg-emerald-400/70",
  watch: "bg-accent-400",
  risk: "bg-rose-400",
};

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
      className={`group cursor-pointer rounded-xl border bg-white/[0.05] p-3 text-sm backdrop-blur-sm transition-all ${
        dragging
          ? "border-brand-400/70 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.8),0_0_20px_-4px_rgba(43,127,255,0.5)]"
          : "border-white/10 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${RISK_DOT[card.risk]}`} />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{card.name}</span>
        <Link
          href={`/clients/${card.id}`}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 transition-opacity hover:text-brand-300 group-hover:opacity-100"
          title="Open full page"
        >
          <ExternalLink className="h-3.5 w-3.5 text-ink-faint" />
        </Link>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-faint">{card.manager ?? "Unassigned"}</span>
        <span
          className={`rounded-md px-1.5 py-0.5 font-medium ${
            over ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.05] text-ink-faint"
          }`}
        >
          {d != null ? `${d}d` : "—"}
        </span>
      </div>
    </div>
  );
}
