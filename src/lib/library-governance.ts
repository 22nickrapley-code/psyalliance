import { createClient } from "@/lib/supabase/server";

// Canonical Practice Library governance service layer (Addendum A6). The
// actual publish-blocking rule lives in the database itself
// (enforce_document_publish_requirements(), migration 0049) so it can
// never be bypassed by a code path that forgets to check - these
// functions are a thin, friendlier wrapper around that.

export type ReviewerRole = "clinical" | "legal_regulatory" | "privacy_security" | "prescribing";

export const REVIEWER_ROLE_LABELS: Record<ReviewerRole, string> = {
  clinical: "Clinical",
  legal_regulatory: "Legal / regulatory",
  privacy_security: "Privacy / security",
  prescribing: "Prescribing",
};

export async function setDocumentGovernance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: number,
  opts: {
    resourceOwnerId?: string;
    sources?: string;
    applicability?: string;
    customizationWarning?: string;
    nextReviewDate?: string;
    requiredReviewerRoles?: ReviewerRole[];
  }
) {
  const { error } = await supabase
    .from("documents")
    .update({
      resource_owner_id: opts.resourceOwnerId ?? null,
      sources: opts.sources ?? null,
      applicability: opts.applicability ?? null,
      customization_warning: opts.customizationWarning ?? null,
      next_review_date: opts.nextReviewDate ?? null,
      required_reviewer_roles: opts.requiredReviewerRoles ?? [],
    })
    .eq("id", documentId);
  return { error: error?.message ?? null };
}

// Records the signed-in reviewer's verdict on the current version. The
// database decides whether it counts (guard_document_review, migration
// 0081): an active appointment for the role, the current version, not the
// author or owner, and a different person for each role. Changing your
// mind updates your own review rather than adding a second one.
export async function submitDocumentReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewerProfileId: string,
  documentId: number,
  documentVersion: number,
  reviewerRole: ReviewerRole,
  approved: boolean,
  notes?: string
) {
  const { data: existing } = await supabase
    .from("document_reviews")
    .select("id, reviewer_profile_id")
    .eq("document_id", documentId)
    .eq("document_version", documentVersion)
    .eq("reviewer_role", reviewerRole)
    .is("invalidated_at", null)
    .maybeSingle();
  if (existing && existing.reviewer_profile_id !== reviewerProfileId) {
    return { error: "Another reviewer has already reviewed this version for that role." };
  }
  const row = {
    document_id: documentId,
    document_version: documentVersion,
    reviewer_role: reviewerRole,
    reviewer_profile_id: reviewerProfileId,
    approved,
    notes: notes ?? null,
    reviewed_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from("document_reviews").update(row).eq("id", existing.id)
    : await supabase.from("document_reviews").insert(row);
  return { error: error?.message ?? null };
}

// Attempts to move a resource to Published. If a required reviewer role
// hasn't approved yet, the database trigger raises and this surfaces that
// as a plain error message instead of a stack trace - the caller doesn't
// need to duplicate the requirement-checking logic itself.
export async function publishDocument(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: number,
  publishDate?: string
) {
  const { error } = await supabase
    .from("documents")
    .update({
      review_status: "published",
      review_date: new Date().toISOString().slice(0, 10),
      publish_date: publishDate ?? new Date().toISOString().slice(0, 10),
    })
    .eq("id", documentId);
  if (error) {
    // Postgres wraps the RAISE EXCEPTION message from
    // enforce_document_publish_requirements() in error.message as-is.
    return { error: error.message };
  }
  return { error: null };
}
