import type { Tone } from "@/lib/labels";
import type { InvoiceHealth } from "@/lib/ops-core";

export const HEALTH: Record<InvoiceHealth, { label: string; tone: Tone }> = {
  overdue: { label: "Overdue", tone: "red" },
  due_soon: { label: "Due soon", tone: "amber" },
  open: { label: "Open", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  void: { label: "Void", tone: "neutral" },
};
