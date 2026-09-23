"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setDocumentGovernance, submitDocumentReview, publishDocument, type ReviewerRole } from "@/lib/library-governance";

// Addendum A6's Practice Library governance workflow (required reviewer
// roles -> per-role approval -> publish, enforced by the database trigger
// enforce_document_publish_requirements()) had a full service layer since
// Phase 4 batch 5 with no UI calling any of it. This is that UI's actions -
// thin wrappers, same shape as every other admin actions file.
//
// Kept admin-only for this first pass even though the RLS on
// document_reviews itself allows any signed-in member to record a review
// under their own profile_id (Addendum A6 leaves the exact reviewer
// taxonomy/permissioning to be settled operationally, not architecturally).
// Opening review submission to non-admin members with the right role is a
// natural next step, not done here.

const ALL_ROLES: ReviewerRole[] = ["clinical", "legal_regulatory", "privacy_security", "prescribing"];

function libraryError(message: string): never {
  redirect(`/dashboard/admin/library?error=${encodeURIComponent(message)}`);
}

export async function setRequiredReviewerRolesAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const requiredReviewerRoles = ALL_ROLES.filter((role) => formData.get(`role_${role}`) === "on");

  const { error } = await setDocumentGovernance(supabase, documentId, { requiredReviewerRoles });
  if (error) libraryError(error);

  revalidatePath("/dashboard/admin/library");
  redirect("/dashboard/admin/library");
}

export async function submitDocumentReviewAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const documentVersion = Number(formData.get("document_version"));
  const reviewerRole = String(formData.get("reviewer_role") || "") as ReviewerRole;
  const approved = String(formData.get("approved") || "") === "true";
  const notes = String(formData.get("notes") || "") || undefined;
  if (!reviewerRole) libraryError("Choose which role this review is for");

  const { error } = await submitDocumentReview(supabase, user.id, documentId, documentVersion, reviewerRole, approved, notes);
  if (error) libraryError(error);

  revalidatePath("/dashboard/admin/library");
  redirect("/dashboard/admin/library");
}

export async function publishDocumentAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const { error } = await publishDocument(supabase, documentId);
  if (error) libraryError(error);

  revalidatePath("/dashboard/admin/library");
  revalidatePath("/dashboard/documents");
  redirect("/dashboard/admin/library");
}

export async function unpublishDocumentAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  // Sends it back to needs_review rather than draft - "was published, now
  // pulled back for a reason" is a different state from "never reviewed",
  // and the trigger only blocks the draft/needs_review -> published edge,
  // not this one.
  const { error } = await supabase.from("documents").update({ review_status: "needs_review" }).eq("id", documentId);
  if (error) libraryError(error.message);

  revalidatePath("/dashboard/admin/library");
  revalidatePath("/dashboard/documents");
  redirect("/dashboard/admin/library");
}
