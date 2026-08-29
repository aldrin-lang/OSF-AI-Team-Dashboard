export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded-lg bg-white/[0.1]" />
        <div className="h-4 w-72 rounded bg-white/[0.06]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[76px] rounded-2xl border border-line bg-surface" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-2xl border border-line bg-surface" />
        <div className="h-64 rounded-2xl border border-line bg-surface" />
      </div>
    </div>
  );
}
