import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REVIEWER_ROLE_LABELS, type ReviewerRole } from "@/lib/library-governance";
import { PageHead, Banner, Status, Empty } from "../../_components/ui";
import { recordReviewAction } from "./actions";

// The reviewer's desk: resources that need the roles this member is
// appointed to, current version only. Each review is of the whole
// resource, including the PDF.
export default async function LibraryReviewPage(props: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: appointments } = await supabase
    .from("library_reviewers")
    .select("role, qualification")
    .eq("profile_id", user.id)
    .eq("active", true);
  const myRoles = (appointments || []).map((a: any) => a.role as ReviewerRole);

  if (myRoles.length === 0) {
    return (
      <>
        <PageHead eyebrow="Practice Library" title="Resource review" />
        <Empty symbol={"▤"} title="You aren't appointed as a reviewer." body="Admins appoint reviewers for clinical, prescribing, legal and privacy review. If you've been asked to review, the appointment will show here." />
      </>
    );
  }

  const [{ data: docs }, { data: reviews }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, library_code, title, version, review_status, required_reviewer_roles, storage_path, summary, uploaded_by, resource_owner_id")
      .eq("owner_scope", "world")
      .neq("review_status", "draft")
      .overlaps("required_reviewer_roles", myRoles)
      .order("library_code"),
    supabase
      .from("document_reviews")
      .select("document_id, document_version, reviewer_role, reviewer_profile_id, approved, notes")
      .is("invalidated_at", null),
  ]);

  const urls = new Map<number, string>();
  await Promise.all(
    (docs || []).map(async (d: any) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60 * 60);
      if (data?.signedUrl) urls.set(d.id, data.signedUrl);
    })
  );

  return (
    <>
      <PageHead
        eyebrow="Practice Library"
        title="Resource review"
        lead={`You review as: ${myRoles.map((r) => REVIEWER_ROLE_LABELS[r]).join(", ")}. Read the whole PDF, not just the summary. An approval covers this exact version.`}
      />
      <Banner error={sp.error} ok={sp.saved} />
      <section className="card">
        {(docs || []).map((d: any) => {
          const current = (reviews || []).filter((r: any) => r.document_id === d.id && r.document_version === d.version);
          const rolesForMe = myRoles.filter((r) => (d.required_reviewer_roles || []).includes(r));
          const conflict = [d.uploaded_by, d.resource_owner_id].includes(user.id);
          return (
            <div key={d.id} id={`doc-${d.id}`} className="item">
              <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                <span>
                  <strong>{d.library_code} &middot; {String(d.title).replace(/^PA-\d\d: /, "")}</strong>
                  <p>Version {d.version}{d.summary ? ` · ${d.summary}` : ""}</p>
                </span>
                {urls.get(d.id) ? <a className="btn secondary small-btn" href={urls.get(d.id)} target="_blank" rel="noopener noreferrer">Open the PDF</a> : null}
              </div>
              {rolesForMe.map((role) => {
                const r = current.find((x: any) => x.reviewer_role === role);
                const mine = r && r.reviewer_profile_id === user.id;
                if (r && !mine) {
                  return (
                    <p key={role} className="small" style={{ marginTop: 8 }}>
                      {REVIEWER_ROLE_LABELS[role]}: already reviewed by another reviewer.
                    </p>
                  );
                }
                if (conflict) {
                  return <p key={role} className="small" style={{ marginTop: 8 }}>You wrote or own this resource, so someone else must review it.</p>;
                }
                return (
                  <form key={role} action={recordReviewAction} className="fields" style={{ marginTop: 10 }}>
                    <input type="hidden" name="document_id" value={d.id} />
                    <input type="hidden" name="document_version" value={d.version} />
                    <input type="hidden" name="reviewer_role" value={role} />
                    <div className="row between">
                      <b className="small">{REVIEWER_ROLE_LABELS[role]} review</b>
                      {mine ? <Status tone={r.approved ? "" : "warn"}>{r.approved ? "You approved" : "You asked for changes"}</Status> : <Status tone="neutral">Not reviewed</Status>}
                    </div>
                    <label className="field">
                      What you checked, or what needs to change
                      <textarea name="notes" rows={3} defaultValue={mine ? r.notes || "" : ""} required minLength={10} />
                    </label>
                    <div className="row" style={{ gap: 8 }}>
                      <button type="submit" name="verdict" value="approve" className="btn small-btn">Approve version {d.version}</button>
                      <button type="submit" name="verdict" value="changes" className="btn secondary small-btn">Request changes</button>
                    </div>
                  </form>
                );
              })}
            </div>
          );
        })}
        {(docs || []).length === 0 && <p className="small">Nothing needs your review right now.</p>}
      </section>
    </>
  );
}
