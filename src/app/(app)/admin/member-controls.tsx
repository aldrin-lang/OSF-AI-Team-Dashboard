"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/primitives";
import { setMemberRole, setMemberActive } from "./actions";
import type { UserRole } from "@/lib/types";

export function RoleSelect({ id, role }: { id: string; role: UserRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      defaultValue={role}
      disabled={pending}
      className="h-7 w-28 text-xs"
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("role", e.target.value);
        start(async () => {
          await setMemberRole(fd);
          router.refresh();
        });
      }}
    >
      <option value="member">member</option>
      <option value="manager">manager</option>
      <option value="admin">admin</option>
    </Select>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-xs font-medium text-slate-500 hover:text-navy-800 disabled:opacity-50"
      onClick={() => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("active", (!active).toString());
        start(async () => {
          await setMemberActive(fd);
          router.refresh();
        });
      }}
    >
      {active ? "Deactivate" : "Reactivate"}
    </button>
  );
}
