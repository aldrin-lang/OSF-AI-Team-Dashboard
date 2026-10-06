import { requireProfile } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { saveNotificationPrefs, updateMyName, changeMyPassword } from "./actions";
import type { NotificationPreferences } from "@/lib/types";

export const metadata = { title: "Settings · AI Receptionist Ops" };

const EVENTS: { key: string; label: string; hint: string }[] = [
  { key: "assigned_to_me", label: "A task is assigned to me", hint: "" },
  { key: "mention", label: "I'm @mentioned in an update", hint: "" },
  { key: "stage_change_my_client", label: "A client I manage changes stage", hint: "" },
  { key: "concern_my_client", label: "A concern is raised on my client", hint: "" },
  { key: "stale_client", label: "A client I manage goes stale / past SLA", hint: "daily scan" },
];

export default async function SettingsPage(props: PageProps<"/settings">) {
  const sp = await props.searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg.slice(0, 200) : "";
  const profile = await requireProfile();
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", profile.id)
    .maybeSingle();
  const prefs = (data as NotificationPreferences | null) ?? null;
  const val = (k: string) => (prefs ? (prefs as unknown as Record<string, boolean>)[k] : true);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" subtitle="Your profile and notifications" />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateMyName} className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Full name</Label>
              <Input name="full_name" defaultValue={profile.full_name} />
            </div>
            <Button size="sm" type="submit">
              Save
            </Button>
          </form>
          <p className="mt-2 text-xs text-ink-faint">
            {profile.email} · role: {profile.role}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={saveNotificationPrefs} className="space-y-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">Notify me when…</th>
                  <th className="pb-2 text-center font-medium">In-app</th>
                  <th className="pb-2 text-center font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((e) => (
                  <tr key={e.key} className="border-t border-line">
                    <td className="py-2 text-ink-muted">
                      {e.label}
                      {e.hint && <span className="ml-1 text-xs text-ink-faint">({e.hint})</span>}
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        name={`${e.key}_in_app`}
                        defaultChecked={val(`${e.key}_in_app`)}
                        className="h-4 w-4 accent-brand-500"
                      />
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        name={`${e.key}_email`}
                        defaultChecked={val(`${e.key}_email`)}
                        className="h-4 w-4 accent-brand-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Label>Digest email</Label>
              <Select name="digest" defaultValue={prefs?.digest ?? "daily"} className="w-40">
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </Select>
            </div>
            <Button size="sm" type="submit">
              Save preferences
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardBody>
          {msg && <p className="mb-3 rounded-lg bg-fill px-3 py-2 text-sm text-ink-muted">{msg}</p>}
          <form action={changeMyPassword} className="flex flex-wrap items-end gap-2">
            <div>
              <Label>New password</Label>
              <Input name="password" type="password" autoComplete="new-password" minLength={10} required className="w-56" />
            </div>
            <div>
              <Label>Repeat it</Label>
              <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required className="w-56" />
            </div>
            <Button size="sm" type="submit">
              Change password
            </Button>
          </form>
          <p className="mt-2 text-xs text-ink-faint">At least 10 characters, with letters and numbers.</p>
        </CardBody>
      </Card>
    </div>
  );
}
