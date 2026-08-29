import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · AI Receptionist Ops" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-neutral-900">AI Receptionist Ops</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Internal team access only. Accounts are created by an admin.
        </p>
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
