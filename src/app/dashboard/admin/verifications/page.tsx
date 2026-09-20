import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { reviewCredential, setProfileVerificationStatus } from "./actions";

export default async function AdminVerificationsPage(
  props: { searchParams: Promise<{ error?: string }> }
) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error } = await props.searchParams;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*, credential_verifications!credential_verifications_profile_id_fkey(*)")
    .neq("verification_status", "rejected")
    .order("created_at", { ascending: true });

  const pending = (profiles || []).filter((p) => p.verification_status !== "verified");
  const verified = (profiles || []).filter((p) => p.verification_status === "verified");

  return (
    <div>
      <h1>Credential verification queue</h1>
      <p className="muted">
        Human sign-off, every time: this list is not auto-approved. Automated state-board /
        ASPPB / NPI lookups are a future integration; for now, check each submission by hand
        against the source before marking it matched.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Awaiting review ({pending.length})</h2>
        {pending.map((p: any) => (
          <div key={p.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{p.credential_prefix} {p.full_name}</strong>, {p.qualification_level}{" "}
              <span className="tag">{p.verification_status}</span>
            </div>
            {(p.credential_verifications || []).map((v: any) => (
              <div key={v.id} className="person-row">
                <span className="person-row-info">
                  {v.source} · {v.state || "-"} · #{v.license_number} ·{" "}
                  {v.matched ? "matched" : v.flagged_reason ? `flagged: ${v.flagged_reason}` : "unreviewed"}
                </span>
                {!v.matched && (
                  <span className="person-row-actions">
                    <form action={reviewCredential}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="decision" value="matched" />
                      <button type="submit">Mark matched</button>
                    </form>
                    <form action={reviewCredential}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="decision" value="flagged" />
                      <input type="hidden" name="flagged_reason" value="needs follow-up" />
                      <button type="submit" className="secondary">Flag</button>
                    </form>
                  </span>
                )}
              </div>
            ))}
            {(p.credential_verifications || []).length === 0 && (
              <p className="muted">No verification submissions from this person yet.</p>
            )}
            <div style={{ marginTop: "0.5rem" }}>
              <form action={setProfileVerificationStatus} style={{ display: "inline" }}>
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="status" value="verified" />
                <button type="submit">Approve profile</button>
              </form>{" "}
              <form action={setProfileVerificationStatus} style={{ display: "inline" }}>
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="status" value="flagged" />
                <button type="submit" className="secondary">Flag profile</button>
              </form>{" "}
              <form action={setProfileVerificationStatus} style={{ display: "inline" }}>
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="status" value="rejected" />
                <button type="submit" className="danger">Reject</button>
              </form>
            </div>
          </div>
        ))}
        {pending.length === 0 && <p className="muted">Nothing waiting on review.</p>}
      </div>

      <div className="card">
        <h2>Verified ({verified.length})</h2>
        {verified.map((p: any) => (
          <p key={p.id}>{p.credential_prefix} {p.full_name}, {p.qualification_level}</p>
        ))}
      </div>
    </div>
  );
}
