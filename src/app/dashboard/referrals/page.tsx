import { createClient } from "@/lib/supabase/server";
import { createReferralRequest, offerToHelp, acceptResponse, closeReferralRequest } from "./actions";

export default async function ReferralsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: specialisms }, { data: myRequests }, { data: openRequests }, { data: myResponses }] =
    await Promise.all([
      supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
      supabase
        .from("referral_requests")
        .select("*, lookup_values(value), referral_responses(*, profiles:responding_profile_id(full_name))")
        .eq("requesting_profile_id", myself)
        .order("created_at", { ascending: false }),
      supabase
        .from("referral_requests")
        .select("*, lookup_values(value)")
        .eq("status", "open")
        .neq("requesting_profile_id", myself)
        .order("created_at", { ascending: false }),
      supabase
        .from("referral_responses")
        .select("*, referral_requests(*, lookup_values(value))")
        .eq("responding_profile_id", myself)
        .order("created_at", { ascending: false }),
    ]);

  const myOfferedIds = new Set((myResponses || []).map((r: any) => r.referral_request_id));

  return (
    <div>
      <h1>Referrals &amp; coverage</h1>
      <p className="muted">
        Post a need — a client you can't take, a coverage gap — and see it here matched to the
        right specialism. Colleagues offer to help; you pick one.
      </p>

      <div className="card">
        <h2>Post a referral need</h2>
        <form action={createReferralRequest}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="specialism_lookup_id">Specialism needed</label>
              <select id="specialism_lookup_id" name="specialism_lookup_id">
                <option value="">—</option>
                {(specialisms || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input id="state" name="state" type="text" maxLength={2} placeholder="TX" />
            </div>
            <div className="field">
              <label htmlFor="insurance">Insurance</label>
              <input id="insurance" name="insurance" type="text" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={2} />
          </div>
          <button type="submit">Post request</button>
        </form>
      </div>

      <div className="card">
        <h2>My requests</h2>
        {(myRequests || []).map((r: any) => (
          <div key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{r.lookup_values?.value || "Any specialism"}</strong>
              {r.state ? ` · ${r.state}` : ""}{r.insurance ? ` · ${r.insurance}` : ""}{" "}
              <span className="tag">{r.status}</span>
            </div>
            {r.notes && <p className="muted">{r.notes}</p>}
            {(r.referral_responses || []).map((resp: any) => (
              <div key={resp.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
                <span>{resp.profiles?.full_name} — {resp.status}{resp.message ? `: "${resp.message}"` : ""}</span>
                {resp.status === "offered" && r.status === "open" && (
                  <form action={acceptResponse}>
                    <input type="hidden" name="response_id" value={resp.id} />
                    <input type="hidden" name="referral_request_id" value={r.id} />
                    <button type="submit">Accept</button>
                  </form>
                )}
              </div>
            ))}
            {r.status === "open" && (
              <form action={closeReferralRequest}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="secondary">Close without matching</button>
              </form>
            )}
          </div>
        ))}
        {(myRequests || []).length === 0 && <p className="muted">You haven't posted any requests.</p>}
      </div>

      <div className="card">
        <h2>Open requests from colleagues</h2>
        {(openRequests || []).map((r: any) => (
          <div key={r.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{r.lookup_values?.value || "Any specialism"}</strong>
              {r.state ? ` · ${r.state}` : ""}{r.insurance ? ` · ${r.insurance}` : ""}
              {r.notes ? ` — ${r.notes}` : ""}
            </span>
            {myOfferedIds.has(r.id) ? (
              <span className="muted">offered</span>
            ) : (
              <form action={offerToHelp}>
                <input type="hidden" name="referral_request_id" value={r.id} />
                <button type="submit">I can help</button>
              </form>
            )}
          </div>
        ))}
        {(openRequests || []).length === 0 && <p className="muted">No open requests right now.</p>}
      </div>
    </div>
  );
}
