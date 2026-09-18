import { createClient } from "@/lib/supabase/server";
import { createPlannerProject, respondToPlannerOffer, advanceToNextCandidate, cancelPlannerProject } from "./actions";

export default async function PlannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: myCases }, { data: myProjects }, { data: incomingOffers }] = await Promise.all([
    supabase
      .from("caseload_clients")
      .select("id, private_label, primary_need, state, city, session_type")
      .eq("profile_id", myself)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("planner_projects")
      .select(
        "*, planner_assignments(*, caseload_clients(private_label, primary_need, state, city), planner_offers(*, candidate:candidate_profile_id(full_name, credential_prefix)))"
      )
      .eq("profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("planner_offers")
      .select(
        "*, planner_assignments(caseload_clients(primary_need, state, city, session_type), planner_projects(name, start_date, end_date, profile_id, profiles:profile_id(full_name, credential_prefix)))"
      )
      .eq("candidate_profile_id", myself)
      .eq("status", "offered")
      .order("created_at", { ascending: false }),
  ]);

  function latestOffer(assignment: any) {
    const offers = assignment.planner_offers || [];
    return offers.length > 0 ? offers.reduce((a: any, b: any) => (a.created_at > b.created_at ? a : b)) : null;
  }

  return (
    <div>
      <h1>Planner</h1>
      <p className="muted">
        Going on leave? Select the active cases that need covering and Planner ranks colleagues by
        location, specialism fit, network tier, and community engagement — then drafts the outreach
        message for you. A decline moves straight to the next-ranked colleague; you just click
        through.
      </p>

      {(incomingOffers || []).length > 0 && (
        <div className="card">
          <h2>Coverage requests for you</h2>
          {(incomingOffers || []).map((o: any) => {
            const project = o.planner_assignments?.planner_projects;
            const caseInfo = o.planner_assignments?.caseload_clients;
            const requester = project?.profiles;
            return (
              <div key={o.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
                <div>
                  <strong>{requester?.credential_prefix} {requester?.full_name}</strong> needs coverage on{" "}
                  <span className="tag">{caseInfo?.primary_need || "a case"}</span>
                  {caseInfo?.city || caseInfo?.state ? ` · ${[caseInfo?.city, caseInfo?.state].filter(Boolean).join(", ")}` : ""}
                  {" "}for <strong>{project?.name}</strong> ({project?.start_date} – {project?.end_date})
                </div>
                <p className="muted">"{o.message}"</p>
                <form action={respondToPlannerOffer} style={{ display: "inline" }}>
                  <input type="hidden" name="offer_id" value={o.id} />
                  <input type="hidden" name="decision" value="accepted" />
                  <button type="submit">Accept</button>
                </form>{" "}
                <form action={respondToPlannerOffer} style={{ display: "inline" }}>
                  <input type="hidden" name="offer_id" value={o.id} />
                  <input type="hidden" name="decision" value="declined" />
                  <button type="submit" className="secondary">Decline</button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>Start a new coverage plan</h2>
        <form action={createPlannerProject}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Project name</label>
              <input id="name" name="name" type="text" placeholder="Leave — November" required />
            </div>
            <div className="field">
              <label htmlFor="start_date">Start date</label>
              <input id="start_date" name="start_date" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="end_date">End date</label>
              <input id="end_date" name="end_date" type="date" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" name="notes" rows={2} />
          </div>
          <div className="field">
            <label>Which active cases need covering?</label>
            <div className="checkbox-grid">
              {(myCases || []).map((c) => (
                <label key={c.id}>
                  <input type="checkbox" name="case_ids" value={c.id} />
                  Case #{c.id}{c.private_label ? ` (${c.private_label})` : ""} — {c.primary_need || "no need set"}
                  {c.state ? `, ${c.state}` : ""}
                </label>
              ))}
              {(myCases || []).length === 0 && <p className="muted">No active cases yet.</p>}
            </div>
          </div>
          <button type="submit" style={{ marginTop: "0.75rem" }}>Create plan &amp; send first offers</button>
        </form>
      </div>

      <div className="card">
        <h2>Your coverage plans</h2>
        {(myProjects || []).map((p: any) => (
          <div key={p.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{p.name}</strong>
              <span className="muted">{p.start_date} – {p.end_date} · <span className="tag">{p.status}</span></span>
            </div>
            {p.notes && <p className="muted">{p.notes}</p>}
            {(p.planner_assignments || []).map((a: any) => {
              const offer = latestOffer(a);
              const caseInfo = a.caseload_clients;
              return (
                <div key={a.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
                  <span>
                    Case: {caseInfo?.primary_need || "—"}{caseInfo?.state ? `, ${caseInfo.state}` : ""}
                    {" — "}
                    {offer ? (
                      <>
                        {offer.status === "accepted" && <>Covered by {offer.candidate?.credential_prefix} {offer.candidate?.full_name}</>}
                        {offer.status === "offered" && <>Awaiting reply from {offer.candidate?.credential_prefix} {offer.candidate?.full_name}</>}
                        {offer.status === "declined" && <>Declined by {offer.candidate?.credential_prefix} {offer.candidate?.full_name}</>}
                      </>
                    ) : (
                      <span className="muted">{a.status}</span>
                    )}
                  </span>
                  {offer && offer.status === "declined" && (
                    <form action={advanceToNextCandidate}>
                      <input type="hidden" name="assignment_id" value={a.id} />
                      <button type="submit" className="secondary">Find next candidate</button>
                    </form>
                  )}
                  {a.status === "exhausted" && <span className="muted">No more candidates to try</span>}
                </div>
              );
            })}
            {p.status === "active" && (
              <form action={cancelPlannerProject} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="secondary">Cancel plan</button>
              </form>
            )}
          </div>
        ))}
        {(myProjects || []).length === 0 && <p className="muted">No coverage plans yet.</p>}
      </div>
    </div>
  );
}
