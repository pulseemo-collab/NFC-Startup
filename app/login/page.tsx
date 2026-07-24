import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

// Owner login — private, never indexed and never linked from the public site.
export const metadata: Metadata = {
  title: "Hyr — Paneli",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // If already signed in, skip the form. (The middleware also handles this, but
  // this keeps the page correct even if the matcher changes.)
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <LoginForm />;
}
