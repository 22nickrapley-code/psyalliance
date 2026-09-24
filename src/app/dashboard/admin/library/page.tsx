import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import type { ReviewerRole } from "@/lib/library-governance";
import {
  setRequiredReviewerRolesAction,
  submitDocumentReviewAction,
  publishDocumentAction,
  unpublishDocumentAction,
  seedStarterLibraryAction,
  setLibraryMetadataAction,
  authorizeLibraryReviewerAction,
  revokeLibraryReviewerAction,
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
export default async function AdminLibraryPage(props: { searchParams: Promise<{ error?: string; seeded?: string; skipped?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error, seeded, skipped } = await props.searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: documents }, { data: reviews }, { data: reviewerAuthorizations }, { data: memberChoices }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, version, review_status, required_reviewer_roles, created_at, resource_owner_id, uploaded_by, sources, applicability, customization_warning, next_review_date, uploader:uploaded_by(full_name)")
      .eq("owner_scope", "world")
      .order("created_at", { ascending: false }),
    supabase
      .from("document_reviews")
      .select("document_id, document_version, reviewer_profile_id, reviewer_role, approved, notes, reviewed_at, reviewer:reviewer_profile_id(full_name)"),
    supabase.from("document_reviewer_authorizations")
      .select("reviewer_profile_id, reviewer_role, qualification_evidence, reviewer:reviewer_profile_id(full_name)"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  const authorized = new Set((reviewerAuthorizations || []).map((a) => `${a.reviewer_profile_id}:${a.reviewer_role}`));

  const reviewsByDoc = new Map<number, any[]>();
  for (const r of reviews || []) {
    if (!reviewsByDoc.has(r.document_id)) reviewsByDoc.set(r.document_id, []);
    reviewsByDoc.get(r.document_id)!.push(r);
  }

  const needsAttention = (documents || []).filter((d: any) => d.review_status !== "published");
  const published = (documents || []).filter((d: any) => d.review_status === "published");
  const starterSetCount = (documents || []).filter((d: any) => /^PA-\d\d: /.test(d.title)).length;

  function renderDocRow(d: any) {
    const requiredRoles = (d.required_reviewer_roles || []) as ReviewerRole[];
    const reviewsForCurrentVersion = (reviewsByDoc.get(d.id) || []).filter((r) => r.document_version === d.version);
    const approvedRoles = new Set(reviewsForCurrentVersion.filter((r) => r.approved &&
      authorized.has(`${r.reviewer_profile_id}:${r.reviewer_role}`) &&
      r.reviewer_profile_id !== d.resource_owner_id && r.reviewer_profile_id !== d.uploaded_by
    ).map((r) => r.reviewer_role));
    const missingRoles = requiredRoles.filter((role) => !approvedRoles.has(role));
    const metadataComplete = !!(d.resource_owner_id && d.sources && d.applicability && d.customization_warning && d.next_review_date && requiredRoles.length);

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

        <details style={{ marginTop: "0.4rem" }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>
            Resource metadata {metadataComplete ? "complete" : "needs attention"}
          </summary>
          <form action={setLibraryMetadataAction} style={{ marginTop: "0.7rem" }}>
            <input type="hidden" name="document_id" value={d.id} />
            <div className="field"><label>Resource owner</label><select name="resource_owner_id" defaultValue={d.resource_owner_id || ""} required>
              <option value="">Choose an owner</option>
              {(memberChoices || []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select></div>
            <div className="field"><label>Sources</label><textarea name="sources" defaultValue={d.sources || ""} required /></div>
            <div className="field"><label>Applicability and jurisdictions</label><textarea name="applicability" defaultValue={d.applicability || ""} required /></div>
            <div className="field"><label>Customization warning</label><textarea name="customization_warning" defaultValue={d.customization_warning || ""} required /></div>
            <div className="field"><label>Next review date</label><input name="next_review_date" type="date" defaultValue={d.next_review_date || ""} required /></div>
            <button type="submit" className="secondary">Save metadata</button>
          </form>
        </details>

        {requiredRoles.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>Reviews for v{d.version}:</p>
            {ALL_ROLES.filter((role) => requiredRoles.includes(role)).map((role) => {
              const existing = reviewsForCurrentVersion.find((r) => r.reviewer_role === role &&
                authorized.has(`${r.reviewer_profile_id}:${r.reviewer_role}`) &&
                r.reviewer_profile_id !== d.resource_owner_id && r.reviewer_profile_id !== d.uploaded_by);
              const canReview = authorized.has(`${user?.id}:${role}`) && user?.id !== d.resource_owner_id && user?.id !== d.uploaded_by;
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
                  {canReview && <span className="person-row-actions">
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
                  </span>}
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
              <button type="submit" disabled={missingRoles.length > 0 || !metadataComplete} title={missingRoles.length > 0 ? `Still missing: ${missingRoles.map((r) => ROLE_LABELS[r]).join(", ")}` : undefined}>
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
        A shared resource needs documented independent subject-matter reviewers for each required
        role and complete version metadata before publication. Previous self approvals remain in
        the audit trail but cannot publish a resource.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {(seeded || skipped) && (
        <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
          Seeded {seeded} document{seeded === "1" ? "" : "s"}
          {skipped && skipped !== "0" ? ` (${skipped} already present, skipped)` : ""} into Needs attention below.
        </div>
      )}

      <div className="card">
        <h2>Authorized subject-matter reviewers</h2>
        <p className="muted">Record the qualification behind each role. Admin status alone does not qualify a reviewer.</p>
        <form action={authorizeLibraryReviewerAction}>
          <div className="field-row">
            <div className="field"><label>Clinician or reviewer</label><select name="reviewer_profile_id" required><option value="">Choose reviewer</option>
              {(memberChoices || []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select></div>
            <div className="field"><label>Qualified role</label><select name="reviewer_role" required><option value="">Choose role</option>
              {ALL_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select></div>
          </div>
          <div className="field"><label>Qualification evidence</label><textarea name="qualification_evidence" minLength={20} required placeholder="Relevant professional qualification or subject-matter experience and how it was checked" /></div>
          <button type="submit">Authorize reviewer</button>
        </form>
        {(reviewerAuthorizations || []).map((a) => <div key={`${a.reviewer_profile_id}:${a.reviewer_role}`} className="person-row">
          <span className="person-row-info"><strong>{(a.reviewer as any)?.full_name || "Reviewer"}</strong> · {ROLE_LABELS[a.reviewer_role as ReviewerRole] || a.reviewer_role}<br /><small>{a.qualification_evidence}</small></span>
          <form action={revokeLibraryReviewerAction}><input type="hidden" name="reviewer_profile_id" value={a.reviewer_profile_id} /><input type="hidden" name="reviewer_role" value={a.reviewer_role} /><button type="submit" className="secondary">Revoke</button></form>
        </div>)}
      </div>

      {starterSetCount < 20 && (
        <div className="card">
          <h2>Starter library (PA-01&ndash;20)</h2>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            The 20 practice-management/compliance templates Nick provided ({starterSetCount} of 20 already here).
            Uploads each one to the shared library and lands it in Needs attention below - nothing here publishes
            anything on its own. Only works running locally (<code>npm run dev</code>), not on the deployed site,
            since it reads the files straight off disk under this admin's own signed-in session - no service key
            or credential needed.
          </p>
          <form action={seedStarterLibraryAction}>
            <button type="submit">Seed starter library</button>
          </form>
        </div>
      )}

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
