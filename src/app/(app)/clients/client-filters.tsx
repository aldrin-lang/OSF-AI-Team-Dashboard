"use client";

import { useRouter } from "next/navigation";
import { Select, Input } from "@/components/ui/primitives";
import { CLIENT_STATUS } from "@/lib/labels";

type Current = {
  manager?: string;
  country?: string;
  source?: string;
  stage?: string;
  status?: string;
  q?: string;
};

export function ClientFilters({
  profiles,
  stages,
  current,
}: {
  profiles: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  current: Current;
}) {
  const router = useRouter();

  function apply(patch: Partial<Current>) {
    const params = new URLSearchParams();
    const merged = { ...current, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    router.push(qs ? `/clients?${qs}` : "/clients");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search name…"
        defaultValue={current.q ?? ""}
        className="h-9 w-48"
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ q: (e.target as HTMLInputElement).value });
        }}
      />
      <Select
        className="w-40"
        value={current.stage ?? ""}
        onChange={(e) => apply({ stage: e.target.value })}
      >
        <option value="">All stages</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select
        className="w-40"
        value={current.manager ?? ""}
        onChange={(e) => apply({ manager: e.target.value })}
      >
        <option value="">All managers</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select
        className="w-36"
        value={current.status ?? ""}
        onChange={(e) => apply({ status: e.target.value })}
      >
        <option value="">Any status</option>
        {Object.entries(CLIENT_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>
      {Object.values(current).some(Boolean) && (
        <button
          className="text-xs text-ink-muted hover:text-ink"
          onClick={() => router.push("/clients")}
        >
          Clear
        </button>
      )}
    </div>
  );
}
