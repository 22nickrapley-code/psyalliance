import { createClient } from "@/lib/supabase/server";
import { createConsultationAction, respondToConsultationAction, resolveConsultationAction, setResponseUsefulAction } from "./actions";
import { startConversation } from "../messages/actions";
import { fileReportAction } from "../moderation-actions";
import WorkflowResources from "@/components/workflow-resources";

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  diagnostic_clarification: "Diagnostic clarification",
  treatment_impasse: "Treatment impasse",
  risk: "Risk",
  ethics_legal: "Ethics / legal",
  boundaries_countertransference: "Boundaries / countertransference",
  medication_split_treatment: "Medication / split treatment",
  termination_transfer: "Termination / transfer",
  referral_recommendation: "Referral recommendation",
  practice_question: "Practice / professional question",
  other: "Other",
};

// New CONSULT primary destination (Master Brief's #56-61 composer + Phase
// 5 navigation). Product-level replacement for Town Hall specialist
// channels - Town Hall itself stays reachable from the Legacy nav group
// for now, untouched, until Phase 18. This first pass covers the
// question-first composer, type, audience (trusted/wider_network - full
// "selected clinicians" picker is a later refinement), tags, and
// reply/resolve. The optional structured case-detail format (PsyA2 #60)
// isn't exposed in this composer yet - every consultation created here has
// an empty case_detail, so the database's de-identification-confirmation
// gate never blocks anything in this first pass.
export default async function ConsultPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: consultations }, { data: myConsultations }, { data: directoryRows }] = await Promise.all([
    supabase
      .from("consultations")
      .select("*, author:author_profile_id(full_name, credential_prefix), consultation_responses(*, profiles:responder_profile_id(full_name))")
      .in("status", ["open", "responses_received"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("consultations")
      .select("id, question, status, created_at")
      .eq("author_profile_id", myself)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("public_directory").select("id,full_name,credential_prefix").order("full_name").limit(1000),
  ]);
  const recipients = Array.from(new Map((directoryRows || []).filter((row) => row.id !== myself)
    .map((row) => [row.id, row])).values());

  return (
    <div>
      <h1>Consult</h1>
      <WorkflowResources codes={["PA-05"]} />
      <p className="muted">
        Ask a specific question for selected clinicians, trusted colleagues, or the verified network. Keep it de-identified: no
        patient names, exact dates, addresses, or other identifying details.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <p className="muted" style={{ marginTop: "-0.5rem" }}>
        Looking for a persistent peer group instead of a one-off question?{" "}
        <a href="/dashboard/consult/groups">Consultation groups &rarr;</a>
      </p>

      <div className="card">
        <h2>Ask something</h2>
        <form action={createConsultationAction}>
          <div className="field">
            <label htmlFor="question">What do you need help thinking through?</label>
            <input id="question" name="question" type="text" placeholder="One-sentence question" required />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="consultation_type">Type</label>
              <select id="consultation_type" name="consultation_type" defaultValue="">
                <option value="">-</option>
                {Object.entries(CONSULTATION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="audience_type">Audience</label>
              {/* Sept 23 audit (task #125): defaulted to the whole verified
                  network, which is the widest possible audience for
                  something that's about to ask a real clinical question -
                  narrowed the default to Trusted colleagues; still a
                  deliberate choice to widen it, not the path of least
                  resistance. */}
              <select id="audience_type" name="audience_type" defaultValue="trusted">
                <option value="trusted">Trusted colleagues only</option>
                <option value="selected">Selected clinicians</option>
                <option value="wider_network">Verified network</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" name="tags" type="text" placeholder="ADHD, Assessment" />
            </div>
          </div>
          <details className="consult-recipient-picker"><summary>Choose clinicians for a selected-audience question</summary>
            <p className="muted">These people receive the question only if you choose “Selected clinicians” above. Pick at least one.</p>
            <div className="consult-recipient-grid">{recipients.map((person) => <label key={person.id}>
              <input type="checkbox" name="audience_profile_ids" value={person.id} />
              <span>{person.credential_prefix ? `${person.credential_prefix} ` : ""}{person.full_name}</span>
            </label>)}</div>
            {!recipients.length && <p className="muted">No verified clinicians are available to select yet.</p>}
          </details>
          <div className="field">
            <label htmlFor="context">Context (optional, de-identified)</label>
            <textarea id="context" name="context" rows={2} />
          </div>
          {/* Sept 23 audit (task #125): the de-identification guidance above
              the form was passive text nobody had to interact with. This is
              a real, required confirmation - recorded on the row itself
              (deidentification_confirmed), not just a hint. */}
          <div className="checkbox-row">
            <input id="deidentification_confirmed" name="deidentification_confirmed" type="checkbox" required />
            <label htmlFor="deidentification_confirmed" style={{ margin: 0, fontWeight: 400 }}>
              I confirm this question is de-identified - no patient names, exact dates, addresses, or other
              identifying details
            </label>
          </div>
          <button type="submit" style={{ marginTop: "0.5rem" }}>Post consultation</button>
        </form>
      </div>

      {(myConsultations || []).length > 0 && (
        <div className="card">
          <h2>My consultations</h2>
          {(myConsultations || []).map((c: any) => (
            <div key={c.id} className="person-row">
              <span className="person-row-info">
                {c.question} <span className="tag">{c.status.replace("_", " ")}</span>
              </span>
              {["open", "responses_received"].includes(c.status) && (
                <span className="person-row-actions">
                  <form action={resolveConsultationAction}>
                    <input type="hidden" name="consultation_id" value={c.id} />
                    <button type="submit" className="secondary">Mark resolved</button>
                  </form>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Open consultations ({(consultations || []).length})</h2>
        {(consultations || []).map((c: any) => (
          <div key={c.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{c.question}</strong>{" "}
              {c.consultation_type && <span className="tag">{CONSULTATION_TYPE_LABELS[c.consultation_type] || c.consultation_type}</span>}{" "}
              <span className="tag">{c.audience_type.replace("_", " ")}</span>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {c.author?.credential_prefix ? `${c.author.credential_prefix} ` : ""}
              {c.author?.full_name}
              {(c.tags || []).length > 0 && ` · ${c.tags.join(", ")}`}
            </p>
            {c.context && <p className="muted">{c.context}</p>}

            {(c.consultation_responses || []).length > 0 && (
              <div style={{ marginTop: "0.4rem" }}>
                {c.consultation_responses.map((r: any) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", margin: "0.2rem 0" }}>
                    <p style={{ fontSize: "0.9rem", margin: 0 }}>
                      <strong>{r.profiles?.full_name}:</strong> {r.body}
                    </p>
                    {c.author_profile_id === myself && (
                      <form action={setResponseUsefulAction} style={{ display: "inline" }}>
                        <input type="hidden" name="response_id" value={r.id} />
                        <input type="hidden" name="useful" value={r.marked_useful ? "false" : "true"} />
                        <button
                          type="submit"
                          className="secondary"
                          style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem", flexShrink: 0 }}
                          title="Private to you - not shown to the responder or anyone else"
                        >
                          {r.marked_useful ? "Useful ✓" : "Mark useful"}
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            {c.author_profile_id !== myself && (
              <form action={respondToConsultationAction} style={{ marginTop: "0.4rem" }}>
                <input type="hidden" name="consultation_id" value={c.id} />
                <div className="field-row">
                  <div className="field" style={{ flex: 1 }}>
                    <input name="body" type="text" placeholder="Reply" />
                  </div>
                  <button type="submit" className="secondary">Reply</button>
                  <button type="submit" name="response_type" value="clarifying_question" className="secondary">
                    Ask a question
                  </button>
                </div>
              </form>
            )}
            {c.author_profile_id !== myself && (
              <form action={startConversation} style={{ marginTop: "0.3rem" }}>
                <input type="hidden" name="participant_ids" value={c.author_profile_id} />
                <input type="hidden" name="title" value={`${c.author?.credential_prefix || ""} ${c.author?.full_name || ""}`.trim()} />
                <input type="hidden" name="body" value={`Hi, on your consultation "${c.question}" - `} />
                <button type="submit" className="secondary" style={{ fontSize: "0.85rem" }}>Message privately instead</button>
              </form>
            )}
            <details style={{ marginTop: "0.3rem" }}>
              <summary className="muted" style={{ fontSize: "0.8rem", cursor: "pointer", display: "inline-block" }}>Report this consultation</summary>
              <form action={fileReportAction} style={{ marginTop: "0.4rem", maxWidth: 420 }}>
                <input type="hidden" name="target_type" value="consultation" />
                <input type="hidden" name="target_id" value={c.id} />
                <input type="hidden" name="return_to" value="/dashboard/consult" />
                <div className="field">
                  <textarea name="reason" rows={2} placeholder="What's wrong with this consultation?" required />
                </div>
                <button type="submit" className="danger" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>Submit report</button>
              </form>
            </details>
          </div>
        ))}
        {(consultations || []).length === 0 && <p className="muted">No open consultations right now.</p>}
      </div>
    </div>
  );
}
