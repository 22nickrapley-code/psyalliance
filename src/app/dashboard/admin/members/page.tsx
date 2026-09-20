import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { setMemberVerificationStatus, setMemberAdminFlag } from "./actions";
import { professionFor, professionLabel } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";

export default async function AdminMembersPage(
  props: { searchParams: Promise<{ q?: string; state?: string; status?: string }> }
) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);

  const searchParams = await props.searchParams;
  const q = (searchParams?.q || "").trim().toLowerCase();
  const stateFilter = (searchParams?.state || "").trim().toUpperCase();
  const statusFilter = searchParams?.status || "";

  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "id, full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, verification_status, is_admin, contact_email, created_at"
    )
    .order("created_at", { ascending: false });

  const filtered = (profiles || []).filter((p: any) => {
    if (q && !p.full_name.toLowerCase().includes(q) && !(p.contact_email || "").toLowerCase().includes(q)) return false;
    if (stateFilter && p.primary_state !== stateFilter) return false;
    if (statusFilter && p.verification_status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <h1>All members</h1>
      <p className="muted">
        Every profile on the platform, not just the ones awaiting credential review: search,
        override verification status, or promote a trusted co-reviewer to admin. Test/seed
        accounts (used for your own network/matching testing) are marked so you don't mistake
        them for real signups.
      </p>

      <div className="card">
        <form method="GET" className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <label htmlFor="q">Name or email</label>
            <input id="q" name="q" type="text" defaultValue={searchParams?.q || ""} placeholder="Search" />
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <label htmlFor="state">State</label>
            <input id="state" name="state" type="text" maxLength={24} defaultValue={searchParams?.state || ""} placeholder="TX or Texas" list="us-states" autoComplete="off" />
            <UsStateDatalist />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={statusFilter}>
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="flagged">Flagged</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Filter</button>
          </div>
          {(q || stateFilter || statusFilter) && (
            <div className="field" style={{ flex: "0 0 auto" }}>
              <a href="/dashboard/admin/members" className="btn secondary" style={{ display: "inline-block" }}>Clear</a>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <h2>{filtered.length} of {(profiles || []).length}</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Profession</th>
              <th>Location</th>
              <th>Status</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const isSeed = (p.contact_email || "").endsWith("@seed.psyalliance.test");
              return (
                <tr key={p.id}>
                  <td>
                    {p.credential_prefix} {p.full_name}
                    {isSeed && (
                      <span className="tag gold" style={{ marginLeft: "0.4rem" }} title="Generated test data for your own network/matching testing">
                        test data
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`tag${professionFor(p.qualification_level) === "psychiatrist" ? " psychiatrist" : ""}`}>
                      {professionLabel(professionFor(p.qualification_level))}
                    </span>
                  </td>
                  <td>{p.primary_practice_city || "-"}{p.primary_state ? `, ${p.primary_state}` : ""}</td>
                  <td><span className="tag">{p.verification_status}</span></td>
                  <td>{p.is_admin ? "Yes" : "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {p.verification_status !== "verified" && (
                        <form action={setMemberVerificationStatus}>
                          <input type="hidden" name="profile_id" value={p.id} />
                          <input type="hidden" name="status" value="verified" />
                          <button type="submit" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>Verify</button>
                        </form>
                      )}
                      {p.verification_status !== "flagged" && (
                        <form action={setMemberVerificationStatus}>
                          <input type="hidden" name="profile_id" value={p.id} />
                          <input type="hidden" name="status" value="flagged" />
                          <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>Flag</button>
                        </form>
                      )}
                      {p.verification_status !== "rejected" && (
                        <form action={setMemberVerificationStatus}>
                          <input type="hidden" name="profile_id" value={p.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <button type="submit" className="danger" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>Reject</button>
                        </form>
                      )}
                      <form action={setMemberAdminFlag}>
                        <input type="hidden" name="profile_id" value={p.id} />
                        <input type="hidden" name="is_admin" value={p.is_admin ? "0" : "1"} />
                        <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                          {p.is_admin ? "Revoke admin" : "Make admin"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No members match those filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
