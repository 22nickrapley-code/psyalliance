import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import type { ReviewerRole } from "@/lib/library-governance";
import {
  setRequiredReviewerRolesAction,
  submitDocumentReviewAction,
  publishDocumentAction,
  unpublishDocumentAction,
} from "./actions";

const ROLE_LABELS: Record<ReviewerRole, string> = {
  clinical: "Clinical",
  legal_regulatory: "Legal / regulatory",
  privacy_security: "Privacy / security",
  prescribing: "Prescribing",
};
const ALL_ROLES = Object.keys(ROLE_LABELS) as ReviewerRole[];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  in_review: "In review",
  published: "Published",
};

// Addendum A6's Practice Library governance workflow - required reviewer
// roles per resource, one approval per role per version, a database
// trigger that blocks Published until every required role has signed off.
// Phase 4 batch 5 built the whole thing (src/lib/library-governance.ts,
// the enforce_document_publish_requirements() trigger) with no UI; this
// page is that UI's first pass. See documents/page.tsx for the matching
// fix on the member-facing side - the Shared Library now only shows a
// document once it's Published or was never gated (no required roles set).
export default async function AdminLibraryPage(props: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error } = await props.searchParams;

  const [{ data: documents }, { data: reviews }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, version, review_status, required_reviewer_roles, created_at, uploader:uploaded_by(full_name)")
      .eq("owner_scope", "world")
      .order("created_at", { ascending: false }),
    supabase
      .from("document_reviews")
      .select("document_id, document_version, reviewer_role, approved, notes, reviewed_at, reviewer:reviewer_profile_id(full_name)"),
  ]);

  const reviewsByDoc = new Map<number, any[]>();
  for (const r of reviews || []) {
    if (!reviewsByDoc.has(r.document_id)) reviewsByDoc.set(r.document_id, []);
    reviewsByDoc.get(r.document_id)!.push(r);
  }

  const needsAttention = (documents || []).filter((d: any) => d.review_status !== "published");
  const published = (documents || []).filter((d: any) => d.review_status === "published");

  function renderDocRow(d: any) {
    const requiredRoles = (d.required_reviewer_roles || []) as ReviewerRole[];
    const reviewsForCurrentVersion = (reviewsByDoc.get(d.id) || []).filter((r) => r.document_version === d.version);
    const approvedRoles = new Set(reviewsForCurrentVersion.filter((r) => r.approved).map((r) => r.reviewer_role));
    const missingRoles = requiredRoles.filter((role) => !approvedRoles.has(role));

    return (
      <div key={d.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.9rem", marginBottom: "0.9rem" }}>
        <div>
          <strong>{d.title}</strong> <span className="tag">v{d.version}</span>{" "}
          <span className="tag">{STATUS_LABELS[d.review_status] || d.review_status}</span>
          {d.uploader?.full_name && <span className="muted" style={{ marginLeft: "0.4rem", fontSize: "0.85rem" }}>from {d.uploader.full_name}</span>}
        </div>

        <details style={{ marginTop: "0.4rem" }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>
            Required reviewer roles: {requiredRoles.length > 0 ? requiredRoles.map((r) => ROLE_LABELS[r]).join(", ") : "none set"}
          </summary>
          <form action={setRequiredReviewerRolesAction} style={{ marginTop: "0.4rem" }}>
            <input type="hidden" name="document_id" value={d.id} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "0.4rem" }}>
              {ALL_ROLES.map((role) => (
                <label key={role} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 400, fontSize: "0.85rem" }}>
                  <input type="checkbox" name={`role_${role}`} defaultChecked={requiredRoles.includes(role)} />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            <button type="submit" className="secondary">Save required roles</button>
          </form>
        </details>

        {requiredRoles.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>Reviews for v{d.version}:</p>
            {ALL_ROLES.filter((role) => requiredRoles.includes(role)).map((role) => {
              const existing = reviewsForCurrentVersion.find((r) => r.reviewer_role === role);
              return (
                <div key={role} className="person-row">
                  <span className="person-row-info">
                    {ROLE_LABELS[role]}:{" "}
                    {existing ? (
                      <span className={existing.approved ? "tag gold" : "tag"}>
                        {existing.approved ? "Approved" : "Changes requested"} by {existing.reviewer?.full_name || "someone"}
                      </span>
                    ) : (
                      <span className="muted">Not reviewed yet</span>
                    )}
                  </span>
                  <span className="person-row-actions">
                    <form action={submitDocumentReviewAction}>
                      <input type="hidden" name="document_id" value={d.id} />
                      <input type="hidden" name="document_version" value={d.version} />
                      <input type="hidden" name="reviewer_role" value={role} />
                      <input type="hidden" name="approved" value="true" />
                      <button type="submit" className="secondary">Approve</button>
                    </form>
                    <form action={submitDocumentReviewAction}>
                      <input type="hidden" name="document_id" value={d.id} />
                      <input type="hidden" name="document_version" value={d.version} />
                      <input type="hidden" name="reviewer_role" value={role} />
                      <input type="hidden" name="approved" value="false" />
                      <button type="submit" className="secondary">Request changes</button>
                    </form>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "0.5rem" }}>
          {d.review_status === "published" ? (
            <form action={unpublishDocumentAction} style={{ display: "inline" }}>
              <input type="hidden" name="document_id" value={d.id} />
              <button type="submit" className="secondary">Pull back for review</button>
            </form>
          ) : (
            <form action={publishDocumentAction} style={{ display: "inline" }}>
              <input type="hidden" name="document_id" value={d.id} />
              <button type="submit" disabled={missingRoles.length > 0} title={missingRoles.length > 0 ? `Still missing: ${missingRoles.map((r) => ROLE_LABELS[r]).join(", ")}` : undefined}>
                Publish
              </button>
            </form>
          )}
          {missingRoles.length > 0 && d.review_status !== "published" && (
            <span className="muted" style={{ marginLeft: "0.6rem", fontSize: "0.82rem" }}>
              Missing approval: {missingRoles.map((r) => ROLE_LABELS[r]).join(", ")}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Practice Library governance</h1>
      <p className="muted">
        Addendum A6's rule: a shared resource cannot reach Published until every reviewer role
        you require for it has approved that exact version - the database enforces this, this
        page just makes it usable. A document with no required roles set is treated as ungated
        and stays visible in the Shared Library as before.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Needs attention ({needsAttention.length})</h2>
        {needsAttention.map(renderDocRow)}
        {needsAttention.length === 0 && <p className="muted">Nothing waiting on governance right now.</p>}
      </div>

      <div className="card">
        <h2>Published ({published.length})</h2>
        {published.map(renderDocRow)}
        {published.length === 0 && <p className="muted">Nothing published yet.</p>}
      </div>
    </div>
  );
}
