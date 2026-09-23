import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { resolveReportAction } from "./actions";

const TARGET_LABELS: Record<string, string> = {
  consultation: "Consultation",
  message: "Message",
  profile: "Profile",
  user: "Member",
  library_document: "Library document",
};

// PsyA2 #98/#101: content moderation queue - "must exist from launch."
// Reports are filed from src/lib/moderation.ts's fileReport(), wired onto
// People profiles, Consult, Messages, and the Shared Library.
//
// "Hide" is deliberately not wired to an actual visibility flag on the
// reported content: consultations, messages, and library documents don't
// have a hidden/is_hidden column today, and adding one to three
// differently-shaped tables (plus every query that reads them) is real
// schema surface on its own, not a drop-in for this pass. Choosing "Hide"
// here just records that as the resolution - an admin still needs to act
// on the actual content by hand (e.g. deleting a document, or reaching
// out about a message) until that's built.
export default async function ModerationQueuePage(props: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error } = await props.searchParams;

  const { data: openReports } = await supabase
    .from("reports")
    .select("*, reporter:reporter_profile_id(full_name, credential_prefix)")
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: true });

  const { data: resolvedReports } = await supabase
    .from("reports")
    .select("*, reporter:reporter_profile_id(full_name, credential_prefix), resolver:resolved_by(full_name)")
    .not("status", "in", "(open,reviewing)")
    .order("resolved_at", { ascending: false })
    .limit(20);

  // Best-effort target context: resolve what we can cheaply, per type,
  // rather than a generic polymorphic join (target_id spans uuid and
  // bigint across differently-shaped tables - see the migration comment).
  const profileTargetIds = (openReports || [])
    .filter((r: any) => r.target_type === "profile" || r.target_type === "user")
    .map((r: any) => r.target_id);
  const consultationTargetIds = (openReports || [])
    .filter((r: any) => r.target_type === "consultation")
    .map((r: any) => Number(r.target_id))
    .filter((n: number) => Number.isFinite(n));
  const documentTargetIds = (openReports || [])
    .filter((r: any) => r.target_type === "library_document")
    .map((r: any) => Number(r.target_id))
    .filter((n: number) => Number.isFinite(n));

  const [{ data: targetProfiles }, { data: targetConsultations }, { data: targetDocuments }] = await Promise.all([
    profileTargetIds.length > 0
      ? supabase.from("profiles").select("id, full_name, credential_prefix").in("id", profileTargetIds)
      : Promise.resolve({ data: [] as any[] }),
    consultationTargetIds.length > 0
      ? supabase.from("consultations").select("id, question").in("id", consultationTargetIds)
      : Promise.resolve({ data: [] as any[] }),
    documentTargetIds.length > 0
      ? supabase.from("documents").select("id, title").in("id", documentTargetIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const profileById = new Map((targetProfiles || []).map((p: any) => [p.id, p]));
  const consultationById = new Map((targetConsultations || []).map((c: any) => [String(c.id), c]));
  const documentById = new Map((targetDocuments || []).map((d: any) => [String(d.id), d]));

  function targetContext(r: any): { label: string; link?: string } {
    if (r.target_type === "profile" || r.target_type === "user") {
      const p = profileById.get(r.target_id);
      return p
        ? { label: `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}`, link: `/dashboard/people/${p.id}` }
        : { label: `Profile ${r.target_id}` };
    }
    if (r.target_type === "consultation") {
      const c = consultationById.get(r.target_id);
      return c ? { label: c.question } : { label: `Consultation #${r.target_id}` };
    }
    if (r.target_type === "library_document") {
      const d = documentById.get(r.target_id);
      return d ? { label: d.title, link: "/dashboard/documents" } : { label: `Document #${r.target_id}` };
    }
    return { label: `${TARGET_LABELS[r.target_type] || r.target_type} ${r.target_id}` };
  }

  return (
    <div>
      <h1>Moderation queue</h1>
      <p className="muted">
        Reports filed by members against a consultation, message, profile, member, or Library
        document (PsyA2 #101). Resolving a report is the audit trail - who resolved it, when,
        and what action was taken.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Open ({(openReports || []).length})</h2>
        {(openReports || []).map((r: any) => {
          const ctx = targetContext(r);
          const isProfileTarget = r.target_type === "profile" || r.target_type === "user";
          return (
            <div key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
              <div>
                <span className="tag">{TARGET_LABELS[r.target_type] || r.target_type}</span>{" "}
                {ctx.link ? <a href={ctx.link} className="person-link">{ctx.label}</a> : <strong>{ctx.label}</strong>}
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "0.2rem 0" }}>
                Reported by {r.reporter?.credential_prefix ? `${r.reporter.credential_prefix} ` : ""}
                {r.reporter?.full_name || "a member"} on {new Date(r.created_at).toLocaleDateString()}
              </p>
              <p style={{ margin: "0.2rem 0" }}>{r.reason}</p>
              <form action={resolveReportAction} style={{ marginTop: "0.4rem", display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
                <input type="hidden" name="report_id" value={r.id} />
                {isProfileTarget && <input type="hidden" name="account_status_profile_id" value={r.target_id} />}
                <input
                  type="text"
                  name="admin_notes"
                  placeholder="Note (optional - sent to the member if you Warn)"
                  style={{ flex: "1 1 220px", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                />
                <button type="submit" name="action" value="dismissed" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                  Dismiss
                </button>
                <button type="submit" name="action" value="hidden" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                  Hide
                </button>
                {isProfileTarget && (
                  <>
                    <button type="submit" name="action" value="warned" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                      Warn
                    </button>
                    <button type="submit" name="action" value="restricted" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                      Restrict
                    </button>
                    <button type="submit" name="action" value="suspended" className="danger" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                      Suspend
                    </button>
                  </>
                )}
                <button type="submit" name="action" value="escalated" className="danger" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                  Escalate
                </button>
              </form>
            </div>
          );
        })}
        {(openReports || []).length === 0 && <p className="muted">Nothing waiting on review.</p>}
      </div>

      <div className="card">
        <h2>Recently resolved</h2>
        {(resolvedReports || []).map((r: any) => (
          <div key={r.id} className="person-row">
            <span className="person-row-info">
              <span className="tag">{TARGET_LABELS[r.target_type] || r.target_type}</span>{" "}
              {r.reason}
            </span>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {r.action_taken} by {r.resolver?.full_name || "an admin"}
            </span>
          </div>
        ))}
        {(resolvedReports || []).length === 0 && <p className="muted">Nothing resolved yet.</p>}
      </div>
    </div>
  );
}
