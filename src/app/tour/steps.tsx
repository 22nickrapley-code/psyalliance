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
import { HomeView } from "../dashboard/home-view";
import { NetworkView, type Person } from "../dashboard/network/views";
import { ClinicianProfileView } from "../dashboard/people/[id]/view";
import { AV, leaveDates, type ChapterKey } from "./story";

// The guided tour: one fictional story, told on the real screens. It
// starts with the simple things (Alex's profile, home, circle, messages,
// the Library), then a referral and a consult, and ends with the bigger
// job: six weeks of parental leave, covered case by case. Every person,
// case and reply here is invented, and matches the sandbox seed.

export type Perspective = "alex" | "maya";
export type TourStep = {
  slug: string;
  chapter: ChapterKey;
  perspective: Perspective;
  title: string;
  what: string;
  render: () => ReactNode;
};

export const PEOPLE: Record<Perspective, { name: string; initials: string; role: string; avatar: string }> = {
  alex: { name: "Alex Rivers, PsyD", initials: "AR", role: "Clinical psychologist, Brooklyn. Planning six weeks of parental leave.", avatar: AV.alex },
  maya: { name: "Maya Chen, PsyD", initials: "MC", role: "Clinical psychologist, Brooklyn. One of Alex's trusted colleagues.", avatar: AV.maya },
};

const leave = leaveDates();
const PLAN_TITLE = "Parental leave, six weeks";

const options: NeedOptions = {
  focus: [
    { id: 1, value: "Anxiety/Panic Disorders" },
    { id: 2, value: "Trauma/PTSD" },
    { id: 3, value: "Depression" },
    { id: 4, value: "Obsessive/Compulsive Disorder" },
  ],
  insurance: [{ id: 10, value: "Aetna" }, { id: 11, value: "Cigna" }, { id: 12, value: "Empire BlueCross BlueShield" }],
  language: [{ id: 20, value: "Spanish" }, { id: 21, value: "Mandarin" }],
  ageBands: ["Children", "Adolescents", "Young Adults", "Adults", "Seniors"],
  states: US_STATES.filter((s) => ["NY", "NJ", "MA", "CT", "RI", "VT"].includes(s.code)),
  homeState: "NY",
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
const avatars = { maya: AV.maya, eli: AV.eli, imani: AV.imani, sam: AV.samuel, lena: AV.lena };

const coverMatches: Match[] = [
  person("maya", "Maya Chen", "trusted", ["Trauma/PTSD is her top specialty", "NY licence reviewed", "Sees adults, virtual or in person", "Open to cover, confirmed 3 days ago"]),
  person("eli", "Eli Ramirez", "worked_with", ["Works with trauma", "NY licence reviewed", "Psychiatrist: can prescribe", "Open to cover, confirmed 6 days ago"], "MD", "Manhattan", 6),
  person("imani", "Imani Brooks", "none", ["Trauma/PTSD is her top specialty", "NY licence reviewed", "Sees adults", "Availability confirmed 19 days ago"], "PhD", "Queens", 19),
];

const plan: PlanSummary = { id: 1, title: PLAN_TITLE, absenceType: "extended_leave", starts: leave.start, ends: leave.end, state: "NY", status: "active", counts: { total: 3, covered: 0, invited: 0, open: 3 } };

const casesOpen: CaseItem[] = [
  { id: 1, reference: "Case 1", focus: "Trauma/PTSD", details: ["Adults", "Virtual or in person", "Weekly"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 2, reference: "Case 2", focus: "Anxiety/Panic Disorders", details: ["Adolescents", "Virtual", "Weekly"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 3, reference: "Case 3", focus: "Depression", details: ["Adults", "In person", "Fortnightly", "Prescribing needed"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
];

const casesLater: CaseItem[] = [
  { ...casesOpen[0], status: "confirmed", invited: [{ name: "Maya Chen, PsyD", status: "accepted" }], assignedName: "Maya Chen, PsyD", assignedId: "maya" },
  { ...casesOpen[1], status: "confirmed", invited: [{ name: "Maya Chen, PsyD", status: "accepted" }], assignedName: "Maya Chen, PsyD", assignedId: "maya" },
  { ...casesOpen[2], status: "awaiting_response", invited: [{ name: "Eli Ramirez, MD", status: "sent" }], queueCount: 1 },
];

const referMatches: Match[] = [
  { ...person("maya", "Maya Chen", "trusted", ["OCD is one of her top specialties", "NY licence reviewed", "In network: Aetna", "Accepting referrals, confirmed 3 days ago"]), availabilityLabel: "Accepting referrals" },
  { ...person("sam", "Samuel Okafor", "worked_with", ["Treats OCD with ERP", "NY licence reviewed", "Evening telehealth", "Accepting referrals, confirmed 8 days ago"], "PhD", "Brooklyn", 8), availabilityLabel: "Accepting referrals" },
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

const people: Person[] = [
  { id: "maya", name: "Maya Chen, PsyD", qualification: "PsyD", city: "Brooklyn", state: "NY", licenceStates: ["NY"], topFocus: ["Trauma/PTSD", "Anxiety/Panic Disorders"], modalities: ["EMDR"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 3, psypact: false, avatarUrl: AV.maya, relationship: "trusted", saved: false },
  { id: "sam", name: "Samuel Okafor, PhD", qualification: "PhD", city: "Brooklyn", state: "NY", licenceStates: ["NY"], topFocus: ["Obsessive/Compulsive Disorder", "Anxiety/Panic Disorders"], modalities: ["Exposure and Response Prevention"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 8, psypact: false, avatarUrl: AV.samuel, relationship: "trusted", saved: false },
  { id: "eli", name: "Eli Ramirez, MD", qualification: "MD", city: "Manhattan", state: "NY", licenceStates: ["NY", "NJ"], topFocus: ["Depression", "Bipolar Disorder"], modalities: ["Medication management"], availability: "Selected referrals", fresh: true, confirmedDaysAgo: 6, psypact: false, avatarUrl: AV.eli, relationship: "worked_with", saved: false },
  { id: "imani", name: "Imani Brooks, PhD", qualification: "PhD", city: "Queens", state: "NY", licenceStates: ["NY"], topFocus: ["Pregnancy/Childbirth", "Anxiety/Panic Disorders"], modalities: ["CBT"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 1, psypact: false, avatarUrl: AV.imani, relationship: "pending_in", saved: false },
  { id: "lena", name: "Lena Park, PsyD", qualification: "PsyD", city: "Albany", state: "NY", licenceStates: ["NY"], topFocus: ["Obsessive/Compulsive Disorder", "Anxiety/Panic Disorders"], modalities: ["ERP"], availability: "Selected referrals", fresh: true, confirmedDaysAgo: 12, psypact: true, avatarUrl: AV.lena, relationship: "saved", saved: true },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const STEPS: TourStep[] = [
  // ---- Chapter 1: meet the practice ----
  {
    slug: "profile",
    chapter: "meet",
    perspective: "alex",
    title: "This is Alex",
    what: "Alex's profile as colleagues see it: licences on file, what the practice focuses on and whether Alex is taking referrals. Facts, not testimonials.",
    render: () => (
      <ClinicianProfileView
        p={{
          id: "alex",
          name: "Alex Rivers, PsyD",
          firstName: "Alex",
          role: "Clinical psychologist",
          where: "Brooklyn, NY",
          avatarUrl: AV.alex,
          bio: "I work with adults and adolescents living with anxiety, trauma and OCD, mostly CBT, ERP and EMDR. In person in Brooklyn and by telehealth across New York and New Jersey.",
          licenceStates: ["New York", "New Jersey"],
          psypact: true,
          boardCertified: false,
          availabilityChip: "Selected referrals",
          availabilityFresh: true,
          glance: [
            ["Primary service", "Psychotherapy and assessment"],
            ["Focus", "Anxiety/Panic Disorders · Trauma/PTSD · Obsessive/Compulsive Disorder"],
            ["Populations", "Adolescents, Young Adults, Adults"],
            ["Approaches", "Cognitive Behavioral Therapy (CBT), EMDR, Exposure and Response Prevention (ERP) +1"],
            ["Sessions", "Face to Face, Virtual"],
            ["Languages", "English, Spanish"],
            ["Insurance", "Aetna, Cigna, Self-pay (out of network)"],
          ],
          availability: [
            ["Referrals", "Selected referrals"],
            ["Cover", "Cover: ask me"],
            ["Consultation", "Open to consult"],
            ["Spaces for new patients", "About 2"],
          ],
          confirmed: "Confirmed 3 days ago",
          specialties: [],
          relationship: "Trusted colleague",
          status: "trusted",
          connectionId: 1,
          saved: false,
          excluded: false,
          collaborations: 3,
          signals: ["Worked with 3 members", "Covered for colleagues once", "Typically replies within a day"],
          primaryState: "NY",
        }}
      />
    ),
  },
  {
    slug: "home",
    chapter: "meet",
    perspective: "alex",
    title: "Alex's morning",
    what: "Home answers one question: what needs me now? An urgent cover request leads, then a referral that's ready to choose. Three at a time, the rest on the next page.",
    render: () => (
      <HomeView
        d={{
          firstName: "Alex",
          today: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }),
          greeting: "Good morning",
          steps: [
            { key: "c", title: "Aaron Garcia, DO asked you to cover 2 patients", detail: "Anxiety/Panic Disorders and Trauma/PTSD · Unexpected absence · NY · this week", href: "#", action: "Review request", urgent: true },
            { key: "r", title: "Your Obsessive/Compulsive Disorder referral is ready to choose", detail: "Everyone you asked has replied. 2 interested", href: "#", action: "Choose a colleague" },
            { key: "o", title: "3 referrals are waiting for your reply", detail: "Trauma/PTSD from Maya Chen · Anxiety/Panic Disorders from Eli Ramirez · Anxiety/Panic Disorders from Aaron Quinn", href: "#", action: "Review referrals" },
            { key: "i", title: "2 colleagues invited you to their trusted circle", detail: "Imani Brooks, Adrian Turner", href: "#", action: "Review" },
            { key: "m", title: "1 unread conversation", detail: "Messages from colleagues", href: "#", action: "Read" },
          ],
          gettingStarted: null,
          availability: { referrals: "Selected referrals", cover: "Cover: ask me", consult: "Open to consult", confirmedLabel: "Last confirmed 3 days ago", stale: false, canReconfirm: true },
          relevant: [
            { key: "1", title: "Cover request: Anxiety/Panic Disorders", detail: "From Aaron Garcia, DO", why: "Sent to you", href: "#" },
            { key: "2", title: "Referral: Trauma/PTSD + Stress", detail: "From Maya Chen, PsyD · NY", why: "From your trusted circle", href: "#" },
            { key: "3", title: "Referral: Anxiety/Panic Disorders + Life Transitions", detail: "From Eli Ramirez, MD · NY", why: "Sent to you", href: "#" },
          ],
          circle: {
            trusted: 7,
            saved: 5,
            workedWith: 3,
            newThisMonth: 1,
            recentlyAvailable: ["Maya Chen", "Samuel Okafor"],
            me: { initials: "AR", avatarUrl: AV.alex },
            nodes: [
              { id: "maya", name: "Maya Chen, PsyD", kind: "trusted", avatarUrl: AV.maya },
              { id: "sam", name: "Samuel Okafor, PhD", kind: "trusted", avatarUrl: AV.samuel },
              { id: "t3", name: "Aaron Garcia, DO", kind: "trusted", avatarUrl: null },
              { id: "t4", name: "Aaron Howard, PhD", kind: "trusted", avatarUrl: "/demo-avatars/m28.svg" },
              { id: "t5", name: "Adrian Dalton, PsyD", kind: "trusted", avatarUrl: "/demo-avatars/m34.svg" },
              { id: "t6", name: "Adrian Ramirez, PsyD", kind: "trusted", avatarUrl: null },
              { id: "t7", name: "Aaron Quinn, PsyD", kind: "trusted", avatarUrl: null },
              { id: "eli", name: "Eli Ramirez, MD", kind: "worked", avatarUrl: AV.eli },
              { id: "lena", name: "Lena Park, PsyD", kind: "saved", avatarUrl: AV.lena },
              { id: "noah", name: "Noah Patel, PsyD", kind: "saved", avatarUrl: AV.noah },
            ],
          },
          resources: [
            { code: "PA-02", title: "Extended Leave Coverage Plan & Clinical Handoff Pack", purpose: "Guidance and a handoff pack for your cover plan.", href: "#", provisional: true },
            { code: "PA-07", title: "Referral Outcome & Handoff Responsibilities", purpose: "Referral outcomes and handoff responsibilities.", href: "#", provisional: true },
          ],
          options,
        }}
      />
    ),
  },
  {
    slug: "network",
    chapter: "meet",
    perspective: "alex",
    title: "Alex's circle",
    what: "Trusted colleagues come first everywhere. Search by professional facts across 1,200 fictional clinicians in six states, with licence, focus and availability on every card.",
    render: () => (
      <NetworkView
        tab="directory"
        people={people}
        total={people.length}
        suggested={[]}
        suggestedAvatars={{}}
        invitations={[
          { id: 1, name: "Imani Brooks, PhD", profileId: "imani", where: "Queens, NY", avatarUrl: AV.imani },
          { id: 2, name: "Adrian Turner, PhD", profileId: "at", where: "Cherry Hill, NJ", avatarUrl: "/demo-avatars/m05.svg" },
        ]}
        sentCount={1}
        filters={{ q: "", focus: "", state: "NY", available: false, profession: "" }}
        focusOptions={options.focus.map((f) => f.value)}
        states={options.states}
        counts={{ directory: 1199, trusted: 7, saved: 5, worked: 3, suggested: 0 }}
        networkSize={1199}
      />
    ),
  },
  {
    slug: "messages",
    chapter: "meet",
    perspective: "alex",
    title: "Messages with context",
    what: "Every thread shows what it's about, and View context opens the plan or referral behind it. Maya has already offered to help with Alex's leave.",
    render: () => (
      <MessagesShell
        list={
          <ConversationList
            activeId={1}
            items={[
              { id: 1, title: "Maya Chen, PsyD", context: `Cover · ${PLAN_TITLE}`, preview: "A joint handover call the week before works for me.", when: "9:14 AM", unread: false, avatarName: "Maya Chen", avatarUrl: AV.maya },
              { id: 2, title: "Samuel Okafor, PhD", context: "Referral · Obsessive/Compulsive Disorder · Brooklyn", preview: "Happy to. I run ERP weekly.", when: "Yesterday", unread: false, avatarName: "Samuel Okafor", avatarUrl: AV.samuel },
              { id: 3, title: "Eli Ramirez, MD", context: "Referral · Trauma/PTSD · Manhattan", preview: "Needs someone soon; current clinician is relocating.", when: "Mon", unread: true, avatarName: "Eli Ramirez", avatarUrl: AV.eli },
            ]}
          />
        }
      >
        <section className="card message-area">
          <div className="context-head">
            <div>
              <h3 style={{ margin: 0 }}>Maya Chen, PsyD</h3>
              <span className="micro-note">Cover · {PLAN_TITLE} · View profile</span>
            </div>
            <a className="btn secondary small-btn" href="#">View context</a>
          </div>
          <div className="message-scroll">
            <div className="bubble">Congratulations again! I&rsquo;ve kept two cover slots free for {leave.range}. Send the plan over when it&rsquo;s ready.<small>Maya &middot; Yesterday, 4:10 PM</small></div>
            <div className="bubble me">Thank you. I&rsquo;ll set it up this week: three cases, no identifiers, and I&rsquo;ll use the PA-02 handoff pack.<small>You &middot; Yesterday, 4:25 PM</small></div>
            <div className="bubble">Perfect. A joint handover call the week before works for me.<small>Maya &middot; 9:14 AM</small></div>
          </div>
          <div className="message-compose">
            <textarea placeholder="Write a professional message..." aria-label="Message" />
            <button className="btn lg" type="button">Send</button>
          </div>
          <p className="micro-note" style={{ marginTop: 8 }}>No patient-identifying details. Clinical handoffs happen through your own secure channel.</p>
        </section>
      </MessagesShell>
    ),
  },
  {
    slug: "library",
    chapter: "meet",
    perspective: "alex",
    title: "The Practice Library",
    what: "Versioned templates placed where they're needed. PA-02, the leave plan and handoff pack, sits beside Cover, and every resource shows its review status plainly.",
    render: () => <ResourceDetailView r={pa02} url={null} />,
  },

  // ---- Chapter 2: refer and consult ----
  {
    slug: "refer",
    chapter: "refer",
    perspective: "alex",
    title: "A new enquiry Alex can't take",
    what: "An adult with OCD asks Alex for help, but Alex is about to go on leave. Alex describes the need, not the person, and PsyAlliance shortlists colleagues who fit, with reasons.",
    render: () => (
      <ReferShortlistView
        options={options}
        need={{ focusIds: [4], state: "NY", city: "Brooklyn", insurance: "Aetna", ageBand: "Adults", setting: "either", languageId: null, prescribing: false }}
        matches={referMatches}
        widen={[]}
        avatarUrls={avatars}
      />
    ),
  },
  {
    slug: "referral-replies",
    chapter: "refer",
    perspective: "alex",
    title: "Everyone replied: ready to choose",
    what: "Two colleagues are interested and one is full, so the referral is ready to choose. Alex picks Samuel, who they've worked with before, and the handoff starts.",
    render: () => (
      <ReferTrackView
        r={{
          id: 5,
          isMine: true,
          focus: "Obsessive/Compulsive Disorder",
          where: "Brooklyn, New York",
          status: "sent",
          audience: "selected",
          audienceCount: 3,
          timeframe: "within_month",
          notes: "Adult, ERP experience needed, evenings preferred.",
          createdAt: daysAgo(3),
          requesterName: "You",
          rows: [
            ["Where", "Brooklyn, New York"],
            ["Setting", "Virtual or in person"],
            ["Insurance", "Aetna"],
            ["Timeframe", "Within a month"],
            ["Audience", "Selected colleagues (3)"],
            ["Patient details shared", "None"],
          ],
          responses: [
            { profileId: "maya", name: "Maya Chen, PsyD", status: "interested", message: "I have a Tuesday evening opening from next week.", avatarUrl: AV.maya },
            { profileId: "sam", name: "Samuel Okafor, PhD", status: "interested", message: "Happy to. I run ERP weekly and can start in two weeks.", avatarUrl: AV.samuel },
            { profileId: "lena", name: "Lena Park, PsyD", status: "unavailable", message: "Full until January, sorry.", avatarUrl: AV.lena },
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
    chapter: "refer",
    perspective: "alex",
    title: "Alex asks the circle a question",
    what: "How do colleagues run the handover call when someone covers mid-treatment? Replies come from people Alex already trusts, and Alex marks what helped.",
    render: () => (
      <ConsultDetailView
        c={{
          id: 9,
          kind: "question",
          question: "How do you structure the handover call when a colleague covers mid-treatment?",
          context: "Six weeks of parental leave coming up. I want the transition to feel steady for clients without over-sharing.",
          typeLabel: "Termination and transfer",
          tags: ["Private practice"],
          status: "responses_received",
          mine: true,
          authorName: "You",
          createdAt: daysAgo(2),
          audienceLabel: "Trusted colleagues",
          recipients: [],
          responses: [
            { id: 1, name: "Maya Chen, PsyD", body: "A 20-minute joint call before leave starts, then a written summary. PA-02 has a checklist.", type: "reply", useful: true, createdAt: daysAgo(1), avatarUrl: AV.maya },
            { id: 2, name: "Eli Ramirez, MD", body: "Tell clients in writing who to contact and when. It's the ambiguity that unsettles people.", type: "reply", useful: false, createdAt: daysAgo(0.6), avatarUrl: AV.eli },
          ],
        }}
      />
    ),
  },

  // ---- Chapter 3: six weeks away, covered ----
  {
    slug: "plan",
    chapter: "cover",
    perspective: "alex",
    title: "Alex plans six weeks away",
    what: `A cover plan starts with the kind of absence, the dates (${leave.range}) and the state. Nothing about a client goes in; each case is described by need.`,
    render: () => <CoverPlanStepView options={options} />,
  },
  {
    slug: "matches",
    chapter: "cover",
    perspective: "alex",
    title: "Explained matches for each case",
    what: "For each case, PsyAlliance suggests colleagues with a reviewed New York licence, the right focus and recently confirmed availability, trusted colleagues first. Every suggestion says why.",
    render: () => <CoverCandidatesView plan={plan} cases={casesOpen} suggestions={{ 1: coverMatches, 2: coverMatches.slice(0, 2), 3: coverMatches.slice(1, 2) }} avatarUrls={avatars} />,
  },
  {
    slug: "invite",
    chapter: "cover",
    perspective: "alex",
    title: "Alex chooses who is asked, in order",
    what: "Alex picks colleagues per case and reviews exactly who receives each request before anything is sent. If the first person declines, the next is asked automatically.",
    render: () => (
      <CoverInviteView
        plan={plan}
        rows={[
          { caseId: 1, reference: "Case 1", focus: "Trauma/PTSD", picks: [{ id: "maya", name: "Maya Chen, PsyD" }, { id: "imani", name: "Imani Brooks, PhD" }] },
          { caseId: 2, reference: "Case 2", focus: "Anxiety/Panic Disorders", picks: [{ id: "maya", name: "Maya Chen, PsyD" }] },
          { caseId: 3, reference: "Case 3", focus: "Depression", picks: [{ id: "eli", name: "Eli Ramirez, MD" }] },
        ]}
      />
    ),
  },
  {
    slug: "respond",
    chapter: "cover",
    perspective: "maya",
    title: "Maya receives the request",
    what: "Now we switch to Maya. She sees how many patients, where, when and everything Alex filled in for each case, with no client details, and answers case by case.",
    render: () => (
      <CoverIndexView
        plans={[]}
        incoming={[
          {
            planId: 1,
            ownerId: "alex",
            ownerName: "Alex Rivers, PsyD",
            ownerRole: "Clinical psychologist · Brooklyn, NY",
            ownerAvatar: AV.alex,
            absence: "Extended leave",
            planTitle: PLAN_TITLE,
            dates: leave.range,
            length: "6 weeks",
            location: "Brooklyn, New York",
            outreach: "You are asked in turn; others follow if you decline",
            note: "Thank you for offering. Two cases below; a joint handover call the week before works for me.",
            urgent: false,
            sentAt: null,
            cases: [
              { requestId: 11, reference: "Case 1", focus: "Trauma/PTSD", details: [["Age band", "Adults"], ["Setting", "Virtual or in person"], ["Insurance", "Aetna"], ["Frequency", "Weekly"], ["Prescribing", "Not needed"]] },
              { requestId: 12, reference: "Case 2", focus: "Anxiety/Panic Disorders", details: [["Age band", "Adolescents"], ["Setting", "Virtual"], ["Insurance", "Self-pay (out of network)"], ["Frequency", "Weekly"], ["Prescribing", "Not needed"]] },
            ],
          },
        ]}
      />
    ),
  },
  {
    slug: "covered",
    chapter: "cover",
    perspective: "alex",
    title: "Back with Alex: two cases covered",
    what: "Maya accepted both. Each case shows who covers it; the third waits on Eli Ramirez, a psychiatrist, because it needs prescribing.",
    render: () => <CoverTrackView plan={{ ...plan, counts: { total: 3, covered: 2, invited: 1, open: 0 } }} cases={casesLater} nextSuggestion={{}} toRate={[]} />,
  },
];

export function stepIndex(slug: string) {
  return STEPS.findIndex((s) => s.slug === slug);
}
