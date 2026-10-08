"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_URL, IS_DEMO_SITE, SANDBOX_SUPABASE_KEY, SANDBOX_SUPABASE_URL } from "@/lib/env";

// Open this account's sandbox: a private copy of PsyAlliance with fictional
// colleagues on the separate sandbox site. One per account, reused until it
// expires (7 days), then a fresh one. Nothing from the real account goes
// there except the email as a label, so the sandbox admin can tell whose
// sandbox it is.
export async function openSandboxAction() {
  if (IS_DEMO_SITE || !DEMO_URL) redirect("/dashboard");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: link } = await supabase.from("sandbox_links").select("token, expires_at").eq("profile_id", user.id).maybeSingle();
  if (link && link.expires_at > soon) redirect(`${DEMO_URL}/sandbox/${link.token}`);

  let token: string | null = null;
  try {
    const res = await fetch(`${SANDBOX_SUPABASE_URL}/rest/v1/rpc/start_sandbox`, {
      method: "POST",
      headers: { apikey: SANDBOX_SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_label: user.email || user.id }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = typeof body?.message === "string" ? body.message : "The sandbox isn't available right now. Please try again shortly.";
      redirect(`/dashboard?sandbox_error=${encodeURIComponent(message)}`);
    }
    token = typeof body === "string" ? body : null;
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    token = null;
  }
  if (!token) redirect(`/dashboard?sandbox_error=${encodeURIComponent("The sandbox isn't available right now. Please try again shortly.")}`);

  const expires = new Date(Date.now() + 7 * 86_400_000 - 5 * 60 * 1000).toISOString();
  await supabase.from("sandbox_links").upsert({ profile_id: user.id, token, expires_at: expires }, { onConflict: "profile_id" });
  redirect(`${DEMO_URL}/sandbox/${token}`);
}
