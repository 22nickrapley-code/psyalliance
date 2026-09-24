import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import type { LibraryResource } from "@/lib/library";
import { US_STATES } from "@/lib/us-states";
import { CoverIndexView, CoverCandidatesView, CoverTrackView, CoverPlanStepView, CoverInviteView, type CaseItem, type PlanSummary } from "../dashboard/cover/views";
import { ReferShortlistView, ReferTrackView } from "../dashboard/refer/views";
import { ConsultDetailView } from "../dashboard/consult/views";
import { ConversationList, MessagesShell } from "../dashboard/messages/views";
import { ResourceDetailView } from "../dashboard/documents/views";

// The guided tour: one fictional story, told on the real screens.
// Dr. Alex Rivers, a psychologist in Brooklyn, plans six weeks of leave,
// finds cover, refers a new enquiry, asks colleagues a question, agrees a
// handover and uses a Practice Library resource. Every person, case and
// reply here is invented.

export type Perspective = "alex" | "maya";
export type TourStep = {
  slug: string;
  perspective: Perspective;
  title: string;
  what: string;
  render: () => ReactNode;
};

export const PEOPLE: Record<Perspective, { name: string; initials: string; role: string }> = {
  alex: { name: "Dr. Alex Rivers", initials: "AR", role: "Psychologist (PsyD), Brooklyn. Planning parental leave." },
  maya: { name: "Dr. Maya Chen", initials: "MC", role: "Psychologist (PsyD), Brooklyn. One of Alex's trusted colleagues." },
};

const options: NeedOptions = {
  focus: [
    { id: 1, value: "Anxiety" },
    { id: 2, value: "Trauma / PTSD" },
    { id: 3, value: "Depression" },
    { id: 4, value: "OCD" },
  ],
  insurance: [{ id: 10, value: "Aetna" }, { id: 11, value: "Cigna" }],
  language: [{ id: 20, value: "Spanish" }],
  ageBands: ["Children", "Adolescents", "Young Adults", "Adults", "Seniors"],
  states: US_STATES,
};

const person = (id: string, name: string, tier: Match["tier"], reasons: string[], q = "PsyD", city = "Brooklyn", days = 3): Match => ({
  profileId: id,
  fullName: name,
  credentialPrefix: "Dr.",
  qualification: q,
  city,
  state: "NY",
  avatarPath: null,
  score: 50,
  tier,
  freshness: days <= 30 ? "fresh" : "stale",
  availabilityLabel: "Open to cover",
  confirmedDaysAgo: days,
  reasons,
});

const coverMatches: Match[] = [
  person("maya", "Maya Chen", "trusted", ["Trusted colleague", "Trauma / PTSD is her top specialty", "NY licence reviewed", "Sees adults, virtual or in person", "Open to cover, confirmed 3 days ago"]),
  person("eli", "Eli Ramirez", "worked_with", ["Worked together before", "Works with trauma", "NY licence reviewed", "Psychiatrist: can prescribe", "Open to cover, confirmed 6 days ago"], "MD", "Manhattan", 6),
  person("imani", "Imani Brooks", "none", ["Trauma / PTSD is her top specialty", "NY licence reviewed", "Sees adults", "Availability confirmed 19 days ago"], "PhD", "Queens", 19),
];

const plan: PlanSummary = { id: 1, title: "Parental leave, October", absenceType: "extended_leave", starts: "2026-10-12", ends: "2026-11-20", state: "NY", status: "active", counts: { total: 3, covered: 0, invited: 0, open: 3 } };

const casesOpen: CaseItem[] = [
  { id: 1, reference: "Case 1", focus: "Trauma / PTSD", details: ["Adults", "Virtual or in person", "Weekly"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 2, reference: "Case 2", focus: "Anxiety", details: ["Adolescents", "Virtual", "Weekly"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 3, reference: "Case 3", focus: "Depression", details: ["Adults", "In person", "Fortnightly", "Prescribing needed"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
];

const casesLater: CaseItem[] = [
  { ...casesOpen[0], status: "confirmed", invited: [{ name: "Dr. Maya Chen", status: "accepted" }], assignedName: "Dr. Maya Chen", assignedId: "maya" },
  { ...casesOpen[1], status: "confirmed", invited: [{ name: "Dr. Maya Chen", status: "accepted" }], assignedName: "Dr. Maya Chen", assignedId: "maya" },
  { ...casesOpen[2], status: "awaiting_response", invited: [{ name: "Dr. Eli Ramirez", status: "sent" }], queueCount: 1 },
];

const referMatches: Match[] = [
  { ...person("maya", "Maya Chen", "trusted", ["Trusted colleague", "OCD is one of her top specialties", "NY licence reviewed", "In network: Aetna", "Accepting referrals, confirmed 3 days ago"]), availabilityLabel: "Accepting referrals" },
  { ...person("sam", "Samuel Okafor", "worked_with", ["Worked together before", "Treats OCD with ERP", "NY licence reviewed", "Evening telehealth", "Accepting referrals, confirmed 8 days ago"], "PhD", "Brooklyn", 8), availabilityLabel: "Accepting referrals" },
  { ...person("lena", "Lena Park", "none", ["Works with OCD", "NY licence reviewed", "PSYPACT: telehealth across member states", "Selected referrals only"], "PsyD", "Albany", 12), availabilityLabel: "Selected referrals" },
];

const pa02: LibraryResource = {
  id: 2,
  code: "PA-02",
  title: "Extended Leave Coverage Plan & Clinical Handoff Pack",
  summary: "A leave plan, a per-client handoff summary without identifiers in PsyAlliance, and a return-to-practice checklist.",
  category: "Coverage & Continuity",
  audience: "Psychologists · Psychiatrists",
  tags: ["coverage", "leave", "handoff"],
  version: 1,
  reviewed: false,
  reviewDate: null,
  nextReviewDate: null,
  storagePath: "",
};

export const STEPS: TourStep[] = [
  {
    slug: "plan",
    perspective: "alex",
    title: "Alex plans six weeks away",
    what: "Alex starts a cover plan: the kind of absence, the dates and the state. Nothing about a client goes in; each case will be described by need.",
    render: () => <CoverPlanStepView options={options} />,
  },
  {
    slug: "matches",
    perspective: "alex",
    title: "Explained matches for each case",
    what: "For each case, PsyAlliance suggests colleagues with a reviewed licence in New York, the right focus and recently confirmed availability, trusted colleagues first. Every suggestion says why.",
    render: () => <CoverCandidatesView plan={plan} cases={casesOpen} suggestions={{ 1: coverMatches, 2: coverMatches.slice(0, 2), 3: coverMatches.slice(1, 2) }} avatarUrls={{}} />,
  },
  {
    slug: "invite",
    perspective: "alex",
    title: "Alex chooses who is asked, and in what order",
    what: "Alex picks colleagues per case and reviews exactly who receives each request before anything is sent. If the first person declines, the next is asked automatically.",
    render: () => (
      <CoverInviteView
        plan={plan}
        rows={[
          { caseId: 1, reference: "Case 1", focus: "Trauma / PTSD", picks: [{ id: "maya", name: "Dr. Maya Chen" }, { id: "imani", name: "Dr. Imani Brooks" }] },
          { caseId: 2, reference: "Case 2", focus: "Anxiety", picks: [{ id: "maya", name: "Dr. Maya Chen" }] },
          { caseId: 3, reference: "Case 3", focus: "Depression", picks: [{ id: "eli", name: "Dr. Eli Ramirez" }] },
        ]}
      />
    ),
  },
  {
    slug: "respond",
    perspective: "maya",
    title: "Maya receives the request",
    what: "Now we switch to Dr. Maya Chen. She sees the need, the dates and the setting, with no client details, and can accept, decline or ask to discuss first.",
    render: () => (
      <CoverIndexView
        plans={[]}
        incoming={[
          { requestId: 11, ownerId: "alex", ownerName: "Dr. Alex Rivers", planTitle: "Parental leave, October", dates: "Oct 12 – Nov 20", caseLabel: "Case 1 · Trauma / PTSD", details: ["Adults", "Virtual or in person", "Weekly"], urgent: false },
          { requestId: 12, ownerId: "alex", ownerName: "Dr. Alex Rivers", planTitle: "Parental leave, October", dates: "Oct 12 – Nov 20", caseLabel: "Case 2 · Anxiety", details: ["Adolescents", "Virtual", "Weekly"], urgent: false },
        ]}
      />
    ),
  },
  {
    slug: "covered",
    perspective: "alex",
    title: "Back with Alex: two cases covered",
    what: "Maya accepted both. Each case shows who covers it; the third is waiting on Dr. Eli Ramirez, a psychiatrist, because it needs prescribing.",
    render: () => <CoverTrackView plan={{ ...plan, counts: { total: 3, covered: 2, invited: 1, open: 0 } }} cases={casesLater} nextSuggestion={{}} toRate={[]} />,
  },
  {
    slug: "refer",
    perspective: "alex",
    title: "A new enquiry Alex can't take",
    what: "Before leave, a new client asks Alex for help with OCD. Alex describes the need, not the person, and PsyAlliance shortlists colleagues who fit, with reasons.",
    render: () => (
      <ReferShortlistView
        options={options}
        need={{ focusIds: [4], state: "NY", city: "Brooklyn", insurance: "Aetna", ageBand: "Adults", setting: "either", languageId: null, prescribing: false }}
        matches={referMatches}
        widen={[]}
        avatarUrls={{}}
      />
    ),
  },
  {
    slug: "referral-replies",
    perspective: "alex",
    title: "Replies come in, and Alex closes the loop",
    what: "Two colleagues are interested and one is full. Alex can compare replies, message either one and mark who took the referral.",
    render: () => (
      <ReferTrackView
        r={{
          id: 5,
          isMine: true,
          focus: "OCD",
          where: "Brooklyn, New York",
          status: "sent",
          audience: "selected",
          timeframe: "within_month",
          notes: "Adult, ERP experience needed, evenings preferred.",
          createdAt: "2026-09-21",
          requesterName: "You",
          rows: [
            ["Where", "Brooklyn, New York"],
            ["Setting", "Virtual or in person"],
            ["Timeframe", "Within a month"],
            ["Audience", "Selected colleagues (3)"],
            ["Client details shared", "None"],
          ],
          responses: [
            { profileId: "maya", name: "Dr. Maya Chen", status: "interested", message: "I have a Tuesday evening opening from next week.", avatarUrl: null },
            { profileId: "sam", name: "Dr. Samuel Okafor", status: "interested", message: "Happy to. I run ERP weekly and can start in two weeks.", avatarUrl: null },
            { profileId: "lena", name: "Dr. Lena Park", status: "unavailable", message: "Full until January.", avatarUrl: null },
          ],
          myResponse: null,
          chosen: null,
          rated: false,
        }}
      />
    ),
  },
  {
    slug: "consult",
    perspective: "alex",
    title: "Alex asks colleagues a question",
    what: "Alex asks the trusted circle how they handle the handover call. Replies arrive from people Alex already trusts, and Alex marks what helped.",
    render: () => (
      <ConsultDetailView
        c={{
          id: 9,
          kind: "question",
          question: "How do you structure the handover call when a colleague covers mid-treatment?",
          context: "Planning six weeks of leave and want the transition to feel steady for clients.",
          typeLabel: "Termination and transfer",
          tags: ["Private practice"],
          status: "responses_received",
          mine: true,
          authorName: "You",
          createdAt: "2026-09-20T15:00:00Z",
          audienceLabel: "Trusted colleagues",
          recipients: [],
          responses: [
            { id: 1, name: "Dr. Maya Chen", body: "A 20-minute joint call before leave starts, then a written summary. PA-02 has a checklist.", type: "reply", useful: true, createdAt: "2026-09-21T10:00:00Z", avatarUrl: null },
            { id: 2, name: "Dr. Eli Ramirez", body: "Tell clients in writing who to contact and when. It's the ambiguity that unsettles people.", type: "reply", useful: false, createdAt: "2026-09-21T16:00:00Z", avatarUrl: null },
          ],
        }}
      />
    ),
  },
  {
    slug: "messages",
    perspective: "alex",
    title: "Alex and Maya agree the handover",
    what: "Messages stay attached to the plan or referral they're about. The clinical handoff itself happens outside PsyAlliance, through their own secure channel.",
    render: () => (
      <MessagesShell
        list={
          <ConversationList
            activeId={1}
            items={[
              { id: 1, title: "Dr. Maya Chen", context: "Cover · Parental leave, October", preview: "Thursday at 9 works. I'll block the time.", when: "9:14 AM", unread: false, avatarName: "Maya Chen", avatarUrl: null },
              { id: 2, title: "Dr. Samuel Okafor", context: "Referral · OCD · Brooklyn", preview: "Thanks, I'll reach out to them this week.", when: "Sep 22", unread: false, avatarName: "Samuel Okafor", avatarUrl: null },
            ]}
          />
        }
      >
        <section className="card message-area">
          <div className="context-head">
            <div>
              <h3 style={{ margin: 0 }}>Dr. Maya Chen</h3>
              <span className="micro-note">Cover · Parental leave, October</span>
            </div>
          </div>
          <div className="message-scroll">
            <div className="bubble">Happy to take Cases 1 and 2. Can we do the handover call the week before you go?<small>Sep 22, 4:10 PM</small></div>
            <div className="bubble me">Yes please. Thursday 9 AM? I&rsquo;ll send the PA-02 summaries through our usual secure email.<small>Sep 22, 4:25 PM</small></div>
            <div className="bubble">Thursday at 9 works. I&rsquo;ll block the time.<small>Sep 23, 9:14 AM</small></div>
          </div>
          <div className="message-compose" style={{ marginTop: 12 }}>
            <textarea placeholder="Write a professional message." aria-label="Message" />
            <button className="btn" type="button">Send</button>
          </div>
        </section>
      </MessagesShell>
    ),
  },
  {
    slug: "library",
    perspective: "alex",
    title: "The resource that makes it easy",
    what: "PA-02, the leave plan and handoff pack, sits next to the cover plan. The Library shows plainly whether a template has been independently reviewed.",
    render: () => <ResourceDetailView r={pa02} url={null} />,
  },
];

export function stepIndex(slug: string) {
  return STEPS.findIndex((s) => s.slug === slug);
}
