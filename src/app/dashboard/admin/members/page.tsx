import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { setMemberVerificationStatus, setMemberAdminFlag, setMemberAccountStatusAction, setAccountKindAction } from "./actions";
import { PageHead, Banner, Status } from "../../_components/ui";

const VERIFICATION: Record<string, [string, "" | "warn" | "neutral" | "danger"]> = {
  verified: ["Verified", ""],
  pending: ["Pending", "warn"],
  flagged: ["Flagged", "danger"],
  rejected: ["Rejected", "neutral"],
};

// Every account, with the evidence next to the status. Real clinicians by
// default; demo accounts and admin-only (operator) logins on their own tabs
// so they're never mistaken for members.
export default async function AdminMembersPage(props: {
  searchParams: Promise<{ q?: string; state?: string; status?: string; kind?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const stateFilter = (sp.state || "").trim().toUpperCase();
  const statusFilter = sp.status || "";
  const kind = sp.kind === "demo" || sp.kind === "operator" ? sp.kind : "clinician";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase.rpc("admin_members");
  const all = ((data as any[]) || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const inKind = all.filter((p) => (kind === "demo" ? p.is_demo || p.demo_view : kind === "operator" ? p.account_kind === "operator" && !p.is_demo : p.account_kind === "clinician" && !p.is_demo && !p.demo_view));
  const rows = inKind.filter((p) => {
    if (q && !`${p.full_name} ${p.email || ""} ${p.contact_email || ""}`.toLowerCase().includes(q)) return false;
    if (stateFilter && p.primary_state !== stateFilter) return false;
    if (statusFilter && p.verification_status !== statusFilter) return false;
    return true;
  });
  const count = (k: string) =>
    all.filter((p) => (k === "demo" ? p.is_demo || p.demo_view : k === "operator" ? p.account_kind === "operator" && !p.is_demo : p.account_kind === "clinician" && !p.is_demo && !p.demo_view)).length;
  const tab = (k: string, label: string) => (
    <a className={`tab${kind === k ? " active" : ""}`} href={`/dashboard/admin/members?kind=${k}`} aria-current={kind === k ? "page" : undefined}>
      {label} <span className="micro-note">{count(k)}</span>
    </a>
  );

  return (
    <>
      <PageHead eyebrow="Admin" title="Members" lead="Search, verify, suspend or promote. Verifying needs at least one reviewed, in-date licence." />
      <Banner error={sp.error} />
      <div className="tabs" style={{ marginBottom: 14 }}>
        {tab("clinician", "Clinicians")}
        {tab("operator", "Admin-only accounts")}
        {tab("demo", "Demo")}
      </div>

      <form method="get" className="searchbar" style={{ marginBottom: 16 }}>
        <input type="hidden" name="kind" value={kind} />
        <input type="search" name="q" defaultValue={sp.q || ""} placeholder="Name or email" aria-label="Name or email" />
        <input name="state" defaultValue={sp.state || ""} placeholder="State" aria-label="State" maxLength={2} style={{ maxWidth: 80 }} />
        <select name="status" defaultValue={statusFilter} aria-label="Verification status">
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
          <option value="rejected">Rejected</option>
        </select>
        <button type="submit" className="btn small-btn">Filter</button>
      </form>

      <section className="card">
        <div className="card-title"><h3>{rows.length} of {inKind.length}</h3></div>
        {rows.map((p) => {
          const [vLabel, vTone] = VERIFICATION[p.verification_status] || [p.verification_status, "neutral"];
          const isMe = p.id === user?.id;
          return (
            <div key={p.id} className="item">
              <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
                <span>
                  <strong>
                    {p.credential_prefix ? `${p.credential_prefix} ` : ""}
                    {p.full_name}
                    {p.qualification_level ? `, ${p.qualification_level}` : ""}
                  </strong>
                  <p>
                    {p.email || "no login email"}
                    {p.primary_state ? ` · ${p.primary_practice_city ? p.primary_practice_city + ", " : ""}${p.primary_state}` : ""}
                    {` · joined ${new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                  </p>
                  <p>
                    {p.reviewed_licences} reviewed licence{p.reviewed_licences === 1 ? "" : "s"}
                    {p.unreviewed_licences ? `, ${p.unreviewed_licences} awaiting review` : ""}
                    {p.npi_number ? ` · NPI ${p.npi_number}` : ""}
                  </p>
                </span>
                <span className="chip-row" style={{ justifyContent: "flex-end" }}>
                  {p.account_kind === "clinician" && <Status tone={vTone}>{vLabel}</Status>}
                  {p.account_kind === "clinician" && (p.eligible ? <Status>Eligible</Status> : <Status tone="neutral">Not eligible</Status>)}
                  {p.account_status !== "active" && <Status tone="danger">{p.account_status}</Status>}
                  {p.is_admin && <Status tone="neutral">Admin</Status>}
                </span>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary className="small" style={{ cursor: "pointer" }}>Manage</summary>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {p.account_kind === "clinician" &&
                    ["verified", "flagged", "rejected", "pending"]
                      .filter((s) => s !== p.verification_status)
                      .map((s) => (
                        <form key={s} action={setMemberVerificationStatus} className="inline">
                          <input type="hidden" name="profile_id" value={p.id} />
                          <input type="hidden" name="status" value={s} />
                          <button type="submit" className={s === "verified" ? "btn small-btn" : "btn secondary small-btn"} disabled={s === "verified" && p.reviewed_licences === 0} title={s === "verified" && p.reviewed_licences === 0 ? "Review a licence first" : undefined}>
                            {s === "verified" ? "Verify" : s === "pending" ? "Back to pending" : s[0].toUpperCase() + s.slice(1)}
                          </button>
                        </form>
                      ))}
                  {p.account_status === "active" ? (
                    ["restricted", "suspended", "deactivated"].map((s) => (
                      <form key={s} action={setMemberAccountStatusAction} className="inline">
                        <input type="hidden" name="profile_id" value={p.id} />
                        <input type="hidden" name="account_status" value={s} />
                        <button type="submit" className="btn ghost small-btn" disabled={isMe}>{({ restricted: "Restrict", suspended: "Suspend", deactivated: "Deactivate" } as Record<string, string>)[s]}</button>
                      </form>
                    ))
                  ) : (
                    <form action={setMemberAccountStatusAction} className="inline">
                      <input type="hidden" name="profile_id" value={p.id} />
                      <input type="hidden" name="account_status" value="active" />
                      <button type="submit" className="btn secondary small-btn">Restore</button>
                    </form>
                  )}
                  <form action={setMemberAdminFlag} className="inline">
                    <input type="hidden" name="profile_id" value={p.id} />
                    <input type="hidden" name="is_admin" value={p.is_admin ? "0" : "1"} />
                    <button type="submit" className="btn ghost small-btn" disabled={isMe}>{p.is_admin ? "Remove admin" : "Make admin"}</button>
                  </form>
                  {!p.is_demo && (
                    <form action={setAccountKindAction} className="inline">
                      <input type="hidden" name="profile_id" value={p.id} />
                      <input type="hidden" name="account_kind" value={p.account_kind === "operator" ? "clinician" : "operator"} />
                      <button type="submit" className="btn ghost small-btn" disabled={isMe}>
                        {p.account_kind === "operator" ? "Treat as clinician" : "Make admin-only"}
                      </button>
                    </form>
                  )}
                </div>
              </details>
            </div>
          );
        })}
        {rows.length === 0 && <p className="small">{inKind.length === 0 ? (kind === "clinician" ? "No clinicians have joined yet." : "None.") : "No one matches those filters."}</p>}
      </section>
    </>
  );
}
