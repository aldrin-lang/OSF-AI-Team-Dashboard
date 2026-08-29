import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/utils";
import { markAllRead, markRead } from "./actions";
import type { NotificationRow } from "@/lib/types";

export const metadata = { title: "Notifications · AI Receptionist Ops" };

export default async function NotificationsPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data as NotificationRow[]) ?? [];
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up"}
        actions={
          unread ? (
            <form action={markAllRead}>
              <button className="text-sm text-ink-muted hover:text-ink">
                Mark all read
              </button>
            </form>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState>No notifications yet.</EmptyState>
      ) : (
        <ul className="glass divide-y divide-line rounded-2xl">
          {rows.map((n) => (
            <li key={n.id} className={n.read_at ? "" : "bg-blue-50/40"}>
              <Link
                href={n.link ?? "/"}
                className="block px-4 py-3 hover:bg-fill"
                {...(!n.read_at ? {} : {})}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <span className="text-xs text-ink-faint">{relativeTime(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>}
              </Link>
              {!n.read_at && (
                <form action={markRead} className="px-4 pb-2">
                  <input type="hidden" name="id" value={n.id} />
                  <button className="text-xs text-ink-faint hover:text-ink-muted">
                    Mark read
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
