import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath, allAdminMembers } from "@/lib/admin";
import { reviewCredential, setProfileVerificationStatus, reviewLicenceAction } from "./actions";
import { PageHead, Banner, Status, Empty } from "../../_components/ui";

// Verification, in the order the evidence has to arrive: licences are
// reviewed against the state board first, then the member is verified.
// Real clinicians only: demo accounts and admin-only logins never appear.
export default async function VerificationQueuePage(props: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error } = await props.searchParams;

  const [{ data: membersRaw }, { data: licencesRaw }] = await Promise.all([
    allAdminMembers(supabase).then((data) => ({ data })),
    supabase
      .from("licenses")
      .select("id, profile_id, state, license_number, license_type, expiration_date, created_at, profile:profiles!licenses_profile_id_fkey!inner(id, full_name, credential_prefix, qualification_level, is_demo, account_kind)")
      .is("reviewed_at", null)
      .eq("profile.is_demo", false)
      .order("created_at", { ascending: true }),
  ]);
  const members = ((membersRaw as any[]) || []).filter((p) => p.account_kind === "clinician" && !p.is_demo && !p.demo_view);
  const licences = (licencesRaw || []).filter((l: any) => l.profile?.account_kind === "clinician");
  const awaiting = members.filter((p) => p.verification_status === "pending" || p.verification_status === "flagged");
  const unlicensed = members.filter((p) => p.verification_status === "verified" && p.reviewed_licences === 0);
  const eligible = members.filter((p) => p.eligible).length;

  const { data: submissions } = awaiting.length
    ? await supabase
        .from("credential_verifications")
        .select("id, profile_id, source, state, license_number, matched, flagged_reason, reviewed_at")
        .in("profile_id", awaiting.map((p) => p.id))
    : { data: [] as any[] };
  const subsBy = new Map<string, any[]>();
  for (const s of submissions || []) {
    if (!subsBy.has(s.profile_id)) subsBy.set(s.profile_id, []);
    subsBy.get(s.profile_id)!.push(s);
  }
  const nameOf = (p: any) => clinicianName(p?.full_name || "Member", p?.qualification_level, p?.credential_prefix);

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Verification"
        lead="Check each licence against the state board, then verify the member. Nothing here is automatic."
      />
      <Banner error={error} />

      <div className="three-grid" style={{ marginBottom: 20 }}>
        <div className="quiet-panel"><div className="eyebrow">Licences to review</div><div className="metric" style={{ marginTop: 8 }}>{licences.length}</div></div>
        <div className="quiet-panel"><div className="eyebrow">Awaiting a decision</div><div className="metric" style={{ marginTop: 8 }}>{awaiting.length}</div></div>
        <div className="quiet-panel"><div className="eyebrow">Eligible members</div><div className="metric" style={{ marginTop: 8 }}>{eligible}</div></div>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><h3>1. Licences to review</h3><span className="micro-note">Check number, name and expiry on the state board</span></div>
        {licences.length === 0 ? (
          <p className="small">No licences waiting.</p>
        ) : (
          licences.map((l: any) => (
            <div key={l.id} className="item row between" style={{ gap: 12, alignItems: "flex-start" }}>
              <span>
                <strong>{nameOf(l.profile)}{l.profile?.qualification_level ? `, ${l.profile.qualification_level}` : ""}</strong>
                <p>
                  {l.state} &middot; #{l.license_number}
                  {l.license_type ? ` · ${l.license_type}` : ""} &middot; expires {l.expiration_date || "not given"}
                </p>
              </span>
              <span className="row" style={{ gap: 8 }}>
                <form action={reviewLicenceAction} className="inline">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button type="submit" className="btn small-btn">Mark reviewed</button>
                </form>
                <form action={reviewLicenceAction} className="inline">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="decision" value="query" />
                  <button type="submit" className="btn secondary small-btn">Ask them to check</button>
                </form>
              </span>
            </div>
          ))
        )}
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><h3>2. Members awaiting a decision</h3><span className="micro-note">Verify once a licence is reviewed</span></div>
        {awaiting.length === 0 ? (
          <Empty symbol={"✓"} title="No one is waiting." body="New sign-ups appear here after they add their credentials." />
        ) : (
          awaiting.map((p) => (
            <div key={p.id} className="item">
              <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
                <span>
                  <strong>{nameOf(p)}{p.qualification_level ? `, ${p.qualification_level}` : ""}</strong>
                  <p>
                    {p.email} &middot; {p.reviewed_licences} reviewed licence{p.reviewed_licences === 1 ? "" : "s"}
                    {p.unreviewed_licences ? `, ${p.unreviewed_licences} to review above` : ""}
                    {p.npi_number ? ` · NPI ${p.npi_number}` : " · no NPI"}
                  </p>
                </span>
                <Status tone={p.verification_status === "flagged" ? "danger" : "warn"}>{p.verification_status === "flagged" ? "Flagged" : "Pending"}</Status>
              </div>
              {(subsBy.get(p.id) || []).map((v: any) => (
                <div key={v.id} className="row between small" style={{ gap: 10, marginTop: 6 }}>
                  <span>
                    {v.source} &middot; {v.state || "-"} &middot; #{v.license_number} &middot;{" "}
                    {v.matched ? "matched" : v.flagged_reason ? `flagged: ${v.flagged_reason}` : "not checked"}
                  </span>
                  {!v.matched && (
                    <span className="row" style={{ gap: 6 }}>
                      <form action={reviewCredential} className="inline">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="matched" />
                        <button type="submit" className="plain-button small">Matches</button>
                      </form>
                      <form action={reviewCredential} className="inline">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="flagged" />
                        <input type="hidden" name="flagged_reason" value="needs follow-up" />
                        <button type="submit" className="plain-button small">Flag</button>
                      </form>
                    </span>
                  )}
                </div>
              ))}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <form action={setProfileVerificationStatus} className="inline">
                  <input type="hidden" name="profile_id" value={p.id} />
                  <input type="hidden" name="status" value="verified" />
                  <button type="submit" className="btn small-btn" disabled={p.reviewed_licences === 0} title={p.reviewed_licences === 0 ? "Review a licence first" : undefined}>Verify</button>
                </form>
                {p.verification_status !== "flagged" && (
                  <form action={setProfileVerificationStatus} className="inline">
                    <input type="hidden" name="profile_id" value={p.id} />
                    <input type="hidden" name="status" value="flagged" />
                    <button type="submit" className="btn secondary small-btn">Flag</button>
                  </form>
                )}
                <form action={setProfileVerificationStatus} className="inline">
                  <input type="hidden" name="profile_id" value={p.id} />
                  <input type="hidden" name="status" value="rejected" />
                  <button type="submit" className="btn ghost small-btn">Reject</button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="card" id="unlicensed">
        <div className="card-title"><h3>Verified without a reviewed licence</h3><span className="micro-note">Not eligible for the network until fixed</span></div>
        {unlicensed.length === 0 ? (
          <p className="small">None. Every verified member has a reviewed, in-date licence.</p>
        ) : (
          unlicensed.map((p) => (
            <div key={p.id} className="item row between" style={{ gap: 12 }}>
              <span>
                <strong>{nameOf(p)}</strong>
                <p>{p.unreviewed_licences ? `${p.unreviewed_licences} licence${p.unreviewed_licences === 1 ? "" : "s"} to review above` : "No licence on file, or all expired"}</p>
              </span>
              <form action={setProfileVerificationStatus} className="inline">
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="status" value="pending" />
                <button type="submit" className="btn secondary small-btn">Back to pending</button>
              </form>
            </div>
          ))
        )}
      </section>
    </>
  );
}
