import { ReportContent } from "../_components/report-content";
import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import { PageHead, Banner, Empty, Status, PersonAvatar, MatchCard } from "../_components/ui";
import {
  draftConsultAction,
  publishConsultAction,
  discardDraftAction,
  respondToConsultationAction,
  resolveConsultationAction,
  setResponseUsefulAction,
  followTagAction,
} from "./actions";

// Consult (Product Spec v1): think a case through with one colleague, a
// closed group, or the wider network, plus supervision. One tagged feed
// replaces Town Hall's channels.

export type ConsultTab = "discussions" | "mine" | "groups" | "supervision";

export type PostItem = {
  id: number;
  kind: string;
  question: string;
  context: string | null;
  tags: string[];
  audienceLabel: string;
  authorName: string;
  createdAt: string;
  replies: number;
  status: string;
  mine: boolean;
  why?: string;
};

export const PRACTICE_TOPICS = ["Private practice", "Ethics", "Billing & insurance", "Telehealth", "Licensure", "Documentation", "Supervision", "Self-care & burnout"];

export const CONSULT_TYPES: [string, string][] = [
  ["diagnostic_clarification", "Diagnostic clarification"],
  ["treatment_impasse", "Treatment impasse"],
  ["risk", "Risk"],
  ["ethics_legal", "Ethics or legal"],
  ["boundaries_countertransference", "Boundaries or countertransference"],
  ["medication_split_treatment", "Medication or split treatment"],
  ["termination_transfer", "Termination or transfer"],
  ["referral_recommendation", "Referral recommendation"],
  ["practice_question", "Practice question"],
  ["other", "Other"],
];

export function audienceLabel(c: any) {
  if (c.group_id) return "Consultation group";
  if (c.audience_type === "selected") return (c.audience_profile_ids || []).length === 1 ? "One colleague" : "Selected colleagues";
  if (c.audience_type === "trusted") return "Trusted colleagues";
  return "Verified network";
}

const TABS: [ConsultTab, string][] = [
  ["discussions", "Discussions"],
  ["mine", "My questions"],
  ["groups", "Groups"],
  ["supervision", "Supervision"],
];

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
}

function PostCard({ p }: { p: PostItem }) {
  const statusLabel = p.status === "resolved" ? "Resolved" : p.status === "draft" ? "Draft" : p.replies > 0 ? "Open · replies in" : "Open";
  const kicker = [
    p.kind === "supervision_request" ? "Supervision wanted" : p.kind === "supervision_offer" ? "Supervision offered" : "Practice question",
    ...p.tags.slice(0, 2),
  ].join(" · ");
  return (
    <article className="discussion">
      <div className="kicker">
        <span className="eyebrow">{kicker}</span>
        <Status tone={p.status === "resolved" ? "neutral" : p.status === "draft" ? "warn" : ""}>{statusLabel}</Status>
      </div>
      <h3><a href={`/dashboard/consult/${p.id}`}>{p.question}</a></h3>
      {p.context && <p className="ctx">{p.context.length > 240 ? p.context.slice(0, 240) + "…" : p.context}</p>}
      <div className="foot">
        <span>
          {p.authorName} &middot; {timeAgo(p.createdAt)} &middot; {p.audienceLabel} &middot; {p.replies} repl{p.replies === 1 ? "y" : "ies"}
          {p.why ? ` · ${p.why}` : ""}
        </span>
        <a className="text-arrow" href={`/dashboard/consult/${p.id}`}>Read discussion &#8599;</a>
      </div>
    </article>
  );
}

export function ConsultIndexView({
  tab,
  posts,
  tags,
  followed,
  activeTag,
  groups,
  supervisors,
  supervisorAvatars,
  error,
}: {
  tab: ConsultTab;
  posts: PostItem[];
  tags: string[];
  followed: string[];
  activeTag: string;
  groups: { id: number; name: string; purpose: string | null; members: number; status: string; membershipId: number | null }[];
  supervisors: Match[];
  supervisorAvatars: Record<string, string | null>;
  error?: string;
}) {
  const newHref = tab === "supervision" ? "/dashboard/consult/new?kind=supervision_request" : "/dashboard/consult/new";
  return (
    <>
      <PageHead
        eyebrow="Consult / professional dialogue"
        title="Better questions, better thinking."
        lead="Discuss practice questions with a chosen audience. Keep patient information out of the conversation."
        actions={<a className="btn" href={newHref}>{tab === "supervision" ? "Request supervision" : "Ask a question"}</a>}
      />
      <Banner error={error} />
      <nav className="tabs" style={{ marginBottom: 18 }}>
        {TABS.map(([k, l]) => (
          <a key={k} href={`/dashboard/consult?tab=${k}`} className={`tab${tab === k ? " active" : ""}`}>{l}</a>
        ))}
      </nav>
      <div className="split">
        <div className="stack">
          {tab === "discussions" && (
            <div className="chip-row">
              <a className={`chip${!activeTag ? " selected" : ""}`} href="/dashboard/consult">For you</a>
              {tags.map((t) => (
                <a key={t} className={`chip${activeTag === t ? " selected" : ""}`} href={`/dashboard/consult?tag=${encodeURIComponent(t)}`}>
                  {followed.includes(t) ? "✓ " : ""}{t}
                </a>
              ))}
            </div>
          )}
          {tab === "discussions" && activeTag && (
            <form action={followTagAction} className="row">
              <input type="hidden" name="tag" value={activeTag} />
              <input type="hidden" name="follow" value={followed.includes(activeTag) ? "0" : "1"} />
              <button type="submit" className="btn secondary small-btn">{followed.includes(activeTag) ? `Unfollow ${activeTag}` : `Follow ${activeTag}`}</button>
              <span className="micro-note">Followed tags rank first in your feed and weekly digest.</span>
            </form>
          )}

          {tab === "groups" ? (
            <>
              {groups.length === 0 ? (
                <Empty symbol={"✳"} title="No consultation groups yet." body="A closed group is your virtual case conference: a few trusted colleagues, a written charter, and threads only members can see." action={<a className="btn secondary small-btn" href="/dashboard/consult/groups">Create a group</a>} />
              ) : (
                groups.map((g) => (
                  <a key={g.id} href={`/dashboard/consult/groups/${g.id}`} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                    <div className="row between">
                      <h3 style={{ margin: 0 }}>{g.name}</h3>
                      <Status tone={g.status === "invited" ? "warn" : ""}>{g.status === "invited" ? "Invitation" : `${g.members} member${g.members === 1 ? "" : "s"}`}</Status>
                    </div>
                    {g.purpose && <p className="small" style={{ margin: "6px 0 0" }}>{g.purpose}</p>}
                  </a>
                ))
              )}
              <a className="btn secondary small-btn" href="/dashboard/consult/groups" style={{ alignSelf: "flex-start" }}>Manage groups</a>
            </>
          ) : posts.length === 0 ? (
            <Empty
              symbol={"✳"}
              title={tab === "mine" ? "You haven't asked anything yet." : tab === "supervision" ? "No supervision posts yet." : "No discussions here yet."}
              body={tab === "discussions" ? "Ask the first question, or follow the tags that match your practice." : "Start with one focused question and choose exactly who sees it."}
              action={<a className="btn secondary small-btn" href={newHref}>{tab === "supervision" ? "Request supervision" : "Ask a question"}</a>}
            />
          ) : (
            posts.map((p) => <PostCard key={p.id} p={p} />)
          )}

          {tab === "supervision" && (
            <section className="card">
              <div className="card-title"><h3>Open to supervise</h3><span className="micro-note">Matched to your state and specialties</span></div>
              {supervisors.length === 0 ? (
                <p className="small">No members matching your profile have marked themselves open to supervise yet.</p>
              ) : (
                supervisors.map((m) => (
                  <MatchCard key={m.profileId} m={m} avatarUrl={supervisorAvatars[m.profileId]} actions={<a className="btn secondary small-btn" href={`/dashboard/consult/new?kind=supervision_request&to=${m.profileId}`}>Ask about supervision</a>} />
                ))
              )}
              <a className="btn ghost small-btn" href="/dashboard/consult/new?kind=supervision_offer">Offer supervision instead</a>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Before you post</div>
            <h3>Keep it focused and de-identified.</h3>
            <p className="small">Use a short question, relevant context and an intentional audience. Do not include patient names, dates, contact details or an unusual combination of details that could identify someone.</p>
            <a className="btn secondary small-btn" href="/dashboard/documents/PA-05">Use the question guide (PA-05)</a>
          </section>
          <section className="card">
            <div className="eyebrow">Audience, deliberately chosen</div>
            <ul className="summary-list">
              <li><span>One colleague</span><strong>Private</strong></li>
              <li><span>Consultation group</span><strong>Members only</strong></li>
              <li><span>Trusted colleagues</span><strong>Your circle</strong></li>
              <li><span>Verified network</span><strong>Wider reach</strong></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

// ---------- Compose ----------
export function ConsultComposeView({
  kind,
  areas,
  colleagues,
  groups,
  preselect,
  preselectGroup,
  error,
}: {
  kind: "question" | "supervision_request" | "supervision_offer";
  areas: string[];
  colleagues: { id: string; name: string; relation: string }[];
  groups: { id: number; name: string }[];
  preselect?: string;
  preselectGroup?: number;
  error?: string;
}) {
  const title = kind === "supervision_request" ? "Request supervision." : kind === "supervision_offer" ? "Offer supervision." : "Ask colleagues a question.";
  return (
    <>
      <PageHead eyebrow="Consult / new" title={title} lead="Question first, then context, then who sees it. You'll review before anything is shared." actions={<a className="btn secondary" href="/dashboard/consult">Cancel</a>} />
      <Banner error={error} />
      <form className="split" action={draftConsultAction}>
        <input type="hidden" name="kind" value={kind} />
        <section className="card">
          <label className="field">
            {kind === "question" ? "Your question, in one sentence" : "Summary, in one sentence"}
            <input
              name="question"
              required
              maxLength={280}
              placeholder={
                kind === "supervision_request"
                  ? "e.g. Seeking weekly supervision towards NY licensure, trauma focus"
                  : kind === "supervision_offer"
                    ? "e.g. Offering fortnightly supervision for early-career clinicians in CBT"
                    : "e.g. How are you structuring a transition to a new covering clinician?"
              }
            />
          </label>
          <div className="fields" style={{ marginTop: 14 }}>
            {kind === "question" && (
              <label className="field">
                Type
                <select name="consultation_type" defaultValue="practice_question">
                  {CONSULT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              Treatment area tag
              <select name="tag_area" defaultValue="">
                <option value="">None</option>
                {areas.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label className="field">
              Practice topic tag
              <select name="tag_topic" defaultValue={kind === "question" ? "" : "Supervision"}>
                <option value="">None</option>
                {PRACTICE_TOPICS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="field full">
              Context (optional)
              <textarea name="context" maxLength={2000} placeholder="Broad, de-identified context: what you've tried, where you're stuck, what would help." />
            </label>
          </div>

          <h3 style={{ marginTop: 20 }}>Who should see this?</h3>
          <label className="radio-card">
            <input type="radio" name="audience" value="one" defaultChecked={!!preselect} />
            <span><b>One colleague</b><span>A private question, like knocking on a colleague&rsquo;s door.</span></span>
          </label>
          <label className="radio-card">
            <input type="radio" name="audience" value="selected" />
            <span><b>Selected colleagues</b><span>Choose a few people below.</span></span>
          </label>
          {groups.map((g) => (
            <label key={g.id} className="radio-card">
              <input type="radio" name="audience" value={`group:${g.id}`} defaultChecked={preselectGroup === g.id} />
              <span><b>{g.name}</b><span>Your consultation group. Members only.</span></span>
            </label>
          ))}
          <label className="radio-card">
            <input type="radio" name="audience" value="trusted" defaultChecked={!preselect && !preselectGroup} />
            <span><b>My trusted colleagues</b><span>Your circle. The default.</span></span>
          </label>
          <label className="radio-card">
            <input type="radio" name="audience" value="wider_network" />
            <span><b>Verified network</b><span>Every verified member can see and reply. Shown to those following your tags.</span></span>
          </label>

          {colleagues.length > 0 && (
            <details open={!!preselect} style={{ marginTop: 8 }}>
              <summary className="small">Choose colleagues (for One colleague or Selected)</summary>
              <div className="stack" style={{ gap: 6, marginTop: 10, maxHeight: 280, overflow: "auto" }}>
                {colleagues.map((c) => (
                  <label key={c.id} className="checkline">
                    <input type="checkbox" name="recipients" value={c.id} defaultChecked={preselect === c.id} />
                    {c.name} <span className="micro-note">{c.relation}</span>
                  </label>
                ))}
              </div>
            </details>
          )}

          <label className="checkline" style={{ marginTop: 16 }}>
            <input type="checkbox" name="deidentified" required />
            This contains no patient names, dates, contact details or identifying combinations of details.
          </label>
          <div className="step-actions">
            <a className="btn ghost" href="/dashboard/consult">Cancel</a>
            <button type="submit" className="btn">Review before posting &rarr;</button>
          </div>
        </section>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Practice Library</div>
            <h3>PA-05 &middot; Case Consultation</h3>
            <p className="small">A structure for a concise question and a clear record of the advice you received.</p>
            <a className="btn secondary small-btn" href="/dashboard/documents/PA-05">View PA-05</a>
          </section>
        </aside>
      </form>
    </>
  );
}

// ---------- Detail / review ----------
export type ConsultDetail = {
  id: number;
  kind: string;
  question: string;
  context: string | null;
  typeLabel: string | null;
  tags: string[];
  status: string;
  mine: boolean;
  authorName: string;
  createdAt: string;
  audienceLabel: string;
  recipients: string[];
  responses: { id: number; name: string; body: string; type: string; useful: boolean; createdAt: string; avatarUrl: string | null }[];
};

export function ConsultDetailView({ c, ok, error, extra }: { c: ConsultDetail; ok?: string; error?: string; extra?: ReactNode }) {
  const isDraft = c.status === "draft";
  return (
    <>
      <PageHead
        eyebrow={isDraft ? "Consult / review before posting" : `Consult / ${c.tags.join(" · ") || "discussion"}`}
        title={c.question}
        lead={`${c.authorName} · ${new Date(c.createdAt).toLocaleDateString()} · ${c.audienceLabel}`}
        actions={<a className="btn secondary" href="/dashboard/consult">All discussions</a>}
      />
      <Banner ok={ok} error={error} />
      <div className="split">
        <div className="stack">
          {isDraft && c.mine && (
            <section className="card dark">
              <div className="eyebrow" style={{ color: "#e2c49c" }}>Review</div>
              <h3>Exactly who will see this</h3>
              <p className="small">{c.audienceLabel}{c.recipients.length ? `: ${c.recipients.join(", ")}` : ""}.</p>
              <p className="small">Check once more: no names, dates of birth, contact details or unusual combinations of details that could identify a patient.</p>
              <div className="row wrap">
                <form action={publishConsultAction} className="inline">
                  <input type="hidden" name="consultation_id" value={c.id} />
                  <button type="submit" className="btn" style={{ background: "#f7f5f0", color: "var(--forest)" }}>Post it</button>
                </form>
                <form action={discardDraftAction} className="inline">
                  <input type="hidden" name="consultation_id" value={c.id} />
                  <button type="submit" className="btn ghost" style={{ color: "#fff" }}>Discard</button>
                </form>
              </div>
            </section>
          )}
          <section className="card">
            <div className="row between">
              <div className="eyebrow">{c.typeLabel || (c.kind === "question" ? "Question" : c.kind === "supervision_request" ? "Supervision wanted" : "Supervision offered")}</div>
              <Status tone={c.status === "resolved" ? "neutral" : isDraft ? "warn" : ""}>{c.status === "resolved" ? "Resolved" : isDraft ? "Draft" : "Open"}</Status>
            </div>
            {c.context ? <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{c.context}</p> : <p className="small" style={{ marginTop: 10 }}>No further context.</p>}
            <div className="chip-row">{c.tags.map((t) => <a key={t} className="chip" href={`/dashboard/consult?tag=${encodeURIComponent(t)}`}>{t}</a>)}</div>
            {!isDraft && (
              <div style={{ marginTop: 10 }}>
                <ReportContent targetType="consultation" targetId={c.id} returnTo={`/dashboard/consult/${c.id}`} label={c.mine ? "Report patient information in this post" : "Report"} />
              </div>
            )}
          </section>

          {!isDraft && (
            <section className="card">
              <div className="card-title"><h3>{c.responses.length} repl{c.responses.length === 1 ? "y" : "ies"}</h3></div>
              {c.responses.map((r) => (
                <div key={r.id} className="item row" style={{ alignItems: "flex-start" }}>
                  <PersonAvatar name={r.name} url={r.avatarUrl} />
                  <div style={{ flex: 1 }}>
                    <div className="row between">
                      <strong>{r.name}{r.type === "clarifying_question" ? " · asked a clarifying question" : ""}</strong>
                      {c.mine && (
                        <form action={setResponseUsefulAction} className="inline">
                          <input type="hidden" name="consultation_id" value={c.id} />
                          <input type="hidden" name="response_id" value={r.id} />
                          <input type="hidden" name="useful" value={r.useful ? "false" : "true"} />
                          <button type="submit" className="plain-button small">{r.useful ? "✓ Useful" : "Mark useful"}</button>
                        </form>
                      )}
                    </div>
                    <p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="micro-note">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <ReportContent targetType="consultation_response" targetId={r.id} returnTo={`/dashboard/consult/${c.id}`} />
                    </div>
                  </div>
                </div>
              ))}
              {c.status !== "resolved" && (
                <form action={respondToConsultationAction} style={{ marginTop: 14 }}>
                  <input type="hidden" name="consultation_id" value={c.id} />
                  <label className="field">
                    {c.mine ? "Add to the discussion" : "Your reply"}
                    <textarea name="body" required maxLength={3000} placeholder="Share your thinking. No patient-identifying details." />
                  </label>
                  <div className="row between" style={{ marginTop: 10 }}>
                    <label className="checkline"><input type="checkbox" name="response_type" value="clarifying_question" /> This is a clarifying question</label>
                    <button type="submit" className="btn small-btn">Post reply</button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
        <aside className="stack">
          {c.mine && !isDraft && c.status !== "resolved" && (
            <section className="card">
              <h3>Got what you needed?</h3>
              <p className="small">Mark it resolved so it reads as closed. Mark the replies that helped; only you see that.</p>
              <form action={resolveConsultationAction}>
                <input type="hidden" name="consultation_id" value={c.id} />
                <button type="submit" className="btn secondary small-btn">Mark resolved</button>
              </form>
            </section>
          )}
          {extra}
          <section className="card tint">
            <div className="eyebrow">Practice Library</div>
            <h3>PA-05 &middot; Case Consultation</h3>
            <p className="small">Record the advice you received and your decision.</p>
            <a className="btn secondary small-btn" href="/dashboard/documents/PA-05">View PA-05</a>
          </section>
        </aside>
      </div>
    </>
  );
}
