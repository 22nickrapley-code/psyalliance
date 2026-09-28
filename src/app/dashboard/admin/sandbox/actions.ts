"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function admin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);
  return { supabase, user };
}

// A personal, time-limited sandbox pass for one prospect.
export async function createSandboxPassAction(formData: FormData) {
  const { supabase, user } = await admin();
  const label = String(formData.get("label") || "").trim();
  const days = Math.min(30, Math.max(1, Number(formData.get("days")) || 7));
  if (label.length < 2) redirect("/dashboard/admin/sandbox?error=" + encodeURIComponent("Say who the pass is for."));
  const { data, error } = await supabase
    .from("sandbox_passes")
    .insert({ label, created_by: user.id, expires_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .select("token")
    .single();
  if (error) redirect("/dashboard/admin/sandbox?error=" + encodeURIComponent(error.message));
  revalidatePath("/dashboard/admin/sandbox");
  redirect("/dashboard/admin/sandbox?created=" + encodeURIComponent(data!.token));
}

// Turn a prospect's request into their own 7-day pass. The link is shown
// once issued; the admin sends it to the address on the request.
export async function issueSandboxRequestAction(formData: FormData) {
  const { supabase, user } = await admin();
  const id = Number(formData.get("id"));
  const days = Math.min(30, Math.max(1, Number(formData.get("days")) || 7));
  const { data: req } = await supabase.from("sandbox_requests").select("id, full_name, email, state, status").eq("id", id).maybeSingle();
  if (!req || req.status !== "new") redirect("/dashboard/admin/sandbox?error=" + encodeURIComponent("That request has already been handled."));
  const label = `${req!.full_name}${req!.state ? `, ${req!.state}` : ""} (${req!.email})`.slice(0, 200);
  const { data: pass, error } = await supabase
    .from("sandbox_passes")
    .insert({ label, created_by: user.id, expires_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .select("id, token")
    .single();
  if (error || !pass) redirect("/dashboard/admin/sandbox?error=" + encodeURIComponent(error?.message || "Couldn't create the pass."));
  await supabase
    .from("sandbox_requests")
    .update({ status: "issued", pass_id: pass!.id, decided_at: new Date().toISOString(), decided_by: user.id })
    .eq("id", id);
  revalidatePath("/dashboard/admin/sandbox");
  redirect(`/dashboard/admin/sandbox?created=${encodeURIComponent(pass!.token)}&for=${encodeURIComponent(req!.email)}`);
}

export async function declineSandboxRequestAction(formData: FormData) {
  const { supabase, user } = await admin();
  const id = Number(formData.get("id"));
  await supabase
    .from("sandbox_requests")
    .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: user.id })
    .eq("id", id)
    .eq("status", "new");
  revalidatePath("/dashboard/admin/sandbox");
  redirect("/dashboard/admin/sandbox");
}

export async function revokeSandboxPassAction(formData: FormData) {
  const { supabase } = await admin();
  const id = Number(formData.get("id"));
  await supabase.from("sandbox_passes").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/dashboard/admin/sandbox");
  redirect("/dashboard/admin/sandbox");
}
