import { createClient } from "@/lib/supabase/server";
import { submitDocumentReviewAction } from "../admin/library/actions";

type ReviewRole = "clinical" | "legal_regulatory" | "privacy_security" | "prescribing";
const labels: Record<ReviewRole, string> = {
  clinical: "Clinical", legal_regulatory: "Legal and regulatory",
  privacy_security: "Privacy and security", prescribing: "Prescribing",
};

export default async function ResourceReviewPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: roles }, { data: documents }, { data: myReviews }] = await Promise.all([
    supabase.from("document_reviewer_authorizations").select("reviewer_role,qualification_evidence").eq("reviewer_profile_id", user!.id),
    supabase.from("documents").select("id,title,version,review_status,required_reviewer_roles,resource_owner_id,uploaded_by,applicability,customization_warning,sources,next_review_date")
      .eq("owner_scope", "world").in("review_status", ["needs_review", "in_review"]),
    supabase.from("document_reviews").select("document_id,document_version,reviewer_role,approved")
      .eq("reviewer_profile_id", user!.id),
  ]);
  const allowed = new Set((roles || []).map((role) => role.reviewer_role));
  const work = (documents || []).flatMap((document) =>
    ((document.required_reviewer_roles || []) as ReviewRole[])
      .filter((role) => allowed.has(role) && document.resource_owner_id !== user!.id && document.uploaded_by !== user!.id)
      .map((role) => ({ document, role, previous: myReviews?.find((r) => r.document_id === document.id && r.document_version === document.version && r.reviewer_role === role) }))
  );
  return <div className="review-page"><span className="section-kicker">Practice Library / Independent review</span><h1>Resource review</h1>
    <p className="muted">Review the complete current file, its sources and its intended use before recording a decision. Your decision is tied to this exact version.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!allowed.size && <div className="library-empty"><h2>Reviewer access is required</h2><p>A Library administrator must document your qualifications and authorize a review role before resources appear here.</p><a href="/dashboard/documents">Back to the Library →</a></div>}
    {!!allowed.size && !work.length && <div className="library-empty"><h2>Your review queue is clear</h2><p>There are no eligible resources waiting for your authorized roles.</p></div>}
    <div className="review-grid">{work.map(({ document, role, previous }) => <article key={`${document.id}-${role}`} className="card">
      <span className="section-kicker">{labels[role]} review · Version {document.version}</span><h2>{document.title}</h2>
      <p>{document.applicability || "Scope has not been recorded."}</p>
      <dl><dt>Sources</dt><dd>{document.sources || "Not recorded"}</dd><dt>Customization</dt><dd>{document.customization_warning || "Not recorded"}</dd><dt>Next review</dt><dd>{document.next_review_date || "Not scheduled"}</dd></dl>
      <a href={`/dashboard/documents/${document.id}/open`} target="_blank" rel="noreferrer" className="btn secondary">Open current file ↗</a>
      <form action={submitDocumentReviewAction}><input type="hidden" name="document_id" value={document.id} /><input type="hidden" name="document_version" value={document.version} /><input type="hidden" name="reviewer_role" value={role} />
        <div className="field"><label htmlFor={`review-notes-${document.id}-${role}`}>Review notes</label><textarea id={`review-notes-${document.id}-${role}`} name="notes" rows={3} placeholder="Record your rationale or required changes" required /></div>
        <div className="review-buttons"><button type="submit" name="approved" value="true">Approve this version</button><button type="submit" name="approved" value="false" className="secondary">Request changes</button></div>
      </form>{previous && <p className="muted">Your current decision: {previous.approved ? "approved" : "changes requested"}</p>}
    </article>)}</div>
  </div>;
}
