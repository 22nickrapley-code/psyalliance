"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE } from "@/lib/env";

// Opens a personal sandbox pass: the database creates a fresh fictional
// guest account with its own sample activity and returns one-off sign-in
// details, used here once and never shown (migration 0086).
export async function enterSandboxAction(formData: FormData) {
  if (!IS_DEMO_SITE) redirect("/");
  const token = String(formData.get("token") || "");
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { data, error } = await supabase.rpc("claim_sandbox", { p_token: token }).maybeSingle<any>();
  if (error || !data) redirect(`/sandbox/${encodeURIComponent(token)}?error=${encodeURIComponent(error?.message || "This sandbox link has expired.")}`);
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
  if (signInError) redirect(`/sandbox/${encodeURIComponent(token)}?error=${encodeURIComponent("We couldn't open your sandbox. Please try again.")}`);
  // Remember the link on this device, so a dropped session can be restored
  // without a trip back to the email (see /sandbox/resume).
  const jar = await cookies();
  jar.set("pa_pass", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: data.expires_at ? new Date(data.expires_at) : new Date(Date.now() + 7 * 86_400_000),
  });
  redirect("/dashboard?welcome=sandbox");
}

export async function resetSandboxAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_my_sandbox");
  redirect(error ? `/dashboard?error=${encodeURIComponent(error.message)}` : "/dashboard?welcome=reset");
}
