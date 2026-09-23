"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function setSavedLibraryResourceAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const documentId = Number(formData.get("document_id"));
  const intent = String(formData.get("intent") || "");
  if (!Number.isSafeInteger(documentId) || documentId < 1 || !["save", "remove"].includes(intent)) {
    redirect("/dashboard/documents?error=Invalid+resource");
  }
  if (intent === "save") {
    const { data: resource } = await supabase.from("documents").select("id")
      .eq("id", documentId).eq("owner_scope", "world").eq("review_status", "published").maybeSingle();
    if (!resource) redirect("/dashboard/documents?error=Resource+not+available");
    const { error } = await supabase.from("saved_library_resources")
      .upsert({ profile_id: user.id, document_id: documentId });
    if (error) redirect("/dashboard/documents?error=Could+not+save+resource");
  } else {
    const { error } = await supabase.from("saved_library_resources").delete()
      .eq("profile_id", user.id).eq("document_id", documentId);
    if (error) redirect("/dashboard/documents?error=Could+not+remove+resource");
  }
  revalidatePath("/dashboard/documents");
  redirect("/dashboard/documents?tab=my");
}
