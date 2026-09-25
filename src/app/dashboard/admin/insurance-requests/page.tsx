import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { reviewInsuranceRequest } from "./actions";

export default async function AdminInsuranceRequestsPage(
  props: { searchParams: Promise<{ error?: string }> }
) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { error } = await props.searchParams;

  const { data: requests } = await supabase
    .from("insurance_requests")
    .select("*, requester:requested_by(full_name, credential_prefix, qualification_level)")
    .order("created_at", { ascending: true });

  const pending = (requests || []).filter((r: any) => r.status === "pending");
  const reviewed = (requests || []).filter((r: any) => r.status !== "pending");

  return (
    <div>
      <h1>Insurance requests</h1>
      <p className="muted">
        Requests to add a new provider to the Insurance dropdown on Caseload. Approving adds it to
        the list immediately and messages the requester to let them know.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Awaiting review ({pending.length})</h2>
        {pending.map((r: any) => (
          <div key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{r.requested_value}</strong>{" "}
              <span className="muted">
                requested by {r.requester?.credential_prefix ? `${r.requester.credential_prefix} ` : ""}
                {r.requester?.full_name || "Colleague"} · {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <form action={reviewInsuranceRequest} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="approved" />
                <button type="submit">Approve</button>
              </form>{" "}
              <form action={reviewInsuranceRequest} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="rejected" />
                <button type="submit" className="danger">Reject</button>
              </form>
            </div>
          </div>
        ))}
        {pending.length === 0 && <p className="muted">Nothing waiting on review.</p>}
      </div>

      <div className="card">
        <h2>Reviewed ({reviewed.length})</h2>
        {reviewed.map((r: any) => (
          <p key={r.id}>
            {r.requested_value} <span className={`tag ${r.status === "approved" ? "" : "muted"}`}>{r.status}</span>
          </p>
        ))}
        {reviewed.length === 0 && <p className="muted">Nothing reviewed yet.</p>}
      </div>
    </div>
  );
}
