import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · OSF AI Team Dashboard" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-navy-800 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2.5 text-white">
          <Logo size={30} />
          <span className="text-lg font-semibold tracking-tight">
            OutsourceForce<span className="text-brand-400">.ai</span>
          </span>
        </div>
        <div className="relative z-10">
          <h2 className="max-w-sm text-2xl font-semibold leading-snug text-white">
            AI Team Dashboard
          </h2>
          <p className="mt-3 max-w-sm text-sm text-brand-100/80">
            Track every AI receptionist onboarding from sale to go-live — stages,
            regulatory bundles, build checklists and client concerns in one place.
          </p>
        </div>
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-2xl"
          style={{ background: "radial-gradient(circle, #2b7fff, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full opacity-20 blur-2xl"
          style={{ background: "radial-gradient(circle, #f2691f, transparent 70%)" }}
        />
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Logo size={26} />
            <span className="font-semibold text-ink">
              OutsourceForce<span className="text-brand-500">.ai</span>
            </span>
          </div>
          <h1 className="text-lg font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Internal team access only. Accounts are created by an admin.
          </p>
          <div className="mt-6 glass rounded-2xl p-6">
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </div>
  );
}
