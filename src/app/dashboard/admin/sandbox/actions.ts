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

export async function revokeSandboxPassAction(formData: FormData) {
  const { supabase } = await admin();
  const id = Number(formData.get("id"));
  await supabase.from("sandbox_passes").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/dashboard/admin/sandbox");
  redirect("/dashboard/admin/sandbox");
}
