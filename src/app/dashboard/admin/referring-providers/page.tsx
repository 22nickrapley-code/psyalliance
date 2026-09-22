import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { reviewProviderRegistration } from "./actions";

export default async function ReferringProvidersAdminPage(
  props: { searchParams: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);

  const { data: providers } = await supabase
    .from("referring_providers")
    .select("*")
    .order("requested_at", { ascending: false });

  const pending = (providers || []).filter((p) => p.approval_status === "pending");
  const decided = (providers || []).filter((p) => p.approval_status !== "pending");

  return (
    <div>
      <h1>Referring providers</h1>
      <p className="muted">
        Physicians and GPs who registered for the referral portal. Approving lets them browse the
        curated specialist directory and send structured referrals - they never get access to
        Network, Messages, Town Hall, or Caseload.
      </p>

      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

      <div className="card">
        <h2>Pending review ({pending.length})</h2>
        {pending.map((p) => (
          <div key={p.id} className="person-row">
            <span className="person-row-info">
              <strong>{p.full_name}</strong>
              {p.practice_name ? `, ${p.practice_name}` : ""}
              <br />
              <span className="muted">
                {p.email}
                {p.phone ? ` · ${p.phone}` : ""}
                {p.npi_number ? ` · NPI ${p.npi_number}` : ""}
              </span>
            </span>
            <span className="person-row-actions">
              <form action={reviewProviderRegistration}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="decision" value="approved" />
                <button type="submit">Approve</button>
              </form>
              <form action={reviewProviderRegistration}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="decision" value="rejected" />
                <button type="submit" className="secondary">Reject</button>
              </form>
            </span>
          </div>
        ))}
        {pending.length === 0 && <p className="muted">No pending registrations.</p>}
      </div>

      <div className="card">
        <h2>Reviewed</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Practice</th>
              <th>Status</th>
              <th>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {decided.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td>{p.practice_name || "-"}</td>
                <td><span className="tag">{p.approval_status}</span></td>
                <td>{p.reviewed_at ? new Date(p.reviewed_at).toLocaleDateString() : "-"}</td>
              </tr>
            ))}
            {decided.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No reviewed registrations yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
