"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    redirect(`/auth/sign-up?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/auth/sign-in?message=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
}

export async function signIn(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}
