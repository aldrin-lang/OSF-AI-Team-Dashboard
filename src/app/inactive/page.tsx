import { signOut } from "@/app/login/actions";

export default function InactivePage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Account inactive</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your account has been deactivated. Ask an admin to re-enable it.
        </p>
        <form action={signOut} className="mt-4">
          <button className="text-sm text-neutral-700 underline">Sign out</button>
        </form>
      </div>
    </div>
  );
}
