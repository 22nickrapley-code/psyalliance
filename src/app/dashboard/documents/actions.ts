"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertIsAdmin } from "@/lib/admin";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function documentsError(message: string): never {
  redirect(`/dashboard/documents?error=${encodeURIComponent(message)}`);
}

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // V1 cannot receive arbitrary member-uploaded files: a document can carry
  // identifiable patient information even when its title does not. Admin
  // uploads to the governed review queue remain supported.
  const { data: uploader } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!uploader?.is_admin || formData.get("owner_scope") !== "world") {
    documentsError("Member file uploads are paused while the no-patient-data boundary is established. Save a reviewed Practice Library resource instead.");
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) documentsError("No file selected");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    documentsError(`File is too large (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB)`);
  }
  if (file.type && !ALLOWED_CONTENT_TYPES.has(file.type)) {
    documentsError(
      `File type "${file.type}" isn't supported. Use PDF, Word, plain text/CSV, or an image.`
    );
  }

  const ownerScope = String(formData.get("owner_scope") || "personal");
  const storageFolder = ownerScope === "world" ? "shared" : "personal";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${storageFolder}/${user.id}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) documentsError(uploadError.message);

  // A document can carry several treatment areas now (document_treatment_areas
  // join table, mirroring profile_lookup_values) rather than just one - the
  // legacy `treatment_area` column is left null on new uploads. "general" is
  // a synthetic option living in the same multi-select (rendered first, per
  // Nick's request) rather than a real lookup_value id, so Number() turns it
  // into NaN and it's naturally excluded from treatmentAreaIds below - it's
  // read separately as its own flag instead.
  const rawAreaValues = formData.getAll("treatment_area_ids").map(String);
  const isGeneral = rawAreaValues.includes("general");
  const treatmentAreaIds = isGeneral
    ? []
    : rawAreaValues.map((v) => Number(v)).filter((n) => Number.isFinite(n));

  // Folders are a personal-documents concept only; ignore any folder_id sent
  // alongside a shared-library upload rather than trusting the client.
  const rawFolderId = ownerScope === "personal" ? Number(formData.get("folder_id")) : NaN;
  const folderId = Number.isFinite(rawFolderId) && rawFolderId > 0 ? rawFolderId : null;
  if (folderId) {
    // Confirm the folder is actually this user's own before filing into it -
    // the FK alone would just fail with a generic DB error on a bad id.
    const { data: ownedFolder } = await supabase
      .from("document_folders")
      .select("id")
      .eq("id", folderId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!ownedFolder) documentsError("That folder doesn't exist");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      profile_id: user.id,
      owner_scope: ownerScope,
      title: String(formData.get("title") || file.name),
      storage_path: storagePath,
      uploaded_by: user.id,
      is_general: isGeneral,
      folder_id: folderId,
    })
    .select("id")
    .single();
  if (insertError) documentsError(insertError.message);

  if (treatmentAreaIds.length > 0 && inserted) {
    const { error: areasError } = await supabase.from("document_treatment_areas").insert(
      treatmentAreaIds.map((lookup_value_id) => ({ document_id: inserted.id, lookup_value_id }))
    );
    if (areasError) documentsError(areasError.message);
  }

  revalidatePath("/dashboard/documents");

  // Redirect (rather than just revalidating) so the page shows a "your
  // document was uploaded" confirmation banner and, for a personal upload
  // filed into a folder, lands the user looking at that folder so the new
  // document is immediately visible in the list below.
  const confirmParams = new URLSearchParams({ uploaded: "1" });
  if (folderId) confirmParams.set("folder", String(folderId));
  redirect(`/dashboard/documents?${confirmParams.toString()}`);
}

export async function deleteDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));
  const storagePath = String(formData.get("storage_path") || "");

  // RLS already restricts the actual delete to the uploader or an admin
  // (see migration 0036), but that fails as a silent no-op rather than an
  // error - checked explicitly here so a stray/tampered request gets a
  // clear rejection instead of quietly doing nothing.
  const { data: doc } = await supabase.from("documents").select("uploaded_by").eq("id", id).maybeSingle();
  if (!doc) documentsError("Document not found");
  if (doc.uploaded_by !== user.id) {
    await assertIsAdmin(supabase, user.id);
  }

  if (storagePath) {
    await supabase.storage.from("documents").remove([storagePath]);
  }
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) documentsError(error.message);

  revalidatePath("/dashboard/documents");
}

// Flat, per-user folders for organizing personal documents. Folders belong
// to exactly one profile (RLS-enforced) and a document sits in at most one
// folder - both deliberate simplifications, not future nesting/tagging.
export async function createFolder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const name = String(formData.get("name") || "").trim();
  if (!name) documentsError("Folder name can't be empty");

  const { error } = await supabase.from("document_folders").insert({ profile_id: user.id, name });
  if (error) {
    if (error.code === "23505") documentsError(`You already have a folder called "${name}"`);
    documentsError(error.message);
  }

  revalidatePath("/dashboard/documents");
}

export async function deleteFolder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));
  // Documents inside are never deleted - folder_id just falls back to null
  // (ON DELETE SET NULL) and they reappear under "Unfiled".
  const { error } = await supabase.from("document_folders").delete().eq("id", id).eq("profile_id", user.id);
  if (error) documentsError(error.message);

  revalidatePath("/dashboard/documents");
}

export async function moveDocumentToFolder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const documentId = Number(formData.get("document_id"));
  const rawFolderId = Number(formData.get("folder_id"));
  const folderId = Number.isFinite(rawFolderId) && rawFolderId > 0 ? rawFolderId : null;

  if (folderId) {
    const { data: ownedFolder } = await supabase
      .from("document_folders")
      .select("id")
      .eq("id", folderId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!ownedFolder) documentsError("That folder doesn't exist");
  }

  // RLS ("own documents only") already scopes this update to the caller's
  // own documents; the .eq("profile_id", ...) below is belt-and-braces.
  const { error } = await supabase
    .from("documents")
    .update({ folder_id: folderId })
    .eq("id", documentId)
    .eq("profile_id", user.id);
  if (error) documentsError(error.message);

  revalidatePath("/dashboard/documents");
}

// "Is there a way of rating the documents? So that people can see what
// others have found to be best?" - one star rating per person per shared
// document; re-rating just upserts over your own prior rating.
export async function rateDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const documentId = Number(formData.get("document_id"));
  const rating = Number(formData.get("rating"));
  if (rating < 1 || rating > 5) documentsError("Rating must be between 1 and 5");

  const { error } = await supabase
    .from("document_ratings")
    .upsert({ document_id: documentId, rated_by: user.id, rating }, { onConflict: "document_id,rated_by" });
  if (error) documentsError(error.message);

  revalidatePath("/dashboard/documents");
}
