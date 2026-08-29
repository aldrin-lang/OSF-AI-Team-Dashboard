export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-7">
      <div className="space-y-2">
        <div className="h-6 w-56 rounded-lg bg-white/10" />
        <div className="h-4 w-80 rounded bg-white/[0.06]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-[132px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass h-72 rounded-2xl lg:col-span-2" />
        <div className="glass h-72 rounded-2xl" />
      </div>
    </div>
  );
}
