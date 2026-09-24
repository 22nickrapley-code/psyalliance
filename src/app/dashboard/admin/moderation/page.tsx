import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { REDACTABLE } from "@/lib/moderation";
import { resolveReportAction, redactContentAction } from "./actions";
import { PageHead, Banner, Status } from "../../_components/ui";

const TARGET_LABELS: Record<string, string> = {
  consultation: "Consult question",
  consultation_response: "Consult reply",
  message: "Message",
  profile: "Profile",
  user: "Member",
  library_document: "Library resource",
  referral: "Referral",
  referral_response: "Referral reply",
  cover_request: "Cover request",
};

const CATEGORY: Record<string, [string, "" | "warn" | "danger" | "neutral"]> = {
  patient_information: ["Patient information", "danger"],
  conduct: ["Conduct", "warn"],
  other: ["Other", "neutral"],
};

// Moderation. Patient-information reports come first: read the reported
// text (admins can read reported content only), then redact it in place.
// Everything is logged: who resolved what, when, and how.
export default async function ModerationQueuePage(props: { searchParams: Promise<{ error?: string; redacted?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error, redacted } = await props.searchParams;

  const [{ data: openRaw }, { data: resolvedReports }] = await Promise.all([
    supabase
      .from("reports")
      .select("*, reporter:reporter_profile_id(full_name, credential_prefix)")
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: true }),
    supabase
      .from("reports")
      .select("*, resolver:resolved_by(full_name)")
      .not("status", "in", "(open,reviewing)")
      .order("resolved_at", { ascending: false })
      .limit(20),
  ]);
  const open = (openRaw || []).sort((a: any, b: any) => Number(b.category === "patient_information") - Number(a.category === "patient_information"));
  const texts = new Map<number, string | null>();
  await Promise.all(
    open.map(async (r: any) => {
      if (!REDACTABLE.includes(r.target_type)) return;
      const { data } = await supabase.rpc("admin_reported_content", { p_report_id: r.id });
      texts.set(r.id, (data as string) ?? null);
    })
  );
  const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "a member");

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Moderation"
        lead="Patient information comes first. Redacting replaces the text everywhere in PsyAlliance and keeps a log without the removed words."
      />
      <Banner error={error} ok={redacted ? "Redacted. The related reports are closed." : undefined} />

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><h3>Open reports</h3><span className="micro-note">{open.length}</span></div>
        {open.length === 0 && <p className="small">Nothing waiting.</p>}
        {open.map((r: any) => {
          const [cLabel, cTone] = CATEGORY[r.category] || CATEGORY.other;
          const isProfileTarget = r.target_type === "profile" || r.target_type === "user";
          const canRedact = REDACTABLE.includes(r.target_type);
          const text = texts.get(r.id);
          return (
            <div key={r.id} className="item">
              <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
                <span>
                  <strong>{TARGET_LABELS[r.target_type] || r.target_type} #{r.target_id}</strong>
                  <p>Reported by {nameOf(r.reporter)} on {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{r.reason ? ` · ${r.reason}` : ""}</p>
                </span>
                <Status tone={cTone}>{cLabel}</Status>
              </div>
              {isProfileTarget && <p className="small"><a href={`/dashboard/people/${r.target_id}`}>Open the profile</a></p>}
              {canRedact && (
                <div className="quiet-panel small" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                  {text === undefined || text === null ? "This content no longer exists." : text || "(empty)"}
                </div>
              )}
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {canRedact && (
                  <form action={redactContentAction} className="inline">
                    <input type="hidden" name="target_type" value={r.target_type} />
                    <input type="hidden" name="target_id" value={r.target_id} />
                    <input type="hidden" name="reason" value={r.category === "patient_information" ? "Patient information" : r.reason || "Moderation"} />
                    <button type="submit" className="btn small-btn">Redact</button>
                  </form>
                )}
                <form action={resolveReportAction} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <input type="hidden" name="report_id" value={r.id} />
                  {isProfileTarget && <input type="hidden" name="account_status_profile_id" value={r.target_id} />}
                  <input name="admin_notes" placeholder="Note (sent to the member if you warn)" aria-label="Admin note" style={{ minWidth: 220 }} />
                  <button type="submit" name="action" value="dismissed" className="btn secondary small-btn">Dismiss</button>
                  {isProfileTarget && (
                    <>
                      <button type="submit" name="action" value="warned" className="btn secondary small-btn">Warn</button>
                      <button type="submit" name="action" value="restricted" className="btn ghost small-btn">Restrict</button>
                      <button type="submit" name="action" value="suspended" className="btn ghost small-btn">Suspend</button>
                    </>
                  )}
                  <button type="submit" name="action" value="escalated" className="btn ghost small-btn">Escalate</button>
                </form>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-title"><h3>Recently resolved</h3></div>
        {(resolvedReports || []).length === 0 && <p className="small">Nothing resolved yet.</p>}
        {(resolvedReports || []).map((r: any) => (
          <div key={r.id} className="item row between" style={{ gap: 12 }}>
            <span>
              <strong>{TARGET_LABELS[r.target_type] || r.target_type} #{r.target_id}</strong>
              <p>{(CATEGORY[r.category] || CATEGORY.other)[0]} &middot; {r.action_taken || r.status} by {r.resolver?.full_name || "an admin"}</p>
            </span>
            <span className="micro-note">{r.resolved_at ? new Date(r.resolved_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
          </div>
        ))}
      </section>
    </>
  );
}
