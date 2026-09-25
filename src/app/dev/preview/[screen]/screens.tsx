import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { US_STATES } from "@/lib/us-states";
import { HomeView } from "../../../dashboard/home-view";
import { ReferShortlistView, ReferReviewView, ReferIndexView, ReferTrackView } from "../../../dashboard/refer/views";
import { NetworkView } from "../../../dashboard/network/views";
import { ConsultIndexView, ConsultComposeView, ConsultDetailView } from "../../../dashboard/consult/views";
import { ConversationList, MessagesShell } from "../../../dashboard/messages/views";
import { LibraryView, MyLibraryView, ResourceDetailView } from "../../../dashboard/documents/views";
import { AvailabilityView } from "../../../dashboard/availability/view";
import { CredentialsView } from "../../../dashboard/credentials/view";
import { ProfileView } from "../../../dashboard/profile/view";
import { SettingsView } from "../../../dashboard/settings/view";
import type { LibraryResource } from "@/lib/library";
import { CoverIndexView, CoverCandidatesView, CoverTrackView, CoverPlanStepView, CoverInviteView } from "../../../dashboard/cover/views";

// Illustrative fixtures for the dev-only preview. Not real members.
const options: NeedOptions = {
  focus: [
    { id: 1, value: "Anxiety" },
    { id: 2, value: "Trauma / PTSD" },
    { id: 3, value: "Depression" },
    { id: 4, value: "ADHD" },
  ],
  insurance: [{ id: 10, value: "Aetna" }, { id: 11, value: "Cigna" }],
  language: [{ id: 20, value: "Spanish" }],
  ageBands: ["Children", "Adolescents", "Young Adults", "Adults", "Seniors"],
  states: US_STATES,
  homeState: "NY",
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
  m("a", "Maya Chen", "trusted", ["Trusted colleague", "Trauma / PTSD is their top specialty", "Practises in Brooklyn", "NY licence on file", "In network: Aetna", "Accepting referrals, confirmed 3 days ago"]),
  m("b", "Eli Ramirez", "worked_with", ["Worked together before", "Works with Trauma / PTSD", "NY licence on file", "Accepting referrals, confirmed 5 days ago"], "MD", "Manhattan"),
  m("c", "Imani Brooks", "none", ["Trauma / PTSD is their top specialty", "NY licence on file", "Sees adults", "Selected referrals only, not recently confirmed"]),
];
const need = { focusIds: [2], state: "NY", city: "Brooklyn", insurance: "Aetna", ageBand: "Adults", setting: "either" as const, languageId: null, prescribing: false };
const plan = { id: 7, title: "October leave", absenceType: "extended_leave", starts: "2026-10-12", ends: "2026-11-20", state: "NY", status: "active", counts: { total: 4, covered: 2, invited: 1, open: 1 } };
const cases = [
  { id: 1, reference: "Case 1", focus: "Trauma / PTSD", details: ["Adults", "Virtual or in person", "Weekly"], status: "confirmed" as const, invited: [{ name: "Dr. Maya Chen", status: "accepted" }], assignedName: "Dr. Maya Chen", assignedId: "a", queueCount: 0 },
  { id: 2, reference: "Case 2", focus: "Anxiety", details: ["Adolescents", "Virtual", "Weekly"], status: "awaiting_response" as const, invited: [{ name: "Dr. Eli Ramirez", status: "sent" }], assignedName: null, assignedId: null, queueCount: 2 },
  { id: 3, reference: "Case 3", focus: "Depression", details: ["Adults", "In person", "Fortnightly", "Prescribing needed"], status: "needs_cover" as const, invited: [{ name: "Dr. Imani Brooks", status: "declined" }], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 4, reference: "Case 4", focus: "ADHD", details: ["Children", "Virtual"], status: "confirmed" as const, invited: [{ name: "Dr. Maya Chen", status: "accepted" }], assignedName: "Dr. Maya Chen", assignedId: "a", queueCount: 0 },
];


const res = (code: string, title: string, category: string, summary: string): LibraryResource => ({
  id: Number(code.slice(3)),
  code,
  title,
  summary,
  category,
  audience: "Psychologists · Psychiatrists",
  tags: ["coverage", "continuity of care", "handoff"],
  version: 1,
  reviewed: code === "PA-04",
  reviewDate: code === "PA-04" ? "2026-09-23" : null,
  nextReviewDate: "2027-09-23",
  storagePath: "",
});
const resources: LibraryResource[] = [
  res("PA-01", "Reciprocal Coverage Agreement", "Coverage & Continuity", "Two-clinician reciprocal coverage agreement with per-patient coverage summary and post-coverage debrief."),
  res("PA-02", "Extended Leave Coverage Plan & Clinical Handoff Pack", "Coverage & Continuity", "Step-by-step plan and letter templates for stepping away from practice for more than two weeks without stranding patients."),
  res("PA-05", "Case Consultation Presentation Template", "Consultation & Collaboration", "De-identified case presentation form, de-identification checklist, ethics decision steps and consultation response sheet."),
  res("PA-09", "Informed Consent for Psychotherapy (Adult)", "Clinical Practice", "Adult psychotherapy informed consent with optional modules for couples/family, minors, assessment and group."),
];
const lookups = [
  ...["Anxiety", "Depression", "Trauma / PTSD", "ADHD", "OCD", "Grief", "Couples", "Eating concerns"].map((v, i) => ({ id: 100 + i, category: "treatment_specialism", value: v })),
  ...["CBT", "DBT", "EMDR", "ACT", "Psychodynamic"].map((v, i) => ({ id: 200 + i, category: "treatment_modality", value: v })),
  ...["Children", "Adolescents", "Adults", "Seniors"].map((v, i) => ({ id: 300 + i, category: "age_group_specialism", value: v })),
  ...["Telehealth", "In person"].map((v, i) => ({ id: 400 + i, category: "session_type", value: v })),
  ...["Aetna", "Cigna"].map((v, i) => ({ id: 500 + i, category: "insurance", value: v })),
  ...["English", "Spanish"].map((v, i) => ({ id: 600 + i, category: "language", value: v })),
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
        { id: "a", name: "Maya Chen, PsyD", qualification: "PsyD", city: "Brooklyn", state: "NY", licenceStates: ["NY"], topFocus: ["Trauma / PTSD", "Anxiety"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 2, psypact: true, avatarUrl: null, relationship: "trusted", saved: false },
        { id: "b", name: "Eli Ramirez, MD", qualification: "MD", city: "Manhattan", state: "NY", licenceStates: ["NY", "NJ"], topFocus: ["Depression"], availability: "Selected referrals", fresh: false, confirmedDaysAgo: 41, psypact: false, avatarUrl: null, relationship: "none", saved: true },
      ]}
      suggested={[]}
      suggestedAvatars={{}}
      invitations={[{ id: 1, name: "Imani Brooks, PhD", profileId: "c", where: "Queens, NY", avatarUrl: null }]}
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
      incoming={[
        {
          planId: 1,
          ownerId: "x",
          ownerName: "Maya Chen, PsyD",
          ownerRole: "Clinical psychologist · Brooklyn, NY",
          ownerAvatar: null,
          absence: "Unexpected absence",
          planTitle: "Unexpected absence",
          dates: "Oct 3 to Oct 17",
          length: "2 weeks",
          location: "Brooklyn, New York",
          outreach: "Asked of several colleagues at once",
          note: "Family emergency. Could you hold two sessions?",
          urgent: true,
          sentAt: null,
          cases: [{ requestId: 1, reference: "Case 1", focus: "Anxiety", details: [["Age band", "Adults"], ["Setting", "Virtual"], ["Frequency", "Weekly"]] }],
        },
      ]}
    />
  ),
  "cover-plan": () => <CoverPlanStepView options={options} />,
  "cover-candidates": () => <CoverCandidatesView plan={{ ...plan, counts: { total: 2, covered: 0, invited: 0, open: 2 } }} cases={cases.slice(2).map((c) => ({ ...c, status: "needs_cover" as const }))} suggestions={{ 3: matches, 4: matches.slice(0, 1) }} avatarUrls={{}} />,
  "cover-invite": () => <CoverInviteView plan={plan} rows={[{ caseId: 3, reference: "Case 3", focus: "Depression", picks: [{ id: "b", name: "Dr. Eli Ramirez" }, { id: "c", name: "Dr. Imani Brooks" }] }]} />,
  "cover-track": () => <CoverTrackView plan={plan} cases={cases} nextSuggestion={{ 3: { id: "b", name: "Dr. Eli Ramirez" } }} toRate={[]} />,
  library: () => <LibraryView resources={resources} q="" category="" mineCount={2} />,
  "library-mine": () => (
    <MyLibraryView
      docs={[{ id: 1, title: "PA-02: Extended Leave Coverage Plan (working copy)", storagePath: "", folderId: null, createdAt: "2026-09-20T10:00:00Z", source: "Working copy of PA-02, version 1", url: "#" }]}
      folders={[{ id: 1, name: "Leave planning" }]}
      folder="all"
      folderCounts={{ unfiled: 1 }}
      total={1}
      notice="Working copy of PA-02 saved. Only you can see it."
    />
  ),
  resource: () => <ResourceDetailView r={resources[1]} url="#" />,
  availability: () => (
    <AvailabilityView
      p={{ referral_availability: "limited", coverage_availability: "ask_me", consultation_availability: "yes", availability_confirmed_at: new Date(Date.now() - 34 * 86400000).toISOString(), approx_spaces: 3, availability_paused_until: null }}
      sp={{}}
    />
  ),
  "availability-new": () => <AvailabilityView p={{ referral_availability: null, coverage_availability: null, consultation_availability: null, availability_confirmed_at: null, approx_spaces: null, availability_paused_until: null }} sp={{}} />,
  credentials: () => (
    <CredentialsView
      sp={{ added: "licence" }}
      profile={{ verification_status: "verified", verified_at: "2026-09-01T10:00:00Z", account_status: "active", qualification_level: "PsyD", npi_number: "1234567890", caqh_provider_id: null, caqh_last_attested_date: "2026-06-10", malpractice_carrier: "The Trust", malpractice_expires: "2026-11-01" }}
      licences={[
        { id: 1, state: "NY", license_number: "019283", license_type: "Licensed Psychologist", expiration_date: "2027-08-31", status: "active", reviewed_at: "2026-09-02T10:00:00Z" },
        { id: 2, state: "NJ", license_number: "35SI00123", license_type: "Licensed Psychologist", expiration_date: "2026-12-01", status: "active", reviewed_at: null },
      ]}
      ce={[{ id: 1, title: "Ethics in telehealth", provider: "APA", hours: 3, completed_date: "2026-05-12" }]}
      panels={[]}
      npiChecks={[{ matched: true, flagged_reason: null, created_at: "2026-09-01" }]}
    />
  ),
  profile: () => (
    <ProfileView
      sp={{}}
      profile={{ full_name: "Alex Rivers", credential_prefix: "Dr.", qualification_level: "PsyD", primary_practice_city: "Brooklyn", primary_state: "NY", bio: "I work with adults and adolescents with anxiety and trauma, mostly CBT and EMDR, in person in Brooklyn and by telehealth across New York.", referral_availability: "limited", availability_confirmed_at: new Date().toISOString(), psypact_participating: true, avatar_path: null }}
      lookups={lookups}
      selectedRows={[{ lookup_value_id: 102, rank: 1 }, { lookup_value_id: 100, rank: 2 }, { lookup_value_id: 101, rank: 3 }, { lookup_value_id: 200, rank: null }, { lookup_value_id: 302, rank: null }, { lookup_value_id: 600, rank: null }]}
      licenceCount={1}
      avatarUrl={null}
      me="me"
    />
  ),
  settings: () => (
    <SettingsView
      sp={{}}
      email="alex@riverspsych.com"
      me="me"
      prefs={null}
      profile={{ directory_visible: true }}
      emergency={null}
      excluded={[]}
      blocked={[]}
      blockedProfiles={[]}
      circle={[{ id: "a", full_name: "Maya Chen", credential_prefix: "Dr." }]}
    />
  ),
};
