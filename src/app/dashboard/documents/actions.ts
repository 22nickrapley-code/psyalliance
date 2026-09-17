"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function uploadDocument(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("No file selected");

  const ownerScope = String(formData.get("owner_scope") || "personal");
  const folder = ownerScope === "world" ? "shared" : "personal";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${folder}/${user.id}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("documents").insert({
    profile_id: user.id,
    owner_scope: ownerScope,
    title: String(formData.get("title") || file.name),
    treatment_area: String(formData.get("treatment_area") || "") || null,
    storage_path: storagePath,
    uploaded_by: user.id,
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/dashboard/documents");
}

export async function deleteDocument(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));
  const storagePath = String(formData.get("storage_path") || "");

  if (storagePath) {
    await supabase.storage.from("documents").remove([storagePath]);
  }
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents");
}
