import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { US_STATES } from "@/lib/us-states";
import { CoverIndexView, CoverCandidatesView, CoverTrackView, CoverPlanStepView, CoverNeedsView, CoverInviteView, type CaseItem, type PlanSummary } from "../dashboard/cover/views";
import { ReferIndexView, ReferShortlistView, ReferReviewView, ReferTrackView } from "../dashboard/refer/views";
import { ConsultComposeView, ConsultDetailView } from "../dashboard/consult/views";
import { ConversationList, MessagesShell } from "../dashboard/messages/views";
import { HomeView } from "../dashboard/home-view";
import { MessageReactions } from "../dashboard/messages/reactions";
import type { SceneAction } from "./scene-timing";
import { CliniciansView, type Person } from "../dashboard/clinicians/views";
import { NetworkView } from "../dashboard/network/views";
import { ClinicianProfileView, type ClinicianProfile } from "../dashboard/people/[id]/view";
import { CredentialsView } from "../dashboard/credentials/view";
import { AvailabilityView } from "../dashboard/availability/view";
import { LibraryView, ResourceDetailView, MyLibraryView } from "../dashboard/documents/views";
import type { LibraryResource } from "@/lib/library";
import { HANDOFF_RULE } from "../dashboard/_components/ui";
import { ProfileView } from "../dashboard/profile/view";
import type { ImportDemo } from "../dashboard/profile/bio-import";
import { REAL_SITE_URL } from "@/lib/env";
import { AV, leaveDates } from "./story";

// The demo library: six short demos, each one job done start to finish on
// the real screens with fictional data. Every person, client and reply is
// invented and matches the sandbox seed. Demos never repeat each other.

export type Perspective = "alex" | "maya" | "samuel";
export type DemoStep = {
  slug: string;
  perspective: Perspective;
  title: string;
  what: string;
  // The one action this screen is about: matched against the start of a
  // button or link's text on the screen (the nth match, if several).
  focus?: string;
  focusIndex?: number;
  focusNote?: string;
  // In the videos: what the person does on this screen before that last
  // click (one to three choices). The screen starts without them.
  actions?: SceneAction[];
  render: () => ReactNode;
};
export type Demo = {
  key: string;
  title: string;
  blurb: string;
  minutes: string;
  outcome: string;
  learned: string[];
  steps: DemoStep[];
};

export const PEOPLE: Record<Perspective, { name: string; initials: string; role: string; avatar: string | null; colleague: boolean }> = {
  alex: { name: "You", initials: "You", role: "A psychologist in private practice in Brooklyn", avatar: AV.alex, colleague: false },
  maya: { name: "Maya Calderwick, PsyD", initials: "MC", role: "One of your trusted colleagues", avatar: AV.maya, colleague: true },
  samuel: { name: "Samuel Brindlemoor, PhD", initials: "SB", role: "A colleague you've worked with before", avatar: AV.samuel, colleague: true },
};

const leave = leaveDates();
const PLAN_TITLE = "Parental leave, six weeks";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const options: NeedOptions = {
  focus: [
    { id: 1, value: "Anxiety/Panic Disorders" },
    { id: 2, value: "Trauma/PTSD" },
    { id: 3, value: "Depression" },
    { id: 4, value: "Obsessive/Compulsive Disorder" },
    { id: 5, value: "Bipolar Disorder" },
    { id: 6, value: "Eating Disorders" },
    { id: 7, value: "Grief/Loss" },
    { id: 8, value: "Life Transitions" },
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

// ---- Cover fixtures ----
const plan: PlanSummary = { id: 1, title: PLAN_TITLE, absenceType: "extended_leave", starts: leave.start, ends: leave.end, state: "NY", status: "active", counts: { total: 3, covered: 0, invited: 0, open: 3 } };

const clientsOpen: CaseItem[] = [
  { id: 1, reference: "Client 1", focus: "Trauma/PTSD", details: ["Adults", "Virtual or in person", "Weekly"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 2, reference: "Client 2", focus: "Anxiety/Panic Disorders", details: ["Adolescents", "Virtual", "Weekly"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
  { id: 3, reference: "Client 3", focus: "Depression", details: ["Adults", "In person", "Every two weeks", "Prescribing needed"], status: "needs_cover", invited: [], assignedName: null, assignedId: null, queueCount: 0 },
];
const clientsCovered: CaseItem[] = [
  { ...clientsOpen[0], status: "confirmed", invited: [{ name: "Maya Calderwick, PsyD", status: "accepted" }], assignedName: "Maya Calderwick, PsyD", assignedId: "maya" },
  { ...clientsOpen[1], status: "confirmed", invited: [{ name: "Maya Calderwick, PsyD", status: "accepted" }], assignedName: "Maya Calderwick, PsyD", assignedId: "maya" },
  { ...clientsOpen[2], status: "confirmed", invited: [{ name: "Eli Kestrelby, MD", status: "accepted" }], assignedName: "Eli Kestrelby, MD", assignedId: "eli" },
];

const MAYA_TRAUMA = ["Trauma/PTSD is her top specialty", "NY license reviewed", "Sees adults, virtual or in person", "Open to cover, confirmed 3 days ago"];
const MAYA_ANX = ["Anxiety is one of her top specialties", "NY license reviewed", "Sees adolescents, virtual", "Open to cover, confirmed 3 days ago"];
const IMANI = ["Trauma/PTSD is her top specialty", "NY license reviewed", "Sees adults", "Availability confirmed 19 days ago"];
const ELI = ["Psychiatrist: can prescribe", "Treats depression", "NY license reviewed", "Sees adults in person, Manhattan", "Open to cover, confirmed 6 days ago"];

const coverSuggestions = {
  1: [person("maya", "Maya Calderwick", "trusted", MAYA_TRAUMA), person("imani", "Imani Ambershaw", "none", IMANI, "PhD", "Queens", 19)],
  2: [person("maya", "Maya Calderwick", "trusted", MAYA_ANX)],
  3: [person("eli", "Eli Kestrelby", "worked_with", ELI, "MD", "Manhattan", 6)],
};

// ---- Refer fixtures ----
const referNeed = { focusIds: [4], state: "NY", city: "Brooklyn", insurance: "Aetna", ageBand: "Adults", setting: "either", languageId: null, prescribing: false } as const;
const referMatches: Match[] = [
  { ...person("maya", "Maya Calderwick", "trusted", ["OCD is one of her top specialties", "NY license reviewed", "In network: Aetna", "Accepting referrals, confirmed 3 days ago"]), availabilityLabel: "Accepting referrals" },
  { ...person("sam", "Samuel Brindlemoor", "worked_with", ["Treats OCD with ERP", "NY license reviewed", "Evening telehealth", "Accepting referrals, confirmed 8 days ago"], "PhD", "Brooklyn", 8), availabilityLabel: "Accepting referrals" },
  { ...person("lena", "Lena Larkhollow", "none", ["Works with OCD", "NY license reviewed", "In person in Albany, telehealth across New York", "Selected referrals only"], "PsyD", "Albany", 12), availabilityLabel: "Selected referrals" },
];
const referralRows: [string, string][] = [
  ["Where", "Brooklyn, New York"],
  ["Setting", "Virtual or in person"],
  ["Insurance", "Aetna"],
  ["Age band", "Adults"],
  ["Timeframe", "Within a month"],
  ["Client details shared", "None"],
];

// ---- Home and circle fixtures ----
// The invite box as you see it (your own link; display only in the demo).
const DEMO_INVITE = { link: `${REAL_SITE_URL}/i/7d3e91c0a2b4`, mode: "member" as const, firstName: "", fullName: "Your Name, PsyD" };
const ALEX_CIRCLE = {
  me: { initials: "AT", avatarUrl: AV.alex as string | null },
  nodes: [
    { id: "maya", name: "Maya Calderwick, PsyD", kind: "trusted", avatarUrl: AV.maya },
    { id: "sam", name: "Samuel Brindlemoor, PhD", kind: "trusted", avatarUrl: AV.samuel },
    { id: "t3", name: "Aaron Glenmarrow, DO", kind: "trusted", avatarUrl: null },
    { id: "t4", name: "Aaron Hollisford, PhD", kind: "trusted", avatarUrl: null },
    { id: "t5", name: "Adrian Ivorwick, PsyD", kind: "trusted", avatarUrl: null },
    { id: "t6", name: "Adrian Kestrelby, PsyD", kind: "trusted", avatarUrl: null },
    { id: "t7", name: "Aaron Kellingsby, PsyD", kind: "trusted", avatarUrl: null },
    { id: "eli", name: "Eli Kestrelby, MD", kind: "worked", avatarUrl: AV.eli },
    { id: "lena", name: "Lena Larkhollow, PsyD", kind: "suggested", avatarUrl: AV.lena },
    { id: "noah", name: "Noah Wrenmoor, PsyD", kind: "suggested", avatarUrl: AV.noah },
  ] as { id: string; name: string; kind: "trusted" | "worked" | "suggested"; avatarUrl: string | null }[],
};
const ALEX_SUGGESTIONS = ALEX_CIRCLE.nodes.map((n) => ({
  id: n.id,
  name: n.name,
  avatarUrl: n.avatarUrl,
  where: n.id === "maya" ? "Brooklyn, NY" : "New York",
  group: (n.kind === "trusted" ? "trusted" : n.kind === "worked" ? "worked" : "network") as "trusted" | "worked" | "network",
  reason: n.kind === "trusted" ? "Trusted colleague" : n.kind === "worked" ? "Worked with before" : "Fits your practice",
  focus: [] as string[],
  trusted: n.kind === "trusted",
}));
const people: Person[] = [
  { id: "maya", name: "Maya Calderwick, PsyD", qualification: "PsyD", city: "Brooklyn", state: "NY", licenceStates: ["NY"], topFocus: ["Trauma/PTSD", "Anxiety/Panic Disorders"], modalities: ["EMDR"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 3, psypact: false, avatarUrl: AV.maya, relationship: "trusted" },
  { id: "sam", name: "Samuel Brindlemoor, PhD", qualification: "PhD", city: "Brooklyn", state: "NY", licenceStates: ["NY"], topFocus: ["Obsessive/Compulsive Disorder", "Anxiety/Panic Disorders"], modalities: ["Exposure and Response Prevention"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 8, psypact: false, avatarUrl: AV.samuel, relationship: "trusted" },
  { id: "eli", name: "Eli Kestrelby, MD", qualification: "MD", city: "Manhattan", state: "NY", licenceStates: ["NY", "NJ"], topFocus: ["Depression", "Bipolar Disorder"], modalities: ["Medication management"], availability: "Selected referrals", fresh: true, confirmedDaysAgo: 6, psypact: false, avatarUrl: AV.eli, relationship: "worked_with" },
  { id: "imani", name: "Imani Ambershaw, PhD", qualification: "PhD", city: "Queens", state: "NY", licenceStates: ["NY"], topFocus: ["Pregnancy/Childbirth", "Anxiety/Panic Disorders"], modalities: ["CBT"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 1, psypact: false, avatarUrl: AV.imani, relationship: "none" },
  { id: "lena", name: "Lena Larkhollow, PsyD", qualification: "PsyD", city: "Albany", state: "NY", licenceStates: ["NY"], topFocus: ["Obsessive/Compulsive Disorder", "Anxiety/Panic Disorders"], modalities: ["ERP"], availability: "Selected referrals", fresh: true, confirmedDaysAgo: 12, psypact: false, avatarUrl: AV.lena, relationship: "none" },
  { id: "noah", name: "Noah Wrenmoor, PsyD", qualification: "PsyD", city: "Princeton", state: "NJ", licenceStates: ["NJ"], topFocus: ["Obsessive/Compulsive Disorder", "Depression"], modalities: ["ERP"], availability: "Accepting referrals", fresh: true, confirmedDaysAgo: 9, psypact: true, avatarUrl: AV.noah, relationship: "none" },
];

const profileBase = {
  licenceStates: ["New York"],
  psypact: false,
  boardCertified: false,
  availabilityFresh: true,
  specialties: [] as string[],
  excluded: false,
  primaryState: "NY",
};

const mayaProfile: ClinicianProfile = {
  ...profileBase,
  id: "maya",
  name: "Maya Calderwick, PsyD",
  firstName: "Maya",
  role: "Clinical psychologist",
  where: "Brooklyn, NY",
  avatarUrl: AV.maya,
  bio: "Adults and adolescents with trauma and anxiety. EMDR and CBT, in person in Brooklyn and by telehealth across New York.",
  availabilityChip: "Accepting referrals",
  glance: [
    ["Primary service", "Psychotherapy and assessment"],
    ["Focus", "Trauma/PTSD · Anxiety/Panic Disorders · Grief/Loss"],
    ["Populations", "Adolescents, Young Adults, Adults"],
    ["Approaches", "EMDR, Cognitive Behavioral Therapy (CBT)"],
    ["Sessions", "Face to Face, Virtual"],
    ["Insurance", "Aetna, Cigna, Self-pay (out of network)"],
  ],
  availability: [
    ["Referrals", "Accepting referrals"],
    ["Cover", "Open to cover"],
    ["Consultation", "Open to consult"],
    ["Supervision", "Open to supervise"],
  ],
  confirmed: "Confirmed 3 days ago",
  relationship: "Trusted colleague",
  trusted: true,
  trustsMe: true,
  since: "March 2026",
  collaborations: 3,
  signals: ["Worked with you 3 times", "Covered for colleagues twice", "Typically replies within a day"],
};

// The Practice Library demo uses the real titles, summaries and contents.
const libDoc = (code: string, title: string, summary: string, contents: string[]): LibraryResource => ({
  id: Number(code.slice(3)),
  code,
  title,
  summary,
  category: "Coverage & Continuity",
  audience: "Psychologists · Psychiatrists",
  tags: ["leave", "coverage", "continuity of care"],
  version: 1,
  reviewed: false,
  reviewDate: null,
  nextReviewDate: null,
  storagePath: "",
  contents,
});
const LIB_PA02 = libDoc(
  "PA-02",
  "Extended Leave Coverage Plan & Clinical Handoff Pack",
  "Step-by-step plan and letter templates for stepping away from practice for more than two weeks without stranding patients.",
  ["Step-by-step plan for leave of more than two weeks", "Client notification letter templates", "Clinical handoff summary for each client", "Return-to-practice checklist"],
);
const LIB_LEAVE: LibraryResource[] = [
  libDoc("PA-01", "Reciprocal Coverage Agreement", "Two-clinician reciprocal coverage agreement with per-patient coverage summary and post-coverage debrief.", []),
  LIB_PA02,
  libDoc("PA-03", "Professional Will & Practice Succession Plan", "Professional will template, practice continuity inventory, executor acceptance and consent-form language.", []),
];


// ---- Profile fixtures: you setting up, and your profile today ----
const PROFILE_LOOKUPS = [
  ...["Anxiety/Panic Disorders", "Trauma/PTSD", "Obsessive/Compulsive Disorder", "Depression", "Grief/Loss", "Life Transitions", "Eating Disorders", "Bipolar Disorder", "Couples"].map((value, i) => ({ id: 700 + i, category: "treatment_specialism", value })),
  ...["Cognitive Behavioral Therapy (CBT)", "EMDR", "Exposure and Response Prevention (ERP)", "Acceptance and Commitment Therapy (ACT)", "Psychodynamic"].map((value, i) => ({ id: 720 + i, category: "treatment_modality", value })),
  ...["Children", "Adolescents", "Young Adults", "Adults", "Older Adults"].map((value, i) => ({ id: 740 + i, category: "age_group_specialism", value })),
  ...["Face to Face", "Virtual"].map((value, i) => ({ id: 760 + i, category: "session_type", value })),
  ...["Aetna", "Cigna", "Empire BlueCross BlueShield", "Self-pay (out of network)"].map((value, i) => ({ id: 780 + i, category: "insurance", value })),
  ...["English", "Spanish"].map((value, i) => ({ id: 800 + i, category: "language", value })),
];
// What the pasted profile ticks: six specialties (top three ranked), three
// approaches, two age groups, both session types, three insurers, Spanish.
const SETUP_TICKS = [700, 701, 702, 703, 704, 705, 720, 721, 722, 741, 743, 760, 761, 780, 781, 783, 801];
const SETUP_RANKS: Record<number, number> = { 700: 1, 701: 2, 702: 3 };
const SETUP_ROWS = SETUP_TICKS.map((id) => ({ lookup_value_id: id, rank: SETUP_RANKS[id] ?? null }));
const ALEX_SIGNUP = { full_name: "Your Name", qualification_level: "PsyD", primary_state: "NY", avatar_path: null };
const ALEX_BIO =
  "I work with adults and adolescents living with anxiety, trauma and OCD, using CBT, exposure and response prevention and EMDR. In person in Park Slope and by telehealth across New York and New Jersey.";
const ALEX_FILLED = { ...ALEX_SIGNUP, credential_prefix: "Dr", primary_practice_city: "Brooklyn", bio: ALEX_BIO };
// A profile page as you copy it (all invented; the numbers are fictional).
const PASTED_PROFILE = `Your Name
Psychologist, PsyD
Brooklyn, NY 11215
(718) 555-0136

Feeling stuck in worry, or still carrying something that happened years ago? I work with adults and adolescents living with anxiety, trauma and OCD, using CBT, exposure and response prevention and EMDR. In person in Park Slope and by telehealth across New York and New Jersey.

Specialties: Anxiety, Trauma and PTSD, Obsessive-Compulsive (OCD)
Expertise: Depression, Grief, Life Transitions
Client focus: Adolescents, Adults. Languages: Spanish
Types of therapy: Cognitive Behavioral (CBT), EMDR, Exposure Response Prevention (ERP)
Insurance: Aetna, Cigna, out of network
License: New York 019283; New Jersey 35SI00123`;
const SETUP_APPLIED = ["Title", "Practice city", "Short bio", `${SETUP_TICKS.length} specialties, approaches and other details ticked`, "Your top 3 specialties ranked: check the order"];
const SETUP_MARKS = ["credential_prefix", "primary_practice_city", "bio", ...SETUP_TICKS.map((id) => `lv_${id}`)];
const setupScreen = (demo: ImportDemo, profile: Record<string, unknown>, rows: { lookup_value_id: number; rank: number | null }[]) => (
  <ProfileView sp={{}} profile={profile} lookups={PROFILE_LOOKUPS} selectedRows={rows} licenceCount={0} avatarUrl={null} me="alex" importDemo={demo} />
);

// ---------------------------------------------------------------------------
const DETAIL: Demo[] = [
  {
    key: "cover",
    title: "Cover your time away",
    blurb: "You have six weeks of parental leave. Three clients need cover. See them matched, asked and covered.",
    minutes: "2 minutes",
    outcome: "Six weeks away, every client covered.",
    learned: [
      "Each client is described by need, never by name.",
      "Matches come with reasons: license, focus, setting and fresh availability.",
      "You choose who is asked, and in what order, before anything is sent.",
      "A client only counts as covered once a colleague accepts.",
    ],
    steps: [
      {
        slug: "plan",
        perspective: "alex",
        title: "You need six weeks away",
        what: `Parental leave from ${leave.startLong}. A cover plan starts with three facts: the kind of absence, the dates and the state your clients are in.`,
        focus: "Define the needs",
        focusNote: "Next, you describe each client by need.",
        actions: [
          { do: "pick", target: 'input[name="absence_type"][value="extended_leave"]' },
          { do: "type", target: 'input[name="title"]', text: PLAN_TITLE },
        ],
        render: () => <CoverPlanStepView options={options} preset={{ absenceType: "extended_leave", title: PLAN_TITLE, starts: leave.start, ends: leave.end }} />,
      },
      {
        slug: "clients",
        perspective: "alex",
        title: "Three clients, described by need",
        what: "Each client becomes a short description: focus, age band, setting and frequency. No names, initials or dates ever enter PsyAlliance. Beside the plan, the Extended Leave Pack from the Practice Library has the client letters and handoff summary for leave like this.",
        focus: "Find colleagues",
        focusNote: "PsyAlliance now finds colleagues for each client.",
        render: () => <CoverNeedsView plan={{ ...plan, status: "draft" }} cases={clientsOpen} options={options} />,
      },
      {
        slug: "matches",
        perspective: "alex",
        title: "Matched colleagues, with the reasons",
        what: "For each client, colleagues with a reviewed New York license, the right focus and recently confirmed availability, trusted colleagues first. Each match says why it fits.",
        focus: "Review invitations",
        focusNote: "You've ticked who to ask for each client. Next, a final check.",
        actions: [
          { do: "pick", target: 'input[name="pick_1"][value="maya"]' },
          { do: "pick", target: 'input[name="pick_2"][value="maya"]' },
        ],
        render: () => <CoverCandidatesView plan={plan} cases={clientsOpen} suggestions={coverSuggestions} avatarUrls={avatars} preselected={{ 1: ["maya", "imani"], 2: ["maya"], 3: ["eli"] }} />,
      },
      {
        slug: "invite",
        perspective: "alex",
        title: "Who is asked, in order, and why",
        what: "Before anything is sent, you see exactly who is asked for each client, in what order, and why each colleague fits. If the first declines, the next is asked automatically.",
        focus: "Send cover requests",
        focusNote: "Send. Next, see what Maya receives.",
        actions: [{ do: "pick", target: 'input[name="reviewed"]' }],
        render: () => (
          <CoverInviteView
            plan={plan}
            rows={[
              { caseId: 1, reference: "Client 1", focus: "Trauma/PTSD", picks: [{ id: "maya", name: "Maya Calderwick, PsyD", why: MAYA_TRAUMA }, { id: "imani", name: "Imani Ambershaw, PhD", why: IMANI }] },
              { caseId: 2, reference: "Client 2", focus: "Anxiety/Panic Disorders", picks: [{ id: "maya", name: "Maya Calderwick, PsyD", why: MAYA_ANX }] },
              { caseId: 3, reference: "Client 3", focus: "Depression", picks: [{ id: "eli", name: "Eli Kestrelby, MD", why: ELI }] },
            ]}
          />
        ),
      },
      {
        slug: "maya",
        perspective: "maya",
        title: "Maya receives your request",
        what: "This is Maya's account, not yours. She sees how many clients, where and when, and what each one needs, with no client details, and answers client by client.",
        focus: "Accept Client 1",
        focusNote: "Maya accepts both of hers. Back to you next.",
        render: () => (
          <CoverIndexView
            plans={[]}
            incoming={[
              {
                planId: 1,
                ownerId: "alex",
                ownerName: "Your Name, PsyD",
                ownerRole: "Clinical psychologist · Brooklyn, NY",
                ownerAvatar: AV.alex,
                absence: "Extended leave",
                planTitle: PLAN_TITLE,
                dates: leave.range,
                length: "6 weeks",
                location: "Brooklyn, New York",
                outreach: "You are asked in turn; others follow if you decline",
                note: "Two clients below. A joint handoff call the week before I go would suit me best.",
                urgent: false,
                sentAt: null,
                cases: [
                  { requestId: 11, reference: "Client 1", focus: "Trauma/PTSD", details: [["Age band", "Adults"], ["Setting", "Virtual or in person"], ["Insurance", "Aetna"], ["Frequency", "Weekly"], ["Prescribing", "Not needed"]] },
                  { requestId: 12, reference: "Client 2", focus: "Anxiety/Panic Disorders", details: [["Age band", "Adolescents"], ["Setting", "Virtual"], ["Insurance", "Self-pay (out of network)"], ["Frequency", "Weekly"], ["Prescribing", "Not needed"]] },
                ],
              },
            ]}
          />
        ),
      },
      {
        slug: "covered",
        perspective: "alex",
        title: "Back with you: every client covered",
        what: "Maya accepted her two clients and Eli Kestrelby, a psychiatrist, accepted the one who needs prescribing. The handoffs now happen between the clinicians, outside PsyAlliance.",
        focus: "Complete plan",
        focusNote: "When you're back, completing the plan records who covered.",
        render: () => <CoverTrackView plan={{ ...plan, counts: { total: 3, covered: 3, invited: 0, open: 0 } }} cases={clientsCovered} nextSuggestion={{}} toRate={[]} />,
      },
    ],
  },
  {
    key: "refer",
    title: "Refer a client",
    blurb: "An inquiry you can't take. Describe the need, see who fits and why, and choose from the replies.",
    minutes: "2 minutes",
    outcome: "The right colleague found, and the handoff under way.",
    learned: [
      "You describe the need, never the person.",
      "The shortlist explains why each colleague fits, trusted colleagues first.",
      "You see exactly who receives the referral before it's sent.",
      "Colleagues reply Interested, Not available or with a question; you choose.",
      "The handoff itself happens between you, outside PsyAlliance; then you close the referral.",
    ],
    steps: [
      {
        slug: "need",
        perspective: "alex",
        title: "A new inquiry you can't take",
        what: "An adult with OCD asks you for help, but you're about to go on leave. On Refer, you start with the main need and where the client is; everything else is optional.",
        focus: "Find colleagues",
        focusNote: "Next, colleagues who fit, with reasons.",
        actions: [
          { do: "type", target: ".combo-input", text: "Obsessive/Compulsive Disorder" },
          { do: "select", target: 'select[name="insurance"]', value: "Aetna" },
        ],
        render: () => <ReferIndexView options={options} start={referNeed as any} mine={[]} offered={[]} />,
      },
      {
        slug: "shortlist",
        perspective: "alex",
        title: "A shortlist that explains itself",
        what: "Colleagues with a reviewed New York license and OCD experience who are taking referrals. Trusted colleagues and people you've worked with come first, and each says why.",
        focus: "Review before sending",
        focusNote: "You keep all three. Next, the final check.",
        actions: [
          { do: "pick", target: 'input[name="pick"][value="maya"]' },
          { do: "pick", target: 'input[name="pick"][value="sam"]' },
          { do: "pick", target: 'input[name="pick"][value="lena"]' },
        ],
        render: () => <ReferShortlistView options={options} need={referNeed as any} matches={referMatches} widen={[]} avatarUrls={avatars} />,
      },
      {
        slug: "review",
        perspective: "alex",
        title: "Exactly who receives it",
        what: "Three named colleagues, the need as they'll see it, and a check that nothing identifies the client. Nothing is sent until you confirm.",
        focus: "Send referral",
        focusNote: "Send. Next, what Samuel receives.",
        render: () => (
          <ReferReviewView
            options={options}
            need={referNeed as any}
            picked={[
              { profileId: "maya", name: "Maya Calderwick, PsyD" },
              { profileId: "sam", name: "Samuel Brindlemoor, PhD" },
              { profileId: "lena", name: "Lena Larkhollow, PsyD" },
            ]}
            trustedCount={7}
            networkCount={1199}
          />
        ),
      },
      {
        slug: "samuel",
        perspective: "samuel",
        title: "Samuel receives the referral",
        what: "This is Samuel's account. He sees the need, where and when, and that no client details are shared. He replies in one step.",
        focus: "Send reply",
        focusNote: "Samuel replies Interested. Back to you next.",
        actions: [
          { do: "pick", target: 'input[name="response"][value="interested"]' },
          { do: "type", target: 'textarea[name="message"]', text: "Happy to. I run ERP weekly and can start in two weeks." },
        ],
        render: () => (
          <ReferTrackView
            r={{
              id: 5,
              isMine: false,
              focus: "Obsessive/Compulsive Disorder",
              where: "Brooklyn, New York",
              status: "sent",
              audience: "selected",
              audienceCount: 3,
              timeframe: "within_month",
              notes: "Adult, ERP experience needed, evenings preferred.",
              createdAt: daysAgo(0.2),
              requesterName: "Your Name, PsyD",
              rows: referralRows,
              responses: [],
              myResponse: null,
              chosen: null,
              rated: false,
            }}
          />
        ),
      },
      {
        slug: "choose",
        perspective: "alex",
        title: "Everyone replied: you choose",
        what: "Two colleagues are interested and one is full. Interest isn't acceptance: you decide, and choose Samuel, whom you've worked with before.",
        focus: "Choose and start handoff",
        focusIndex: 1,
        focusNote: "You choose Samuel. Next, the handoff.",
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
              rows: [...referralRows.slice(0, 5), ["Audience", "Selected colleagues (3)"], ["Client details shared", "None"]],
              responses: [
                { profileId: "maya", name: "Maya Calderwick, PsyD", status: "interested", message: "I have a Tuesday evening opening from next week.", avatarUrl: AV.maya },
                { profileId: "sam", name: "Samuel Brindlemoor, PhD", status: "interested", message: "Happy to. I run ERP weekly and can start in two weeks.", avatarUrl: AV.samuel },
                { profileId: "lena", name: "Lena Larkhollow, PsyD", status: "unavailable", message: "Full until January, sorry.", avatarUrl: AV.lena },
              ],
              myResponse: null,
              chosen: null,
              rated: false,
            }}
          />
        ),
      },
      {
        slug: "handoff",
        perspective: "alex",
        title: "Samuel chosen, handoff under way",
        what: "The referral now shows Samuel as accepted. You arrange the clinical handoff between you through your own secure channel; once the client is placed, you close the referral.",
        focus: "Mark placed and close",
        focusNote: "Once the client is placed, you close the referral.",
        render: () => (
          <ReferTrackView
            r={{
              id: 5,
              isMine: true,
              focus: "Obsessive/Compulsive Disorder",
              where: "Brooklyn, New York",
              status: "connected",
              audience: "selected",
              audienceCount: 3,
              timeframe: "within_month",
              notes: "Adult, ERP experience needed, evenings preferred.",
              createdAt: daysAgo(3),
              requesterName: "You",
              rows: [...referralRows.slice(0, 5), ["Audience", "Selected colleagues (3)"], ["Client details shared", "None"]],
              responses: [
                { profileId: "maya", name: "Maya Calderwick, PsyD", status: "interested", message: "I have a Tuesday evening opening from next week.", avatarUrl: AV.maya },
                { profileId: "sam", name: "Samuel Brindlemoor, PhD", status: "accepted", message: "Happy to. I run ERP weekly and can start in two weeks.", avatarUrl: AV.samuel },
                { profileId: "lena", name: "Lena Larkhollow, PsyD", status: "unavailable", message: "Full until January, sorry.", avatarUrl: AV.lena },
              ],
              myResponse: null,
              chosen: { profileId: "sam", name: "Samuel Brindlemoor, PhD" },
              rated: false,
            }}
          />
        ),
      },
    ],
  },
  {
    key: "consult",
    title: "Ask colleagues a question",
    blurb: "A practical question for the people you trust, answered in a day, with the useful reply marked.",
    minutes: "1 minute",
    outcome: "A clear answer from trusted peers, kept for next time.",
    learned: [
      "Question and context first; it goes to your trusted colleagues unless you change it.",
      "You confirm it identifies no one, and review it before it's shared.",
      "Replies come from named, verified colleagues; your useful marks are private to you.",
      "For a standing group with a charter, use a consultation group instead.",
    ],
    steps: [
      {
        slug: "ask",
        perspective: "alex",
        title: "You ask your circle",
        what: "How do colleagues run the handoff call when someone covers mid-treatment? A quick question like this goes to the people you trust and gets answers in a day. (Standing consultation groups, with a charter and regular meetings, are separate.)",
        focus: "Review before posting",
        focusNote: "Next, a last look before it's shared.",
        actions: [
          { do: "type", target: 'input[name="question"]', text: "How do you structure the handoff call when a colleague covers mid-treatment?" },
          { do: "pick", target: 'input[name="deidentified"]' },
        ],
        render: () => (
          <ConsultComposeView
            kind="question"
            areas={["Anxiety/Panic Disorders", "Trauma/PTSD"]}
            suggestions={ALEX_SUGGESTIONS}
            groups={[{ id: 1, name: "Thursday Circle", members: 6 }]}
            preset={{
              question: "How do you structure the handoff call when a colleague covers mid-treatment?",
              context: "Six weeks of parental leave coming up. I want the transition to feel steady for clients without over-sharing.",
            }}
          />
        ),
      },
      {
        slug: "review",
        perspective: "alex",
        title: "Reviewed before it's shared",
        what: "You see the question exactly as colleagues will, and who will see it: your seven trusted colleagues. Nothing is posted until you confirm.",
        focus: "Post it",
        focusNote: "Post. Next, the replies a day later.",
        render: () => (
          <ConsultDetailView
            c={{
              id: 9,
              kind: "question",
              question: "How do you structure the handoff call when a colleague covers mid-treatment?",
              context: "Six weeks of parental leave coming up. I want the transition to feel steady for clients without over-sharing.",
              typeLabel: "Practice question",
              tags: ["Private practice"],
              status: "draft",
              mine: true,
              authorName: "You",
              createdAt: daysAgo(0),
              audienceLabel: "Trusted colleagues",
              recipients: ["Maya Calderwick, PsyD", "Samuel Brindlemoor, PhD", "Aaron Glenmarrow, DO", "Aaron Hollisford, PhD", "Adrian Ivorwick, PsyD", "Adrian Kestrelby, PsyD", "Aaron Kellingsby, PsyD"],
              responses: [],
            }}
          />
        ),
      },
      {
        slug: "replies",
        perspective: "alex",
        title: "Answers from people you trust",
        what: "Two replies by the next day. You've marked Maya's reply as useful; only you see those marks. With an answer in hand, you mark the question resolved.",
        focus: "Mark resolved",
        focusNote: "You mark the question resolved.",
        render: () => (
          <ConsultDetailView
            c={{
              id: 9,
              kind: "question",
              question: "How do you structure the handoff call when a colleague covers mid-treatment?",
              context: "Six weeks of parental leave coming up. I want the transition to feel steady for clients without over-sharing.",
              typeLabel: "Practice question",
              tags: ["Private practice"],
              status: "responses_received",
              mine: true,
              authorName: "You",
              createdAt: daysAgo(1),
              audienceLabel: "Trusted colleagues",
              recipients: [],
              responses: [
                { id: 1, name: "Maya Calderwick, PsyD", body: "A 20-minute joint call before leave starts, then a written summary. The Extended Leave Pack has a checklist.", type: "reply", useful: true, createdAt: daysAgo(0.5), avatarUrl: AV.maya },
                { id: 2, name: "Eli Kestrelby, MD", body: "Tell clients in writing who to contact and when. It's the ambiguity that unsettles people.", type: "reply", useful: false, createdAt: daysAgo(0.3), avatarUrl: AV.eli },
              ],
            }}
          />
        ),
      },
    ],
  },
  {
    key: "circle",
    title: "Your day and your circle",
    blurb: "Home shows what needs you. Find colleagues by need, see their facts, and message with context.",
    minutes: "2 minutes",
    outcome: "A clear morning, and colleagues you can reach.",
    learned: [
      "Home is four jobs, one Actions tile, your availability and your circle today.",
      "Search the network by need; trusted colleagues come first, with reasons.",
      "Profiles show facts on file with dates, not testimonials.",
      "Every conversation shows what it's about.",
    ],
    steps: [
      {
        slug: "home",
        perspective: "alex",
        title: "Your morning",
        what: "Home asks one question: what would you like to do? Four jobs, and a fifth tile that counts what's waiting for you and opens the list in place. Underneath: what colleagues see of your availability, and which of your trusted colleagues are open today.",
        focus: "Find a clinician",
        focusNote: "Next, find a colleague in the network.",
        render: () => (
          <HomeView
            d={{
              invite: DEMO_INVITE,
              firstName: "",
              today: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }),
              greeting: "Good morning",
              steps: [
                { key: "cover-1", title: "Aaron Glenmarrow, DO asked you to cover 2 clients", detail: "Anxiety/Panic Disorders and Trauma/PTSD · Unexpected absence · NY · this week", href: "#", action: "Review request", urgent: true, person: { id: "t3", name: "Aaron Glenmarrow, DO" } },
                { key: "ref-1", title: "Your Obsessive/Compulsive Disorder referral is ready to choose", detail: "Everyone you asked has replied. 2 interested", href: "#", action: "Choose a colleague" },
                { key: "offers", title: "3 referrals are waiting for your reply", detail: "Trauma/PTSD from Maya Calderwick · Anxiety/Panic Disorders from Eli Kestrelby · Anxiety/Panic Disorders from Aaron Kellingsby", href: "#", action: "Review referrals" },
                { key: "added", title: "2 colleagues added you as a trusted colleague", detail: "Imani Ambershaw, Adrian Hazelwick", href: "#", action: "Review" },
                { key: "msgs", title: "1 unread conversation", detail: "Messages from colleagues", href: "#", action: "Read" },
              ],
              gettingStarted: null,
              availability: { referrals: "Selected referrals only", cover: "Cover: ask me", consult: "Open to consult", confirmedLabel: "Confirmed 3 days ago", stale: false, canReconfirm: true, tones: { referrals: "limited", cover: "limited", consult: "open" } },
              circleSnapshot: {
                trusted: 7,
                referrals: 4,
                cover: 3,
                people: ALEX_CIRCLE.nodes.filter((n) => n.kind === "trusted").map((n, i) => ({ id: n.id, name: n.name, avatarUrl: n.avatarUrl, open: i < 4 })),
              },
              options,
            }}
          />
        ),
      },
      {
        slug: "network",
        perspective: "alex",
        title: "Find colleagues by need",
        what: "Clinicians lists all 1,200 fictional members in six states, your trusted colleagues first, with license, focus and availability on every card. One button on each: Add as Trusted Colleague.",
        focus: "Maya Calderwick",
        focusNote: "Open a colleague's profile.",
        render: () => (
          <CliniciansView
            people={people}
            total={1199}
            filters={{ q: "", focus: "", state: "", available: false, profession: "" }}
            focusOptions={options.focus.map((f) => f.value)}
            states={options.states}
            networkSize={1199}
            moreOptions={{ insurance: ["Aetna", "Cigna", "Empire BlueCross BlueShield"], age: ["Children", "Adolescents", "Adults", "Older adults"], language: ["Spanish", "Mandarin"], modality: ["CBT", "EMDR", "ERP"], session: ["In person", "Telehealth"] }}
            invite={DEMO_INVITE}
          />
        ),
      },
      {
        slug: "colleague",
        perspective: "alex",
        title: "Facts, not testimonials",
        what: "Maya's profile: reviewed licenses, focus, who she sees and whether she's taking referrals, with dates. Your controls over the relationship are private to you.",
        focus: "Send message",
        focusNote: "Next, a conversation with context.",
        render: () => <ClinicianProfileView p={mayaProfile} />,
      },
      {
        slug: "messages",
        perspective: "alex",
        title: "Messages with context",
        what: "Every conversation shows what it's about: this one is your cover plan with Maya, so the thread and the plan stay together. A thumbs up or a heart says you've seen a message without another reply.",
        focusNote: "That's a day in your practice.",
        render: () => (
          <MessagesShell
            list={
              <ConversationList
                activeId={1}
                items={[
                  { id: 1, title: "Maya Calderwick, PsyD", context: `Cover · ${PLAN_TITLE}`, preview: "A joint handoff call the week before works for me.", when: "9:14 AM", unread: false, avatarName: "Maya Calderwick", avatarUrl: AV.maya },
                  { id: 2, title: "Samuel Brindlemoor, PhD", context: "Referral · Obsessive/Compulsive Disorder · Brooklyn", preview: "Happy to. I run ERP weekly.", when: "Yesterday", unread: false, avatarName: "Samuel Brindlemoor", avatarUrl: AV.samuel },
                  { id: 3, title: "Eli Kestrelby, MD", context: "Referral · Trauma/PTSD · Manhattan", preview: "Needs someone soon; current clinician is relocating.", when: "Mon", unread: true, avatarName: "Eli Kestrelby", avatarUrl: AV.eli },
                ]}
              />
            }
          >
            <section className="card message-area">
              <div className="context-head">
                <div>
                  <h3 style={{ margin: 0 }}>Maya Calderwick, PsyD</h3>
                  <span className="micro-note">Cover · {PLAN_TITLE} · View profile</span>
                </div>
                <a className="btn secondary small-btn" href="#">View context</a>
              </div>
              <div className="message-scroll">
                <div className="bubble">Congratulations again! I&rsquo;ve kept two cover slots free for {leave.range}. Send the plan over when it&rsquo;s ready.<small>Maya &middot; Yesterday, 4:10 PM</small></div>
                <div className="bubble me">Thank you. I&rsquo;ll set it up this week: three clients, no identifiers, and I&rsquo;ll use the Extended Leave Pack.<small>You &middot; Yesterday, 4:25 PM</small><MessageReactions messageId={2} counts={{ heart: 1 }} names={{ heart: ["Maya"] }} mine={null} canReact={false} /></div>
                <div className="bubble">Perfect. A joint handoff call the week before works for me.<small>Maya &middot; 9:14 AM</small><MessageReactions messageId={3} counts={{ like: 1 }} names={{ like: ["You"] }} mine="like" canReact /></div>
              </div>
              <div className="message-compose">
                <textarea placeholder="Write a professional message..." aria-label="Message" />
                <button className="btn lg" type="button">Send</button>
              </div>
              <p className="micro-note" style={{ marginTop: 8 }}>{HANDOFF_RULE}</p>
            </section>
          </MessagesShell>
        ),
      },
    ],
  },
  {
    key: "verified",
    title: "Join, get verified, stay visible",
    blurb: "What joining involves: your license checked by a person, availability you control, and the profile colleagues see.",
    minutes: "1 minute",
    outcome: "Verified, visible, and in control of what colleagues see.",
    learned: [
      "Every license is checked against the state board by a person.",
      "You're listed and matched only where a reviewed license is on file.",
      "Availability is yours to set, pause and reconfirm.",
      "Your profile shows facts colleagues can rely on.",
    ],
    steps: [
      {
        slug: "credentials",
        perspective: "alex",
        title: "A person checks every license",
        what: "You add each license; a PsyAlliance reviewer checks it against the state board. New York is reviewed, New Jersey is waiting. You're matched only where a reviewed license is on file.",
        focus: "Availability",
        focusNote: "Next, you set your availability.",
        render: () => (
          <CredentialsView
            sp={{}}
            profile={{ verification_status: "verified", verified_at: daysAgo(30), account_status: "active", qualification_level: "PsyD", npi_number: "1234567890", caqh_provider_id: null, caqh_last_attested_date: null, malpractice_carrier: null, malpractice_expires: null }}
            licenses={[
              { id: 1, state: "NY", license_number: "019283", license_type: "Licensed Psychologist", expiration_date: "2027-08-31", status: "active", reviewed_at: daysAgo(29) },
              { id: 2, state: "NJ", license_number: "35SI00123", license_type: "Licensed Psychologist", expiration_date: "2027-06-30", status: "active", reviewed_at: null },
            ]}
            ce={[]}
            panels={[]}
            npiChecks={[{ matched: true, flagged_reason: null, created_at: daysAgo(30) }]}
          />
        ),
      },
      {
        slug: "availability",
        perspective: "alex",
        title: "Availability you control",
        what: "Whether you're taking referrals, open to cover or to consult. Colleagues see when it was last confirmed, so stale availability never looks current. Pausing for leave is one click.",
        focus: "Save and confirm",
        focusNote: "Save. Next, the profile colleagues see.",
        actions: [
          { do: "pick", target: 'input[name="referral_availability"][value="limited"]' },
          { do: "pick", target: 'input[name="coverage_availability"][value="ask_me"]' },
        ],
        render: () => (
          <AvailabilityView
            p={{ referral_availability: "limited", coverage_availability: "ask_me", consultation_availability: "yes", availability_confirmed_at: daysAgo(3), approx_spaces: 2, availability_paused_until: null }}
            sp={{}}
          />
        ),
      },
      {
        slug: "profile",
        perspective: "alex",
        title: "The profile colleagues rely on",
        what: "Your profile: focus, who you see and current availability, with dates. Colleagues see only reviewed licenses, so New Jersey appears, and you're matched there, once a reviewer has checked it.",
        focus: "Edit profile",
        focusNote: "You can change any of it, any time.",
        render: () => (
          <ProfileView
            sp={{}}
            profile={{ ...ALEX_FILLED, availability_confirmed_at: daysAgo(3) }}
            lookups={PROFILE_LOOKUPS}
            selectedRows={SETUP_ROWS}
            licenceCount={2}
            avatarUrl={null}
            me="alex"
            editing={false}
            licenses={[{ state: "NY", reviewed: true }, { state: "NJ", reviewed: false }]}
          />
        ),
      },
    ],
  },
  {
    key: "library",
    title: "Find the right template",
    blurb: "You're planning leave. Find the template for it, see what's inside and save the PDF to your private library.",
    minutes: "1 minute",
    outcome: "The right template, in the moment you need it.",
    learned: [
      "Twenty templates for independent practice, each placed beside the work it supports.",
      "Every template shows its version and whether it has been independently reviewed.",
      "Saved templates are private to you, ready to print or fill in.",
    ],
    steps: [
      {
        slug: "search",
        perspective: "alex",
        title: "You search for leave",
        what: "The Extended Leave Pack, the Professional Will and the Reciprocal Coverage Agreement come up. Each template shows its version and whether it has been independently reviewed.",
        focus: "Explore",
        focusIndex: 1,
        focusNote: "You open the Extended Leave pack.",
        actions: [{ do: "type", target: 'input[name="q"]', text: "leave" }],
        render: () => <LibraryView resources={LIB_LEAVE} q="leave" category="" mineCount={0} />,
      },
      {
        slug: "template",
        perspective: "alex",
        title: "What's inside the Extended Leave Pack",
        what: "What's inside, who it's for and the cover plan it supports. It's still in review, and it says so.",
        focus: "Save PDF to My Library",
        focusNote: "You save a private copy to print and complete.",
        render: () => <ResourceDetailView r={LIB_PA02} url="#" />,
      },
      {
        slug: "mine",
        perspective: "alex",
        title: "A private copy, ready to fill in",
        what: "The saved PDF sits in My Library. Only you can see it, and it never holds client details.",
        focus: "Practice Library",
        focusNote: "Back to the Library whenever you need the next template.",
        render: () => (
          <MyLibraryView
            docs={[{ id: 1, title: "Extended Leave Coverage Plan & Clinical Handoff Pack (your copy)", storagePath: "", folderId: null, createdAt: daysAgo(0), source: "Your copy of the Extended Leave Pack, version 1", url: "#" }]}
            folders={[]}
            folder="all"
            folderCounts={{ unfiled: 1 }}
            total={1}
            notice="The Extended Leave Pack is saved to My Library. Only you can see it."
          />
        ),
      },
    ],
  },
  {
    key: "profile",
    title: "Set up your profile in a minute",
    blurb: "You paste your Psychology Today profile. Everything fills itself in, your top specialties are ranked, and you check and save.",
    minutes: "1 minute",
    outcome: "A full profile in a minute, checked before it's saved.",
    learned: [
      "Paste your Psychology Today profile, practice website, LinkedIn or CV into Quick start.",
      "Everything filled in is highlighted so you can check it.",
      "Your top specialties are ranked for you; you confirm the order.",
      "Nothing is saved until you press Save profile.",
    ],
    steps: [
      {
        slug: "paste",
        perspective: "alex",
        title: "You paste your Psychology Today profile",
        what: "New to PsyAlliance, you copy your existing profile page and paste it into Quick start at the top of Profile. A practice website, LinkedIn or a CV works too.",
        focus: "Fill in from this text",
        focusNote: "Next, everything fills itself in.",
        actions: [{ do: "type", target: ".quick-start-drop", text: PASTED_PROFILE }],
        render: () => setupScreen({ text: PASTED_PROFILE }, ALEX_SIGNUP, []),
      },
      {
        slug: "filled",
        perspective: "alex",
        title: "Everything fills itself in",
        what: "Title, city, bio, specialties, approaches, ages, insurance and languages are filled in and highlighted, so you can check each one. Nothing is saved yet.",
        focus: "Practice city",
        focusNote: "Next, your top specialties.",
        render: () => setupScreen({ text: PASTED_PROFILE, applied: SETUP_APPLIED, marks: SETUP_MARKS, ranks: 3 }, ALEX_FILLED, SETUP_ROWS),
      },
      {
        slug: "ranked",
        perspective: "alex",
        title: "Her top specialties, already in order",
        what: "Your top three are ranked from your profile, and PsyAlliance asks you to check the order. Rank 1 counts most in matching.",
        focus: "#rank-confirm",
        focusNote: "You check the order and save.",
        render: () => setupScreen({ text: PASTED_PROFILE, applied: SETUP_APPLIED, marks: SETUP_MARKS, ranks: 3 }, ALEX_FILLED, SETUP_ROWS),
      },
      {
        slug: "saved",
        perspective: "alex",
        title: "Saved, with what's left listed first",
        what: "The profile is saved. What's still to do comes first: next, your license, which a person checks before you're matched with anyone.",
        focusNote: "That's set-up. Next, a person checks your license.",
        render: () => (
          <ProfileView sp={{ saved: "1" }} profile={ALEX_FILLED} lookups={PROFILE_LOOKUPS} selectedRows={SETUP_ROWS} licenceCount={0} avatarUrl={null} me="alex" editing={false} />
        ),
      },
    ],
  },
];

// The 90-second overview: one coherent story told with screens from the
// closer looks. The problem, the match, your control, the result, then a
// glimpse of referring and asking, and how verification works.
const pick = (demo: string, slug: string, over: Partial<DemoStep>): DemoStep => {
  const base = DETAIL.find((d) => d.key === demo)!.steps.find((x) => x.slug === slug)!;
  return { ...base, ...over, slug: over.slug || `${demo}-${slug}` };
};

const OVERVIEW: Demo = {
  key: "overview",
  title: "See PsyAlliance in 90 seconds",
  blurb: "Step through the story yourself: you need six weeks away, colleagues cover every client. Plus a glimpse of referring and asking colleagues.",
  minutes: "90 seconds",
  outcome: "Six weeks away, every client covered, by colleagues you chose.",
  learned: [
    "Matches come with reasons: a reviewed license, the right focus and fresh availability.",
    "You choose who is asked before anything is sent.",
    "Referrals and questions work the same way: the right colleagues, chosen by you.",
    "A person checks every license before anyone can see you.",
  ],
  steps: [
    pick("cover", "plan", { slug: "problem", title: "You need six weeks away", what: "Parental leave is coming, and three clients need cover. In private practice that usually means a week of phone calls. Here it starts with the dates and the state.", focusNote: "Next, you describe each client by need." }),
    pick("cover", "clients", { slug: "need", title: "Each client, described by need", what: "You add the three clients by what they need: focus, age group and setting. Never a name or anything that identifies them.", focusNote: "Next, PsyAlliance finds colleagues for each client." }),
    pick("cover", "matches", { slug: "match", title: "The right colleagues, with reasons", what: "For each client, colleagues with a reviewed New York license, the right focus and recently confirmed availability. Trusted colleagues come first, and every match says why.", focusNote: "You tick who to ask. Next, a final check." }),
    pick("cover", "invite", { slug: "control", title: "You decide who is asked", what: "Nothing is sent until you've seen exactly who receives each request, and in what order. No client names ever enter PsyAlliance.", focusNote: "Send. A few days later, the replies are in." }),
    pick("cover", "covered", { slug: "result", title: "Every client covered", what: "Colleagues accept, and the plan shows it. A client only counts as covered once someone has said yes.", focusNote: "Next, a glimpse of referrals." }),
    pick("refer", "shortlist", { slug: "refer", title: "Referrals work the same way", what: "An inquiry you can't take becomes a shortlist of colleagues who fit, each with the reason, instead of a list of names from memory.", focusNote: "You check who receives it before sending." }),
    pick("consult", "replies", { slug: "consult", title: "And questions go to people you trust", what: "A focused practice question, shared only with the colleagues you choose, answered by people you know.", focusNote: "Next, how quickly joining goes." }),
    pick("profile", "filled", { slug: "setup", title: "Joining takes a minute", what: "You pasted your Psychology Today profile into Quick start and everything filled itself in, highlighted to check before saving.", focus: undefined, focusNote: "Last, how members are checked." }),
    pick("verified", "credentials", { slug: "verified", title: "Everyone here is checked", what: "A person checks each license against the state board before anyone is listed. The Practice Library has templates for leave, referrals and consent, beside the work they support.", focus: undefined, focusNote: undefined }),
  ],
};

export const DEMOS: Demo[] = [OVERVIEW, ...DETAIL];
// The three closer looks offered after the overview; the rest stay
// reachable as supporting detail.
export const CLOSER_LOOKS = ["cover", "refer", "consult"];
export const MORE_DETAIL = ["profile", "circle", "verified", "library"];

export function findDemo(key: string) {
  return DEMOS.find((d) => d.key === key) || null;
}

// Old tour links land in the demo that now holds that screen.
export const LEGACY: Record<string, string> = {
  profile: "verified",
  home: "circle",
  network: "circle",
  messages: "circle",
  refer: "refer",
  "referral-replies": "refer",
  consult: "consult",
  plan: "cover",
  matches: "cover",
  invite: "cover",
  respond: "cover",
  covered: "cover",
};

