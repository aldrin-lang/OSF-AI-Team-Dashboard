import { ForceLight } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";
import { LoginScene } from "./scene";

export const metadata = { title: "Sign in · OSF AI Team Dashboard" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <>
      <ForceLight />
      <LoginScene form={<LoginForm next={next} />} />
    </>
  );
}
