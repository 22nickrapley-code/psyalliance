import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProviderReferralsPage(
  props: { searchParams: Promise<{ sent?: string }> }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/refer-sign-in");

  const { data: provider } = await supabase
    .from("referring_providers")
    .select("approval_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!provider) redirect("/refer/onboarding");
  if (provider.approval_status !== "approved") redirect(provider.approval_status === "rejected" ? "/refer/rejected" : "/refer/pending");

  const { data: referrals } = await supabase
    .from("provider_referrals")
    .select("*, profiles:target_profile_id(full_name, credential_prefix)")
    .eq("referring_provider_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1>My referrals</h1>
      <p className="muted">Every referral you've sent, and its status.</p>

      {searchParams.sent === "1" && (
        <div className="message-banner">Referral sent.</div>
      )}

      <div className="card">
        {(referrals || []).map((r: any) => (
          <div key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>
                {r.profiles?.credential_prefix ? `${r.profiles.credential_prefix} ` : ""}
                {r.profiles?.full_name || "Specialist"}
              </strong>{" "}
              <span className={`tag${r.urgency === "urgent" ? " danger" : ""}`}>{r.urgency}</span>
              <span className="tag">{r.status}</span>
            </div>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {r.patient_initials ? `Patient ${r.patient_initials}` : "Patient"}
              {r.patient_age_range ? `, ${r.patient_age_range}` : ""} · {r.reason}
            </p>
            <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>
              Sent {new Date(r.created_at).toLocaleDateString()}
            </p>
            {r.status_note && (
              <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>
                Their note: "{r.status_note}"
              </p>
            )}
          </div>
        ))}
        {(referrals || []).length === 0 && <p className="muted">You haven't sent any referrals yet.</p>}
      </div>
    </div>
  );
}
