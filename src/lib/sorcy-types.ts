/** What Sorcy asks the browser to do after answering. Shared by the API route and the widget. */
export interface SorcyChart {
  title: string;
  subtitle?: string;
  unit?: string; // e.g. "leads", "GBP"
  bars: { label: string; value: number }[];
}

export type SorcyAction =
  | { type: "navigate"; href: string; label: string }
  | { type: "chart"; chart: SorcyChart };

export interface SorcyTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SorcyReply {
  reply: string;
  actions: SorcyAction[];
  error?: string;
}
