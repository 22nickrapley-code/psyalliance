import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { REVIEWER_ROLE_LABELS as ROLE_LABELS, type ReviewerRole } from "@/lib/library-governance";
import { PageHead, Banner, Status } from "../../_components/ui";
import {
  setRequiredReviewerRolesAction,
  publishDocumentAction,
  setResourceVisibilityAction,
  seedStarterLibraryAction,
  appointReviewerAction,
  setReviewerActiveAction,
} from "./actions";

const ALL_ROLES = Object.keys(ROLE_LABELS) as ReviewerRole[];

const STATUS: Record<string, [string, "" | "warn" | "neutral" | "danger"]> = {
  published: ["Published, reviewed", ""],
  provisional: ["Provisional, unreviewed", "warn"],
  in_review: ["Hidden, in review", "neutral"],
  needs_review: ["Hidden", "neutral"],
  draft: ["Draft", "neutral"],
};

// Practice Library governance. Admins decide which reviewer roles each
// resource needs and who is appointed to each role. The appointed
// reviewers record their own reviews at /dashboard/documents/review; the
// database only counts independent approvals of the current version
// (migration 0081), and only then can a resource be published.
export default async function AdminLibraryPage(props: { searchParams: Promise<{ error?: string; seeded?: string; skipped?: string; appointed?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error, seeded, skipped, appointed } = await props.searchParams;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: documents }, { data: reviews }, { data: reviewers }, { data: people }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, library_code, title, version, review_status, required_reviewer_roles, storage_path")
      .eq("owner_scope", "world")
      .order("library_code", { ascending: true }),
    supabase
      .from("document_reviews")
      .select("document_id, document_version, reviewer_role, approved, notes, reviewed_at, reviewer:reviewer_profile_id(full_name, credential_prefix)")
      .is("invalidated_at", null),
    supabase
      .from("library_reviewers")
      .select("id, role, qualification, active, appointed_at, person:profile_id(full_name, credential_prefix)")
      .order("appointed_at", { ascending: true }),
    supabase
      .rpc("admin_profiles")
      .select("id, full_name, credential_prefix, qualification_level, verification_status, is_demo, account_status")
      .eq("is_demo", false)
      .eq("account_status", "active")
      .order("full_name"),
  ]);

  const reviewsByDoc = new Map<number, any[]>();
  for (const r of reviews || []) {
    if (!reviewsByDoc.has(r.document_id)) reviewsByDoc.set(r.document_id, []);
    reviewsByDoc.get(r.document_id)!.push(r);
  }
  const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "Someone");
  const counts = { published: 0, provisional: 0, hidden: 0 };
  for (const d of documents || []) {
    if (d.review_status === "published") counts.published++;
    else if (d.review_status === "provisional") counts.provisional++;
    else counts.hidden++;
  }
  const activeByRole = new Map<string, number>();
  for (const r of reviewers || []) if (r.active) activeByRole.set(r.role, (activeByRole.get(r.role) || 0) + 1);
  const starterSetCount = (documents || []).filter((d: any) => /^PA-\d\d$/.test(d.library_code || "")).length;

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Library governance"
        lead="A resource is published only when every role it needs has approved that exact version, each by a different, independent reviewer."
      />
      <Banner
        error={error}
        ok={appointed ? "Reviewer appointed." : seeded ? `Seeded ${seeded} resource${seeded === "1" ? "" : "s"}${skipped && skipped !== "0" ? `, ${skipped} already present` : ""}.` : undefined}
      />

      <div className="three-grid" style={{ marginBottom: 20 }}>
        <div className="quiet-panel">
          <div className="eyebrow">Published</div>
          <div className="metric" style={{ marginTop: 8 }}>{counts.published}</div>
          <p className="micro-note" style={{ margin: "6px 0 0" }}>Independently reviewed</p>
        </div>
        <div className="quiet-panel">
          <div className="eyebrow">Provisional</div>
          <div className="metric" style={{ marginTop: 8 }}>{counts.provisional}</div>
          <p className="micro-note" style={{ margin: "6px 0 0" }}>Visible, labelled as not yet reviewed</p>
        </div>
        <div className="quiet-panel">
          <div className="eyebrow">Hidden</div>
          <div className="metric" style={{ marginTop: 8 }}>{counts.hidden}</div>
          <p className="micro-note" style={{ margin: "6px 0 0" }}>Members can&rsquo;t see these</p>
        </div>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-title"><h3>Resources</h3><span className="micro-note">Current version only</span></div>
          {(documents || []).map((d: any) => {
            const required = (d.required_reviewer_roles || []) as ReviewerRole[];
            const current = (reviewsByDoc.get(d.id) || []).filter((r) => r.document_version === d.version);
            const approvedRoles = new Set(current.filter((r) => r.approved).map((r) => r.reviewer_role));
            const missing = required.filter((r) => !approvedRoles.has(r));
            const [label, tone] = STATUS[d.review_status] || [d.review_status, "neutral"];
            const hidden = ["needs_review", "draft", "in_review"].includes(d.review_status);
            return (
              <div key={d.id} className="item">
                <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <span>
                    <strong>{d.library_code ? `${d.library_code} · ` : ""}{String(d.title).replace(/^PA-\d\d: /, "")}</strong>
                    <p>Version {d.version}</p>
                  </span>
                  <Status tone={tone}>{label}</Status>
                </div>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {required.length === 0 ? <span className="micro-note">No reviewer roles set</span> : null}
                  {required.map((role) => {
                    const r = current.find((x) => x.reviewer_role === role);
                    return (
                      <span
                        key={role}
                        className="chip"
                        title={r ? `${r.approved ? "Approved" : "Changes requested"} by ${nameOf(r.reviewer)}${r.notes ? `: ${r.notes}` : ""}` : "Not reviewed yet"}
                      >
                        {r ? (r.approved ? "✓ " : "✕ ") : "○ "}
                        {ROLE_LABELS[role]}
                        {r ? ` · ${nameOf(r.reviewer)}` : ""}
                      </span>
                    );
                  })}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  {d.review_status !== "published" && (
                    <form action={publishDocumentAction} className="inline">
                      <input type="hidden" name="document_id" value={d.id} />
                      <button type="submit" className="btn small-btn" disabled={required.length === 0 || missing.length > 0}>
                        Publish
                      </button>
                    </form>
                  )}
                  <form action={setResourceVisibilityAction} className="inline">
                    <input type="hidden" name="document_id" value={d.id} />
                    <input type="hidden" name="status" value={hidden ? "provisional" : "needs_review"} />
                    <button type="submit" className={hidden ? "btn secondary small-btn" : "btn ghost small-btn"}>
                      {hidden ? "Show as provisional" : "Hide from members"}
                    </button>
                  </form>
                  <details>
                    <summary className="small" style={{ cursor: "pointer", paddingTop: 6 }}>Roles needed</summary>
                    <form action={setRequiredReviewerRolesAction} style={{ marginTop: 8 }}>
                      <input type="hidden" name="document_id" value={d.id} />
                      <div className="chip-row">
                        {ALL_ROLES.map((role) => (
                          <label key={role} className="checkline">
                            <input type="checkbox" name={`role_${role}`} defaultChecked={required.includes(role)} /> {ROLE_LABELS[role]}
                          </label>
                        ))}
                      </div>
                      <button type="submit" className="btn secondary small-btn" style={{ marginTop: 8 }}>Save roles</button>
                    </form>
                  </details>
                </div>
                {missing.length > 0 && d.review_status !== "published" && (
                  <p className="micro-note" style={{ marginTop: 6 }}>
                    Needs: {missing.map((r) => ROLE_LABELS[r]).join(", ")}
                    {missing.some((r) => !activeByRole.get(r)) ? ". Appoint a reviewer for each of these roles first." : "."}
                  </p>
                )}
              </div>
            );
          })}
          {(documents || []).length === 0 && <p className="small">No shared resources yet.</p>}
        </section>

        <aside className="stack">
          <section className="card">
            <div className="card-title"><h3>Reviewers</h3></div>
            {(reviewers || []).length === 0 ? (
              <div className="tone-panel">
                No reviewers appointed yet, so nothing can be published. Appoint a verified clinician for clinical review, a psychiatrist for prescribing, and qualified professionals for legal and privacy review.
              </div>
            ) : (
              (reviewers || []).map((r: any) => (
                <div key={r.id} className="item row between" style={{ gap: 10 }}>
                  <span>
                    <strong>{nameOf(r.person)}</strong>
                    <p>
                      {ROLE_LABELS[r.role as ReviewerRole]} &middot; {r.qualification}
                      {r.active ? "" : " · stood down"}
                    </p>
                  </span>
                  <form action={setReviewerActiveAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                    <button type="submit" className="plain-button small">{r.active ? "Stand down" : "Reinstate"}</button>
                  </form>
                </div>
              ))
            )}
            <form action={appointReviewerAction} className="fields" style={{ marginTop: 14 }}>
              <label className="field">
                Person
                <select name="profile_id" defaultValue="" required>
                  <option value="" disabled>Choose a member</option>
                  {((people as any[]) || [])
                    .filter((p: any) => p.id !== user?.id)
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {nameOf(p)}
                        {p.qualification_level ? `, ${p.qualification_level}` : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Role
                <select name="role" defaultValue="clinical">
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                What qualifies them
                <input name="qualification" placeholder="e.g. NY licensed psychologist; attorney, MA bar" required minLength={5} />
              </label>
              <button type="submit" className="btn secondary small-btn" style={{ alignSelf: "flex-start" }}>Appoint</button>
              <p className="micro-note" style={{ margin: 0 }}>
                You can&rsquo;t appoint yourself. Clinical and prescribing reviewers must be verified, licensed members.
              </p>
            </form>
          </section>

          <section className="card tint">
            <div className="eyebrow">The PDFs</div>
            <p className="small" style={{ marginBottom: 0 }}>
              A review covers the resource file as well as its summary. Replacing a file creates a new version that needs review again.
            </p>
          </section>

          {starterSetCount < 20 && (
            <section className="card">
              <div className="card-title"><h3>Starter library</h3><span className="micro-note">{starterSetCount} of 20 here</span></div>
              <p className="small">Uploads PA-01 to PA-20 from the repository. Works only when running locally.</p>
              <form action={seedStarterLibraryAction}>
                <button type="submit" className="btn secondary small-btn">Seed starter library</button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
