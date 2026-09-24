"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitDocumentReview, type ReviewerRole } from "@/lib/library-governance";

// An appointed reviewer records their verdict on the current version of a
// Practice Library resource. Who may review what is decided by the
// database (guard_document_review, migration 0081), not here.
export async function recordReviewAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const documentId = Number(formData.get("document_id"));
  const version = Number(formData.get("document_version"));
  const role = String(formData.get("reviewer_role") || "") as ReviewerRole;
  const approved = formData.get("verdict") === "approve";
  const notes = String(formData.get("notes") || "").trim();
  const back = (msg: string, key = "error") => redirect(`/dashboard/documents/review?${key}=${encodeURIComponent(msg)}#doc-${documentId}`);
  if (notes.length < 10) back("Say briefly what you checked, or what needs to change.");

  const { error } = await submitDocumentReview(supabase, user.id, documentId, version, role, approved, notes);
  if (error) back(error);
  revalidatePath("/dashboard/documents/review");
  revalidatePath("/dashboard/admin/library");
  back(approved ? "Approval recorded." : "Change request recorded.", "saved");
}
