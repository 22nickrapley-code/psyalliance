import { createClient } from "@/lib/supabase/server";

// Canonical Practice Library governance service layer (Addendum A6). The
// actual publish-blocking rule lives in the database itself
// (enforce_document_publish_requirements(), migration 0049) so it can
// never be bypassed by a code path that forgets to check - these
// functions are a thin, friendlier wrapper around that.

export type ReviewerRole = "clinical" | "legal_regulatory" | "privacy_security" | "prescribing";

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

// A resource owner's credentials never substitute for a required review
// (Addendum A6) - this only ever records the reviewer's own name against
// their own role; nothing here lets a document's owner mark their own
// resource approved unless they're also independently a reviewer for that
// role, same as anyone else.
export async function submitDocumentReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewerProfileId: string,
  documentId: number,
  documentVersion: number,
  reviewerRole: ReviewerRole,
  approved: boolean,
  notes?: string
) {
  const { error } = await supabase.from("document_reviews").upsert(
    {
      document_id: documentId,
      document_version: documentVersion,
      reviewer_role: reviewerRole,
      reviewer_profile_id: reviewerProfileId,
      approved,
      notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "document_id,document_version,reviewer_role" }
  );
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
