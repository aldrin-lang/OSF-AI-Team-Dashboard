/** One-line result message passed back from a server action via ?msg=. */
export function Flash({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink-muted">{msg}</div>;
}

/** Read ?msg= safely from page searchParams. */
export function flashFrom(sp: Record<string, string | string[] | undefined>): string {
  return typeof sp.msg === "string" ? sp.msg.slice(0, 300) : "";
}
