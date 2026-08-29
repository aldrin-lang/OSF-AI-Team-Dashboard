"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { addTask } from "../actions";

export function TaskAdder({
  clientId,
  profiles,
}: {
  clientId: string;
  profiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await addTask(fd);
        ref.current?.reset();
        router.refresh();
      }}
      className="space-y-2 border-t border-line pt-3"
    >
      <input type="hidden" name="client_id" value={clientId} />
      <Input name="title" placeholder="New task…" required className="h-8 text-xs" />
      <div className="flex gap-2">
        <Select name="assignee_id" defaultValue="" className="h-8 text-xs">
          <option value="">Unassigned</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input name="due_date" type="date" className="h-8 text-xs" />
        <Button size="sm" type="submit">
          Add
        </Button>
      </div>
    </form>
  );
}
