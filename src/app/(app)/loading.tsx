/** Shown while a page loads: soft shimmering placeholders in the page's shape. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-7" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton h-6 w-56 rounded-lg bg-fill" />
        <div className="skeleton h-4 w-80 rounded bg-fill" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass skeleton h-[132px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass skeleton h-72 rounded-2xl lg:col-span-2" />
        <div className="glass skeleton h-72 rounded-2xl" />
      </div>
    </div>
  );
}
