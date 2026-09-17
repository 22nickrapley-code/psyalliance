"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Keep uploads to the kinds of files a practice actually needs to share
// (licenses, intake forms, referral letters, insurance panels) and off of
// the free Storage tier's cap. Executables, archives, etc. are rejected
// outright rather than merely discouraged.
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
]);

export async function uploadDocument(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("No file selected");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB)`);
  }
  if (file.type && !ALLOWED_CONTENT_TYPES.has(file.type)) {
    throw new Error(
      `File type "${file.type}" isn't supported. Use PDF, Word, plain text/CSV, or an image.`
    );
  }

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

// "Is there a way of rating the documents? So that people can see what
// others have found to be best?" - one star rating per person per shared
// document; re-rating just upserts over your own prior rating.
export async function rateDocument(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const documentId = Number(formData.get("document_id"));
  const rating = Number(formData.get("rating"));
  if (rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5");

  const { error } = await supabase
    .from("document_ratings")
    .upsert({ document_id: documentId, rated_by: user.id, rating }, { onConflict: "document_id,rated_by" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents");
}
