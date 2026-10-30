"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GUIDE, HANDOFF_COOKIE, HANDOFF_HOURS, HELPS, parseHandoff } from "@/lib/start-guide";

// Continue: the choice is used once. It opens the right unsent draft or editor; nothing is sent, published or switched on.
export async function continueStartAction(formData: FormData) {
  const jar = await cookies();
  const h = parseHandoff(jar.get(HANDOFF_COOKIE)?.value);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  if (!h) redirect("/dashboard");
  await supabase.rpc("set_starting_intent", { p_intent: h.need === "client_referral" ? "client_referral" : h.need === "perspective" ? "perspective" : h.need === "reducing" ? "reducing" : h.need === "time_away" ? "time_away" : h.need === "caseload" ? "caseload" : h.need === "offer_support" ? "offer_support" : "explore" });
  await supabase.rpc("use_starting_intent");
  await supabase.rpc("log_lifecycle_event", { p_namespace: "real", p_event: "handoff_adopted", p_need: h.need });
  jar.delete(HANDOFF_COOKIE);
  const route = String(formData.get("route") || "");
  if (route === "referral") redirect("/dashboard/referrals?new=1");
  if (route === "continuity") redirect("/dashboard/continuity");
  redirect(GUIDE[h.need].target.startsWith("/dashboard/start") ? "/dashboard/start" : GUIDE[h.need].target);
}

// Confirming which kinds of request to consider is a separate, explicit step. Only chosen kinds are opened.
export async function confirmHelpAction(formData: FormData) {
  const jar = await cookies();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const picked = formData.getAll("help").map(String).filter((h) => (HELPS as readonly string[]).includes(h));
  const p: Record<string, unknown> = {
    openReferrals: picked.includes("referrals"),
    openCover: picked.includes("cover"),
    openConsult: picked.includes("consult"),
  };
  const { error } = await supabase.rpc("set_my_participation", { p });
  if (error) redirect(`/dashboard/start?route=help&error=${encodeURIComponent("That didn't save, so nothing was changed. Please try again.")}`);
  await supabase.rpc("use_starting_intent");
  jar.delete(HANDOFF_COOKIE);
  redirect(`/dashboard/settings?saved=${encodeURIComponent("Saved. Nothing is published, and you can pause any of these at any time.")}#approach`);
}

export async function startFreshAction() {
  const jar = await cookies();
  jar.delete(HANDOFF_COOKIE);
  const supabase = await createClient();
  await supabase.rpc("set_starting_intent", { p_intent: "" });
  await supabase.rpc("log_lifecycle_event", { p_namespace: "real", p_event: "handoff_cleared" });
  redirect("/dashboard");
}

// Discard one suggestion. The choice was only ever a private draft in this browser, so discarding it removes it from
// the draft and changes nothing on the account.
export async function discardSuggestionAction(what: string) {
  const jar = await cookies();
  const h = parseHandoff(jar.get(HANDOFF_COOKIE)?.value);
  if (!h) redirect("/dashboard");
  const next = { need: h.need, ctx: h.ctx, helps: h.helps, exp: h.exp };
  if (what === "ctx") next.ctx = undefined;
  else if ((HELPS as readonly string[]).includes(what)) next.helps = (h.helps || []).filter((k) => k !== what);
  jar.set(HANDOFF_COOKIE, JSON.stringify(next), { path: "/", maxAge: HANDOFF_HOURS * 3600, sameSite: "lax" });
  redirect("/dashboard/start");
}
