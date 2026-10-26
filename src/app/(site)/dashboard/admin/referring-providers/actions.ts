"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function referringProvidersError(message: string): never {
  redirect(`/dashboard/admin/referring-providers?error=${encodeURIComponent(message)}`);
}

export async function reviewProviderRegistration(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  if (decision !== "approved" && decision !== "rejected") referringProvidersError("Invalid decision");

  const { error } = await supabase
    .from("referring_providers")
    .update({ approval_status: decision, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", id);
  if (error) referringProvidersError(error.message);

  revalidatePath("/dashboard/admin/referring-providers");
  revalidatePath("/dashboard/admin");
}
