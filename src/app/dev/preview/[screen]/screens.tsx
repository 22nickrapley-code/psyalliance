import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { US_STATES } from "@/lib/us-states";
import { HomeView } from "../../../dashboard/home-view";
import { ReferShortlistView, ReferReviewView, ReferIndexView, ReferTrackView } from "../../../dashboard/refer/views";
import { NetworkView } from "../../../dashboard/network/views";
import { ConsultIndexView, ConsultComposeView, ConsultDetailView } from "../../../dashboard/consult/views";
import { ConversationList, MessagesShell } from "../../../dashboard/messages/views";
import { CoverIndexView, CoverCandidatesView, CoverTrackView, CoverPlanStepView, CoverInviteView } from "../../../dashboard/cover/views";

// Illustrative fixtures for the dev-only preview. Not real members.
const options: NeedOptions = {
  focus: [
    { id: 1, value: "Anxiety" },
    { id: 2, value: "Trauma / PTSD" },
    { id: 3, value: "Depression" },
    { id: 4, value: "ADHD" },
  ],
  insurance: [{ id: 10, value: "AETNA Health, Inc." }, { id: 11, value: "CIGNA HealthCare (PPO)" }],
  language: [{ id: 20, value: "Spanish" }],
  ageBands: ["Children", "Adolescents", "Young Adults", "Adults", "Seniors"],
  states: US_STATES,
};

const m = (id: string, name: string, tier: Match["tier"], reasons: string[], q = "PsyD", city = "Brooklyn"): Match => ({
  profileId: id,
  fullName: name,
  credentialPrefix: "Dr.",
  qualification: q,
  city,
  state: "NY",
  avatarPath: null,
  score: 50,
  tier,
  freshness: "fresh",
  availabilityLabel: "Accepting referrals",
  confirmedDaysAgo: 3,
  reasons,
});
const matches: Match[] = [
  m("a", "Maya Chen", "trusted", ["Trusted colleague", "Trauma / PTSD is their top specialty", "Practises in Brooklyn", "NY licence on file", "In network: AETNA Health, Inc.", "Accepting referrals, confirmed 3 days ago"]),
  m("b", "Eli Ramirez", "worked_with", ["Worked together before", "Works with Trauma / PTSD", "NY licence on file", "Accepting referrals, confirmed 5 days ago"], "MD", "Manhattan"),
  m("c", "Imani Brooks", "none", ["Trauma / PTSD is their top specialty", "NY licence on file", "Sees adults", "Selected referrals only, not recently confirmed"]),
];
const need = { focusIds: [2], state: "NY", city: "Brooklyn", insurance: "AETNA Health, Inc.", ageBand: "Adults", setting: "either" as const, languageId: null, prescribing: false };
const plan = { id: 7, title: "October leave", absenceType: "extended_leave", starts: "2026-10-12", ends: "2026-11-20", state: "NY", status: "active", counts: { total: 4, covered: 2, invited: 1, open: 1 } };
const cases = [
  { id: 1, reference: "Case 1", focus: "Trauma / PTSD", details: ["Adults", "Virtual or in person", "Weekly"], status: "confirmed" as const, invited: [{ name: "Dr. Maya Chen", status: "accepted" }], assignedName: "Dr. Maya Chen", assignedId: "a", queueCount: 0 },
  { id: 2, reference: "Case 2", focus: "Anxiety", details: ["Adolescents", "Virtual", "Weekly"], status: "awaiting_response" as const, invited: [{ name: "Dr. Eli Ramirez", status: "sent" }], assignedName: null, assignedId: null, queueCount: 2 },
  { id: 3, reference: "Case 3", focus: "Depression", details: ["Adults", "In person", "Fortnightly", "Prescribing needed"], status: "needs_cover" as const, invited: [{ name: "Dr. Imani Brooks", status: "declined" }], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 4, reference: "Case 4", focus: "ADHD", details: ["Children", "Virtual"], status: "confirmed" as const, invited: [{ name: "Dr. Maya Chen", status: "accepted" }], assignedName: "Dr. Maya Chen", assignedId: "a", queueCount: 0 },
];

export const previewScreens: Record<string, () => ReactNode> = {
  home: () => (
    <HomeView
      d={{
        firstName: "Alex",
        steps: [
          { key: "1", title: "October leave has 1 unresolved need", detail: "2 of 4 covered", href: "#", action: "Review plan" },
          { key: "2", title: "2 colleagues replied to your referral", detail: "Trauma / PTSD", href: "#", action: "Review replies" },
          { key: "3", title: "Dr. Imani Brooks invited you to their trusted circle", detail: "A relationship request is waiting for your decision", href: "#", action: "Review" },
          { key: "4", title: "Confirm your availability", detail: "Last confirmed 34 days ago. Colleagues see it as stale", href: "#", action: "Update" },
        ],
        gettingStarted: null,
        availability: { referrals: "Selected referrals", cover: "Limited, ask me", consult: "Open to consult", confirmedLabel: "Last confirmed 34 days ago. Reconfirm to stay in suggestions", stale: true, canReconfirm: true },
        relevant: [
          { key: "r1", title: "Referral: Anxiety", detail: "From Dr. Eli Ramirez · NY", why: "From your trusted circle", href: "#" },
          { key: "r2", title: "Cover request: Depression", detail: "From Dr. Maya Chen", why: "Sent to you", href: "#" },
        ],
        circle: { trusted: 12, saved: 5, workedWith: 7, newThisMonth: 2, recentlyAvailable: ["Dr. Maya Chen", "Dr. Eli Ramirez"] },
        resources: [
          { code: "PA-02", title: "Extended Leave Coverage Plan & Clinical Handoff Pack", purpose: "Guidance and a handoff pack for your cover plan.", href: "#" },
          { code: "PA-05", title: "Case Consultation Presentation Template", purpose: "Shape a focused, de-identified case question.", href: "#" },
        ],
        options,
      }}
    />
  ),
  "refer-index": () => (
    <ReferIndexView
      options={options}
      mine={[{ id: 1, focus: "Trauma / PTSD", where: "Brooklyn, New York", status: "sent", createdAt: "2026-09-21", interested: 2, responses: 3, audience: "selected" }]}
      offered={[{ id: 2, focus: "Anxiety", where: "New York", status: "sent", createdAt: "2026-09-22", interested: 0, responses: 0, audience: "trusted", from: "Dr. Eli Ramirez", myResponse: null }]}
    />
  ),
  "refer-shortlist": () => <ReferShortlistView options={options} need={need} matches={matches} widen={[]} avatarUrls={{}} />,
  "refer-review": () => <ReferReviewView options={options} need={need} picked={[{ profileId: "a", name: "Dr. Maya Chen" }, { profileId: "b", name: "Dr. Eli Ramirez" }]} trustedCount={12} networkCount={148} />,
  "refer-track": () => (
    <ReferTrackView
      r={{
        id: 1, isMine: true, focus: "Trauma / PTSD", where: "Brooklyn, New York", status: "sent", audience: "selected", timeframe: "within_month", notes: "Prefers evening telehealth.", createdAt: "2026-09-21", requesterName: "You",
        rows: [["Where", "Brooklyn, New York"], ["Setting", "Either"], ["Timeframe", "Within a month"], ["Audience", "Selected colleagues (3)"], ["Patient details shared", "None"]],
        responses: [
          { profileId: "a", name: "Dr. Maya Chen", status: "interested", message: "I have two Tuesday evening openings.", avatarUrl: null },
          { profileId: "b", name: "Dr. Eli Ramirez", status: "question", message: "Is medication management needed?", avatarUrl: null },
          { profileId: "c", name: "Dr. Imani Brooks", status: "unavailable", message: null, avatarUrl: null },
        ],
        myResponse: null, chosen: null, rated: false,
      }}
    />
  ),
  network: () => (
    <NetworkView
      tab="directory"
      people={[
        { id: "a", name: "Dr. Maya Chen", qualification: "PsyD", city: "Brooklyn", state: "NY", licenceStates: ["NY"], topFocus: ["Trauma / PTSD", "Anxiety"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 2, psypact: true, avatarUrl: null, relationship: "trusted", saved: false },
        { id: "b", name: "Dr. Eli Ramirez", qualification: "MD", city: "Manhattan", state: "NY", licenceStates: ["NY", "NJ"], topFocus: ["Depression"], availability: "Selected referrals", fresh: false, confirmedDaysAgo: 41, psypact: false, avatarUrl: null, relationship: "none", saved: true },
      ]}
      suggested={[]}
      suggestedAvatars={{}}
      invitations={[{ id: 1, name: "Dr. Imani Brooks", profileId: "c" }]}
      sentCount={1}
      filters={{ q: "", focus: "", state: "", available: false, profession: "" }}
      focusOptions={["Anxiety", "Depression", "Trauma / PTSD"]}
      states={US_STATES}
      counts={{ directory: 2, trusted: 1, saved: 1, worked: 0, suggested: 0 }}
    />
  ),
  consult: () => (
    <ConsultIndexView
      tab="discussions"
      posts={[
        { id: 1, kind: "question", question: "How are you structuring a transition to a new covering clinician?", context: "A planned leave is approaching. I would welcome approaches to transition communication and clear role boundaries.", tags: ["Private practice"], audienceLabel: "Trusted colleagues", authorName: "Dr. Maya Chen", createdAt: new Date().toISOString(), replies: 3, status: "open", mine: false, why: "From your trusted circle" },
        { id: 2, kind: "question", question: "What helps your peer consultation group stay clinically focused?", context: null, tags: ["Supervision"], audienceLabel: "Verified network", authorName: "Dr. Imani Brooks", createdAt: new Date(Date.now() - 86400000).toISOString(), replies: 6, status: "resolved", mine: false },
      ]}
      tags={["Anxiety", "Trauma / PTSD", "Private practice", "Supervision"]}
      followed={["Anxiety"]}
      activeTag=""
      groups={[]}
      supervisors={[]}
      supervisorAvatars={{}}
    />
  ),
  "consult-new": () => <ConsultComposeView kind="question" areas={["Anxiety", "Depression"]} colleagues={[{ id: "a", name: "Dr. Maya Chen", relation: "Trusted" }]} groups={[{ id: 1, name: "Thursday Circle" }]} />,
  "consult-review": () => (
    <ConsultDetailView
      c={{ id: 3, kind: "question", question: "Approaches to a stalled treatment with adolescent anxiety?", context: "Twelve sessions in, avoidance persists despite exposure work. Looking for ideas on engagement.", typeLabel: "Treatment impasse", tags: ["Anxiety"], status: "draft", mine: true, authorName: "You", createdAt: new Date().toISOString(), audienceLabel: "Selected colleagues", recipients: ["Dr. Maya Chen", "Dr. Eli Ramirez"], responses: [] }}
    />
  ),
  messages: () => (
    <MessagesShell
      list={
        <ConversationList
          activeId={1}
          items={[
            { id: 1, title: "Dr. Maya Chen", context: "Cover \u00b7 October leave", preview: "I can review your coverage dates this week.", when: "9:14 AM", unread: true, avatarName: "Maya Chen", avatarUrl: null },
            { id: 2, title: "Dr. Eli Ramirez", context: "Referral \u00b7 Anxiety \u00b7 New York", preview: "Thanks, I have two openings.", when: "Sep 21", unread: false, avatarName: "Eli Ramirez", avatarUrl: null },
          ]}
        />
      }
    >
      <section className="card message-area">
        <div className="context-head"><div><h3 style={{ margin: 0 }}>Dr. Maya Chen</h3><span className="micro-note">Cover \u00b7 October leave</span></div></div>
        <div className="message-scroll">
          <div className="bubble">I can review your coverage dates this week.<small>Sep 23, 9:14 AM</small></div>
          <div className="bubble me">Thank you. I will send the non-identifying plan details for your review.<small>Sep 23, 9:20 AM</small></div>
        </div>
        <div className="message-compose" style={{ marginTop: 12 }}><textarea placeholder="Write a professional message." /><button className="btn">Send</button></div>
      </section>
    </MessagesShell>
  ),
  "cover-index": () => (
    <CoverIndexView
      plans={[plan, { ...plan, id: 8, title: "Conference week", absenceType: "short_planned", status: "draft", counts: { total: 1, covered: 0, invited: 0, open: 1 } }]}
      incoming={[{ requestId: 1, ownerId: "x", ownerName: "Dr. Maya Chen", planTitle: "Unexpected absence", dates: "Oct 3 – Oct 17", caseLabel: "Anxiety", details: ["Adults", "Virtual", "Weekly"], urgent: true }]}
    />
  ),
  "cover-plan": () => <CoverPlanStepView options={options} />,
  "cover-candidates": () => <CoverCandidatesView plan={{ ...plan, counts: { total: 2, covered: 0, invited: 0, open: 2 } }} cases={cases.slice(2).map((c) => ({ ...c, status: "needs_cover" as const }))} suggestions={{ 3: matches, 4: matches.slice(0, 1) }} avatarUrls={{}} />,
  "cover-invite": () => <CoverInviteView plan={plan} rows={[{ caseId: 3, reference: "Case 3", focus: "Depression", picks: [{ id: "b", name: "Dr. Eli Ramirez" }, { id: "c", name: "Dr. Imani Brooks" }] }]} />,
  "cover-track": () => <CoverTrackView plan={plan} cases={cases} nextSuggestion={{ 3: { id: "b", name: "Dr. Eli Ramirez" } }} toRate={[]} />,
};
