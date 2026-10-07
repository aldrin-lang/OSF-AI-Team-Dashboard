"use client";

import { useState } from "react";
import { SHEET_VISIBILITY, VISIBILITY_LABEL, type SheetVisibility } from "@/lib/sheets";

/** Visibility radio + the department / people pickers that go with it. */
export function ShareChoice({
  initial,
  departments,
  selectedDepartments,
  people,
  selectedPeople,
}: {
  initial: SheetVisibility;
  departments: { key: string; name: string }[];
  selectedDepartments: string[];
  people: { id: string; name: string }[];
  selectedPeople: string[];
}) {
  const [vis, setVis] = useState<SheetVisibility>(initial);
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {SHEET_VISIBILITY.map((v) => (
          <label
            key={v}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs ${
              vis === v ? "border-brand-500 bg-brand-500/10 font-medium text-ink" : "border-line text-ink-muted hover:bg-fill"
            }`}
          >
            <input type="radio" name="visibility" value={v} checked={vis === v} onChange={() => setVis(v)} className="accent-brand-500" />
            {VISIBILITY_LABEL[v]}
          </label>
        ))}
      </div>
      {vis === "departments" && (
        <div className="flex flex-wrap gap-1.5">
          {departments.map((d) => (
            <label key={d.key} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink">
              <input type="checkbox" name="departments" value={d.key} defaultChecked={selectedDepartments.includes(d.key)} className="accent-brand-500" />
              {d.name}
            </label>
          ))}
        </div>
      )}
      {vis === "people" && (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
          {people.length === 0 && <p className="text-xs text-ink-faint">No one else on the team yet.</p>}
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs text-ink">
              <input type="checkbox" name="people" value={p.id} defaultChecked={selectedPeople.includes(p.id)} className="accent-brand-500" />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
