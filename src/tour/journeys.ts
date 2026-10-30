// The demo library. Every demo is the approved workspace itself, running on
// its fictional sample data (Rachel Davis and her colleagues), so a demo can
// never drift from the product: there is no second copy of any screen.
//
// A step is a "scene": which screen of the workspace to open (see
// src/workspace/tour/macros.ts), what the narrator says about it, and, for
// the video, what the person on screen does before the last click. Two steps
// (the license check and the profile) are pages of the product that the
// approved design does not cover; those scenes show the existing pages.
//
// Plain data, no JSX: both the pages and the frames import it.

import { PASTED_PROFILE } from "./sample-profile";

export type SceneAction =
  | { do: "pick"; target: string }
  | { do: "type"; target: string; text: string }
  | { do: "select"; target: string; value: string }
  | { do: "scroll"; target: string };

export type Scene =
  | { kind: "workspace"; view: "home" | "cover" | "referrals" | "consult" | "network" | "messages" | "library"; macro?: string }
  | { kind: "page"; page: string };

export type Step = {
  slug: string;
  title: string;
  what: string;
  // What happens next, said once the screen is shown ("Click Continue.").
  focusNote?: string;
  scene: Scene;
  // The one control the step points at: a CSS selector, or the start of its
  // words. The video ends the step by clicking it.
  focus?: string;
  focusIndex?: number;
  actions?: SceneAction[];
  seconds?: number;
  // The optional "What will they receive?" panel: the one line a colleague
  // is notified with (first name, request type, "Review request."), and what
  // they then see when they open it. Never anything about a client.
  recipient?: { who: string; alert: string; sees: string };
  // The one step the visitor is invited to do themselves on the real screen.
  handsOn?: boolean;
  // Which rows of verification/demo_scenarios.csv this step demonstrates.
  scenarios: string[];
};

export type Journey = {
  key: string;
  title: string;
  blurb: string;
  minutes: string;
  outcome: string;
  learned: string[];
  steps: Step[];
  // A need-based walkthrough runs on that practice scenario (src/tour/scenarios.ts).
  scenario?: string;
  // What happens next in the real product, and the button that goes there.
  summary?: string;
  cta?: { label: string; href: string };
};

const w = (view: Extract<Scene, { kind: "workspace" }>["view"], macro?: string): Scene => ({ kind: "workspace", view, macro });

const COVER: Journey = {
  key: "cover",
  title: "Cover your time away",
  blurb: "Six weeks of leave, three clients and a team of colleagues: describe each client by need, choose who is asked, and see who has agreed and who is ready.",
  minutes: "2 minutes",
  outcome: "Every client has a colleague, and every handover is ready, before you go.",
  learned: [
    "You describe each client by need, never by name.",
    "Reasons come with every match, and only colleagues who fit are offered.",
    "You review exactly who is asked, in what order, and by when, before anything is sent.",
    "An agreed colleague is not the same as a ready handover: you confirm each one.",
  ],
  steps: [
    {
      slug: "plan",
      title: "You need time away",
      what: "Parental leave is coming. Choose the kind of absence and the dates. The states default to where you are licensed, and you can add another.",
      focusNote: "Next, you describe each client by need.",
      scene: w("cover", "cover-new"),
      focus: "Continue to needs",
      actions: [
        { do: "pick", target: 'input[name="reason"][value="extended"]' },
        { do: "type", target: "#cover-name", text: "Parental leave" },
      ],
      scenarios: ["DEM-02", "DEM-20"],
    },
    {
      slug: "clients",
      title: "Each client, described by need",
      what: "Focus, state, age group and setting. Never a name or anything that identifies someone. You can duplicate a client’s needs for the next one, edit them, or remove one.",
      focusNote: "Next, PsyAlliance finds colleagues who fit.",
      scene: w("cover", "cover-needs"),
      focus: "Continue to colleagues",
      scenarios: ["DEM-02", "DEM-03"],
    },
    {
      slug: "busy",
      title: "A full caseload works the same way",
      what: "Twenty clients is not a different tool. The list is the same, each client keeps its own needs, and a client added after one was removed gets a new number, so nothing is ever mixed up.",
      focusNote: "Choosing colleagues is the same too.",
      scene: w("cover", "cover-twenty"),
      focus: "Continue to colleagues",
      scenarios: ["DEM-03", "DEM-20"],
    },
    {
      slug: "matches",
      title: "Colleagues who fit, with the reasons",
      what: "For each client: a reviewed license in the right state, the right focus, the right setting, and recently confirmed availability. Your trusted colleagues come first. You can look at them by client or by colleague.",
      focusNote: "You choose who to ask.",
      scene: w("cover", "cover-matches"),
      focus: "Review invitations",
      actions: [{ do: "pick", target: 'input[value="maya"]' }],
      scenarios: ["DEM-02", "DEM-03"],
    },
    {
      slug: "review",
      title: "Reviewed before anything is sent",
      what: "Ask one colleague at a time, in the order you choose, each with a response deadline, or ask everyone at once. You see exactly who will be asked, and nothing is sent until you confirm.",
      focusNote: "Then the requests go out.",
      scene: w("cover", "cover-review"),
      focus: "Send cover requests",
      actions: [
        { do: "select", target: "#cover-deadline", value: "24" },
        { do: "pick", target: 'input[name="reviewed"]' },
      ],
      scenarios: ["DEM-02", "DEM-04"],
    },
    {
      slug: "track",
      title: "Where each client stands",
      what: "One client is still being discussed with the first colleague in the queue, so nobody else is asked yet. One has a colleague who has agreed. One is ready to go. You see it all in one plan.",
      focusNote: "Agreed is where the handover begins.",
      scene: w("cover", "cover-plan"),
      focus: "Confirm handover",
      scenarios: ["DEM-04", "DEM-05"],
    },
    {
      slug: "deadline",
      title: "When a colleague does not answer in time",
      what: "A request has a response deadline. When it passes without an answer, it closes and the next colleague in your order is asked, once. If someone is still talking it through with you, the clock pauses.",
      focusNote: "Nothing is left waiting forever.",
      scene: w("cover", "cover-deadline"),
      focus: "Cancel plan",
      scenarios: ["DEM-04"],
    },
    {
      slug: "handover",
      title: "Agreed is not the same as ready",
      what: "Accepting cover starts a handover. Make sure the colleague has the contact details, the summary and the client’s consent, then mark it ready. The plan can only be completed when every handover is ready.",
      focusNote: "Mark it ready when all three are done.",
      scene: w("cover", "cover-handover"),
      focus: "Mark handover ready",
      actions: [
        { do: "pick", target: 'input[name="contact"]' },
        { do: "pick", target: 'input[name="summary"]' },
        { do: "pick", target: 'input[name="client"]' },
      ],
      scenarios: ["DEM-05"],
    },
    {
      slug: "incoming",
      title: "A colleague asks you",
      what: "Alex has asked you to cover two clients in October. You see what each client needs, and you answer for each one: I can help, discuss first, or can’t help. Whoever answers first and fits gets the client.",
      focusNote: "Your answer goes to Alex.",
      scene: w("cover", "cover-incoming"),
      focus: "I can help",
      scenarios: ["DEM-06"],
    },
    {
      slug: "calendar",
      title: "Everyone’s time away, in one place",
      what: "Your plans and the plans you are covering, on a calendar. Your own are labelled as yours, and a colleague’s as theirs, so a clash is easy to see.",
      focusNote: "Switch between your plans and the ones you cover.",
      scene: w("cover", "cover-calendar"),
      focus: "Plan cover",
      scenarios: ["DEM-06"],
    },
  ],
};

const REFER: Journey = {
  key: "refer",
  title: "Refer a client",
  blurb: "A client you can’t take: describe the need, see who fits and why, choose who is asked, then choose from the colleagues who are interested.",
  minutes: "2 minutes",
  outcome: "The right colleague, chosen by you, with their current capacity confirmed.",
  learned: [
    "You describe the need and the place, never the person.",
    "Only colleagues who fit are offered, each with the reason.",
    "Interest is not a placement: you choose, and the chosen colleague confirms.",
    "A colleague confirms their current capacity before saying they are interested.",
  ],
  steps: [
    {
      slug: "need",
      title: "A client you can’t take",
      what: "Start with what the client needs and where they are. The main need and the state are enough; everything else narrows the search.",
      focusNote: "Next, who fits.",
      scene: w("referrals", "referral-new"),
      focus: "See matched colleagues",
      actions: [
        { do: "select", target: "#referral-focus", value: "Anxiety/Panic Disorders" },
        { do: "select", target: "#referral-state", value: "NY" },
      ],
      scenarios: ["DEM-07", "DEM-20"],
    },
    {
      slug: "shortlist",
      title: "A shortlist that explains itself",
      what: "Colleagues who fit the need, the state, the setting and the language, each with the reasons. Three are chosen to start; you can change them.",
      focusNote: "Next, a last look at who receives it.",
      scene: w("referrals", "referral-matches"),
      focus: "Review before sending",
      scenarios: ["DEM-07"],
    },
    {
      slug: "review",
      title: "Exactly who receives it",
      what: "Send it to the colleagues you chose, to your trusted colleagues, or to the verified network. Add a short note, set when the client needs to start, and confirm there is nothing that identifies them.",
      focusNote: "Then it is sent.",
      scene: w("referrals", "referral-review"),
      focus: "Send referral",
      actions: [{ do: "pick", target: 'input[name="reviewed"]' }],
      scenarios: ["DEM-07"],
    },
    {
      slug: "choose",
      title: "Interest is not a placement",
      what: "Colleagues reply interested, with a question, or not available. Talk with any of them. When you have decided, choose one, and the others are told it has been placed.",
      focusNote: "The chosen colleague confirms the placement.",
      scene: w("referrals", "referral-detail"),
      focus: "Choose colleague",
      scenarios: ["DEM-07"],
    },
    {
      slug: "targeted",
      title: "Someone in mind",
      what: "From a colleague’s profile you can refer a client to them directly. They are chosen already, and the same checks apply: if they don’t fit, the screen says so.",
      focusNote: "Next, what if the need changes.",
      scene: w("referrals", "referral-targeted"),
      focus: "Review before sending",
      scenarios: ["DEM-08"],
    },
    {
      slug: "changed",
      title: "When the need changes, you are told who no longer fits",
      what: "You go back and say a prescriber is needed. The colleague you chose is not one, so they are taken out, the reason is shown, and nobody else is put in their place without you.",
      focusNote: "Your draft is kept while you decide.",
      scene: w("referrals", "referral-pin-excluded"),
      focus: "Back",
      scenarios: ["DEM-08"],
    },
    {
      slug: "incoming",
      title: "A referral comes to you",
      what: "Eli has a client who needs someone soon. You see the need and the setting, and you answer: interested, discuss first, or not available. Saying nothing keeps nothing reserved.",
      focusNote: "Interested asks you to confirm your capacity first.",
      scene: w("referrals", "referral-incoming"),
      focus: "I’m interested",
      scenarios: ["DEM-09"],
    },
    {
      slug: "capacity",
      title: "Confirm current capacity",
      what: "Before expressing interest you confirm you have capacity now. It does not reserve a place or mark the client as placed. Only the referring colleague chooses.",
      focusNote: "Your answer and the date you confirmed are kept.",
      scene: w("referrals", "referral-capacity"),
      focus: "Confirm & express interest",
      actions: [{ do: "pick", target: 'input[name="capacity"]' }],
      scenarios: ["DEM-09", "DEM-17"],
    },
  ],
};

const CONSULT: Journey = {
  key: "consult",
  title: "Ask colleagues a question",
  blurb: "A hard question and the people you trust: choose who sees it, read the replies, mark what helped and find an older answer.",
  minutes: "1½ minutes",
  outcome: "Answers from named, verified colleagues, shared only with the people you chose.",
  learned: [
    "You choose the audience: your trusted colleagues, one person, a few, a group or the network.",
    "No client details: the question says what you need, not who it is about.",
    "Every reply comes from a named, verified colleague, newest first.",
    "Marking a reply useful is private to you.",
  ],
  steps: [
    {
      slug: "list",
      title: "Questions from your colleagues",
      what: "The questions you can see: ones you asked, ones you follow, and ones shared with you. Open a discussion to read the replies, or ask your own.",
      focusNote: "You ask a question.",
      scene: w("consult", "consult-list"),
      focus: "Ask a question",
      scenarios: ["DEM-11", "DEM-12", "DEM-21"],
    },
    {
      slug: "ask",
      title: "A focused question",
      what: "A short title, the context and the topic. Nothing that identifies a client, and you confirm that before it can be posted.",
      focusNote: "Next, who sees it.",
      scene: w("consult", "consult-ask"),
      focus: "#peer-title",
      actions: [
        { do: "type", target: "#peer-title", text: "How do you end therapy when a client is moving away?" },
        { do: "type", target: "#peer-body", text: "A long-term client is relocating abroad in the spring. I would like to plan the last sessions with them well." },
      ],
      scenarios: ["DEM-11"],
    },
    {
      slug: "audience",
      title: "You choose who sees it",
      what: "Your trusted colleagues, one person, a few people you pick, one of your groups, or the verified network. Before posting you see exactly who will be able to read and reply.",
      focusNote: "Then it is posted to that audience only.",
      scene: w("consult", "consult-audience"),
      focus: "Review before posting",
      scenarios: ["DEM-11"],
    },
    {
      slug: "replies",
      title: "Replies, newest first",
      what: "Replies come from named colleagues, with the newest at the top and the full history below. Mark what helped (only you see that), follow the question, and reply yourself.",
      focusNote: "Following keeps a question in your list.",
      scene: w("consult", "consult-discussion"),
      focus: "Useful",
      scenarios: ["DEM-11"],
    },
    {
      slug: "find",
      title: "Find an older answer",
      what: "Search by title, author, tag, or even a word from a reply. The results show only discussions you are allowed to see, and a search with no results tells you how to widen it.",
      focusNote: "Clear the search to see everything again.",
      scene: w("consult", "consult-list"),
      focus: "#consult-search",
      actions: [{ do: "type", target: "#consult-search", text: "burnout" }],
      scenarios: ["DEM-12"],
    },
  ],
};

const CIRCLE: Journey = {
  key: "circle",
  title: "Your day and your circle",
  blurb: "The Hub, the colleagues around you, and one conversation per context: how a busy week stays organised.",
  minutes: "2½ minutes",
  outcome: "What needs you, who is around you, and every conversation in its own place.",
  learned: [
    "The Hub puts your four main areas one click away, with a small count of what is waiting.",
    "Your circle has four tiers, and the directory finds anyone by need.",
    "A colleague profile shows facts, not testimonials, and leads to a message or a referral.",
    "One person can have several conversations with you, one for each cover plan and referral.",
  ],
  steps: [
    {
      slug: "home",
      title: "The Hub: what needs you",
      what: "One line says how many things need you, and one list holds them all. Three cards start a referral, plan cover or ask a question. No item ranks above the rest; you choose.",
      focusNote: "Start from any of the three.",
      scene: w("home"),
      focus: ".hub-cards",
      scenarios: ["DEM-01"],
    },
    {
      slug: "network",
      title: "Your circle",
      what: "Trusted colleagues, people you have worked with, people PsyAlliance suggests, and everyone else. Moving someone up is your decision, and being trusted by someone does not make you trust them back.",
      focusNote: "Find colleagues by need.",
      scene: w("network", "network-circle"),
      focus: "Find colleagues",
      scenarios: ["DEM-13"],
    },
    {
      slug: "directory",
      title: "Find colleagues by need",
      what: "Search the whole network by focus, state, profession, insurance, language and who has room. Clear the filters to start again, and if nothing matches, the screen says what to loosen.",
      focusNote: "Open a profile.",
      scene: w("network", "network-directory"),
      focus: "Search colleagues",
      scenarios: ["DEM-13", "DEM-21"],
    },
    {
      slug: "colleague",
      title: "Facts, not testimonials",
      what: "Where a colleague is licensed, what they focus on, how current their availability is. From here you can add them to your trusted colleagues, message them, or refer a client.",
      focusNote: "Each action has its own rules.",
      scene: w("network", "network-profile"),
      focus: "Message",
      scenarios: ["DEM-13", "DEM-08"],
    },
    {
      slug: "invite",
      title: "Bring a colleague in",
      what: "Write a personal note and choose why you are inviting them. PsyAlliance prepares the message, and you copy it and send it yourself. Nothing is sent from here, and the draft is kept if you close it.",
      focusNote: "Copy it when you are ready.",
      scene: w("network", "network-invite"),
      focus: "Review invitation",
      actions: [
        { do: "type", target: "#invite-name", text: "Dr. Priya Nair" },
        { do: "pick", target: 'button[data-action="invite-purpose:cover"]' },
      ],
      scenarios: ["DEM-19"],
    },
    {
      slug: "messages",
      title: "One conversation for each context",
      what: "Maya appears once in your inbox. Open her, and her Cover and Referral conversations are kept apart, each with its own history, draft and unread count.",
      focusNote: "Switch between them from the menu above the messages.",
      scene: w("messages", "messages-contexts"),
      focus: "#conversation-context",
      scenarios: ["DEM-14"],
    },
    {
      slug: "retry",
      title: "If a message does not send",
      what: "A message says whether it is sending, sent or failed. If it fails, Retry sends the same message to the same conversation, once, and your next draft is never lost.",
      focusNote: "Retry.",
      scene: w("messages", "messages-failed"),
      focus: "Retry",
      scenarios: ["DEM-15"],
    },
    {
      slug: "media",
      title: "Files and voice notes",
      what: "Attach a file or record a voice note. You see it before it is sent, can remove it, and it stays with the conversation you chose.",
      focusNote: "Nothing is sent until you press send.",
      scene: w("messages", "messages-media"),
      focus: "#message-input",
      scenarios: ["DEM-16"],
    },
  ],
};

const VERIFIED: Journey = {
  key: "verified",
  title: "Join, get verified, stay visible",
  blurb: "What joining involves: your license checked by a person, availability you control and keep current, and the profile colleagues see.",
  minutes: "2 minutes",
  outcome: "Verified, visible, and in control of what colleagues see.",
  learned: [
    "Every license is checked against the state board by a person.",
    "Availability is one number across your states, and you confirm it as things change.",
    "A confirmation counts for 90 days. After that, matching stops treating it as current.",
    "Your profile shows facts colleagues can rely on.",
  ],
  steps: [
    {
      slug: "credentials",
      title: "A person checks every license",
      what: "You add each license, and a PsyAlliance reviewer checks it against the state board. Colleagues see only reviewed licenses, and you are matched only where one is on file.",
      focusNote: "Next, your availability.",
      scene: { kind: "page", page: "verified/credentials" },
      focus: "Availability",
      scenarios: [],
    },
    {
      slug: "availability",
      title: "Your availability",
      what: "A single number of spaces, shared across the states you are licensed in, with each state’s virtual and in-person options. Colleagues see when you last confirmed it.",
      focusNote: "Save and confirm, or confirm that nothing has changed.",
      scene: w("home", "availability"),
      focus: "Save & confirm availability",
      scenarios: ["DEM-17"],
    },
    {
      slug: "fresh",
      title: "Confirmed within 90 days",
      what: "A confirmation counts through the 90th day, inclusive. Until then you are matched as available, and anyone expressing interest in a referral confirms their own capacity as well.",
      focusNote: "Confirm unchanged keeps it current.",
      scene: w("home", "availability-90"),
      focus: "Confirm unchanged",
      scenarios: ["DEM-17"],
    },
    {
      slug: "stale",
      title: "After 90 days, it needs confirming",
      what: "On the 91st day, you are no longer matched as available until you confirm again. A reminder says so, and confirming takes one click.",
      focusNote: "Confirm today.",
      scene: w("home", "availability-91"),
      focus: "Confirm unchanged",
      scenarios: ["DEM-17"],
    },
    {
      slug: "profile",
      title: "The profile colleagues rely on",
      what: "Your focus, who you see and your availability, with dates. You can change any of it, any time.",
      focusNote: "That is joining.",
      scene: { kind: "page", page: "verified/profile" },
      focus: "Edit profile",
      scenarios: [],
    },
  ],
};

const LIBRARY: Journey = {
  key: "library",
  title: "Find the right template",
  blurb: "Planning leave: search the Library for the template, see what is inside, and save it to your own saved resources.",
  minutes: "1½ minutes",
  outcome: "The right template, in the moment you need it.",
  learned: [
    "Six guides and twenty templates for independent practice, each placed beside the work it supports.",
    "Each template says what is inside and whether it has been reviewed before you open it.",
    "Open the PDF to read it, and save it to find it again.",
    "Saved resources are private to you.",
  ],
  steps: [
    {
      slug: "search",
      title: "You search for leave",
      what: "Search the Library, or filter by category. The Extended Leave Pack, the Professional Will and the Reciprocal Coverage Agreement come up, each beside the work it supports.",
      focusNote: "Open the Extended Leave Pack.",
      scene: w("library", "library"),
      focus: "Open resource",
      actions: [{ do: "type", target: "#resource-search", text: "leave" }],
      scenarios: ["DEM-18"],
    },
    {
      slug: "template",
      title: "What is inside the template",
      what: "Before you open it: what is inside, its review status and what to do before you use it. Templates are adapted to your state and your practice.",
      focusNote: "Save it for later.",
      scene: w("library", "library-resource"),
      focus: "Save resource",
      scenarios: ["DEM-18"],
    },
    {
      slug: "saved",
      title: "Saved, and easy to find",
      what: "Saved resources are in one filtered list, private to you. Open one from here, or from the work it belongs to, such as a cover plan, and you come back to where you were.",
      focusNote: "That is the Library.",
      scene: w("library", "library-saved"),
      focus: "Open resource",
      scenarios: ["DEM-18"],
    },
  ],
};

// Pages of the product the approved design does not cover (profile editing,
// the license check). Shown as the product shows them today.
const PROFILE: Journey = {
  key: "profile",
  title: "Set up your profile in a minute",
  blurb: "You paste your Psychology Today profile. Everything fills itself in, your top specialties are ranked, and you check and save.",
  minutes: "1 minute",
  outcome: "A full profile in a minute, checked before it is saved.",
  learned: [
    "Paste your Psychology Today profile, practice website, LinkedIn or CV into Quick start.",
    "Everything filled in is highlighted so you can check it.",
    "Your top specialties are ranked for you; you confirm the order.",
    "Nothing is saved until you press Save profile.",
  ],
  steps: [
    {
      slug: "paste",
      title: "You paste your Psychology Today profile",
      what: "New to PsyAlliance, you copy your existing profile page and paste it into Quick start at the top of Profile. A practice website, LinkedIn or a CV works too.",
      focusNote: "Next, everything fills itself in.",
      scene: { kind: "page", page: "profile/paste" },
      focus: "Fill in from this text",
      actions: [{ do: "type", target: ".quick-start-drop", text: PASTED_PROFILE }],
      scenarios: [],
    },
    {
      slug: "filled",
      title: "Everything fills itself in",
      what: "Title, city, bio, specialties, approaches, ages, insurance and languages are filled in and highlighted, so you can check each one. Nothing is saved yet.",
      focusNote: "Next, your top specialties.",
      scene: { kind: "page", page: "profile/filled" },
      focus: "Practice city",
      scenarios: [],
    },
    {
      slug: "ranked",
      title: "Your top specialties, already in order",
      what: "Your top three are ranked from your profile, and PsyAlliance asks you to check the order. Rank 1 counts most in matching.",
      focusNote: "You check the order and save.",
      scene: { kind: "page", page: "profile/ranked" },
      focus: "#rank-confirm",
      scenarios: [],
    },
    {
      slug: "saved",
      title: "Saved, with what is left listed first",
      what: "The profile is saved. What is still to do comes first: next, your license, which a person checks before you are matched with anyone.",
      focusNote: "That is set-up. Next, a person checks your license.",
      scene: { kind: "page", page: "profile/saved" },
      scenarios: [],
    },
  ],
};

// The two-minute overview: one story told with the other demos' screens.
const reuse = (journey: Journey, slug: string, over: Partial<Step> & Pick<Step, "slug">): Step => {
  const base = journey.steps.find((s) => s.slug === slug);
  if (!base) throw new Error(`No step ${journey.key}/${slug}`);
  return { ...base, ...over };
};

const OVERVIEW: Journey = {
  key: "overview",
  title: "PsyAlliance in two minutes",
  blurb: "Step through the story yourself: you need six weeks away and colleagues cover every client. Plus a glimpse of referring, asking and messaging.",
  minutes: "2 minutes",
  outcome: "Six weeks away, every client covered, by colleagues you chose.",
  learned: [
    "Matches come with reasons: a reviewed license, the right focus and current availability.",
    "You choose who is asked, and in what order, before anything is sent.",
    "Referrals and questions work the same way: the right colleagues, chosen by you.",
    "A person checks every license before anyone can see you.",
  ],
  steps: [
    reuse(COVER, "plan", { slug: "problem", title: "You need six weeks away", what: "Parental leave is coming, and your clients need cover. In private practice that usually means a week of phone calls. Here it starts with the kind of absence and the dates.", focusNote: "Next, you describe each client by need." }),
    reuse(COVER, "clients", { slug: "need", title: "Each client, described by need", what: "Focus, state, age group and setting. Never a name or anything that identifies them.", focusNote: "Next, PsyAlliance finds colleagues for each client." }),
    reuse(COVER, "matches", { slug: "match", title: "The right colleagues, with reasons", what: "For each client: a reviewed license in the right state, the right focus and confirmed availability. Trusted colleagues come first, and every match says why.", focusNote: "You choose who to ask." }),
    reuse(COVER, "review", { slug: "control", title: "You decide who is asked", what: "You see exactly who will be asked, in what order and by when, before anything is sent. No client names ever enter PsyAlliance.", focusNote: "Send. Then the replies come in." }),
    reuse(COVER, "track", { slug: "result", title: "Agreed, then ready", what: "A client is covered once a colleague has said yes, and ready once the handover is confirmed. The plan shows both, separately.", focusNote: "Next, a glimpse of referrals." }),
    reuse(REFER, "shortlist", { slug: "refer", title: "Referrals work the same way", what: "A client you can’t take becomes a shortlist of colleagues who fit, each with the reason, instead of a list of names from memory.", focusNote: "You check who receives it before sending." }),
    reuse(CONSULT, "replies", { slug: "consult", title: "And questions go to people you trust", what: "A focused practice question, shared only with the people you choose, and answered by colleagues you can name.", focusNote: "Next, conversations." }),
    reuse(CIRCLE, "messages", { slug: "messages", title: "One conversation for each context", what: "Messages stay with the cover plan or referral they are about, so a colleague you work with in two ways never mixes them up.", focusNote: "Last, how members are checked." }),
    reuse(VERIFIED, "credentials", { slug: "verified", title: "Everyone here is checked", what: "A person checks each license against the state board before anyone is listed or matched.", focusNote: undefined, focus: undefined }),
  ],
};


// ------------------------------------------------------------------
// Six short walkthroughs, one for each need on the starting page. Each runs
// the real screens on its own practice scenario (src/tour/scenarios.ts), has
// one step to do yourself, and ends on the route that starts the same thing
// in the product. Everyone is fictional and nothing is saved or sent.
const NEED_STEPS = (rows: [Step["slug"], string, string, Scene, string | undefined, string | undefined, Step["recipient"]?, boolean?][]): Step[] =>
  rows.map(([slug, title, what, scene, focus, focusNote, recipient, handsOn]) => ({ slug, title, what, scene, focus, focusNote, recipient, handsOn, scenarios: ["DEM-NEED"] }));

const CASELOAD: Journey = {
  key: "caseload", scenario: "caseload", title: "Establish or rebuild a caseload", minutes: "1 minute",
  blurb: "Rachel has just opened a practice. See how confirming real availability, and a profile colleagues can trust, lets them consider her for referrals.",
  outcome: "Colleagues can see when you have room, and when you do not.",
  learned: ["Your availability is a statement you confirm, and zero is a fine answer.", "Colleagues only see what you choose to show.", "A request tells you the type and nothing about the client until you open it."],
  summary: "Next, review your profile, the states you are licensed in and your settings, then confirm your current capacity before accepting referral requests.",
  cta: { label: "Set up my referral preferences", href: "/start?need=caseload" },
  steps: NEED_STEPS([
    ["capacity", "Confirm your current capacity", "Rachel’s availability is out of date, so colleagues cannot tell whether she has room. She confirms how many new clients she can honestly see, and zero is allowed.", w("home", "availability-91"), "Confirm unchanged", "Next, how colleagues see you.", undefined, true],
    ["profile", "How colleagues see you", "A colleague opening Rachel’s profile sees her licensed states, her focus areas and how recently she confirmed her availability. Nothing about her clients.", w("network", "network-profile"), "Message", "Next, a first request arrives."],
    ["request", "A first request arrives", "A colleague asks whether Rachel can take a client. She reads the anonymous need, then decides: interested, or not now.", w("referrals", "referral-incoming"), "I’m interested", undefined, { who: "Rachel", alert: "Maya has a referral request. Review request.", sees: "The anonymous need, why Rachel fits, and the choice to reply, ask a question or decline." }],
  ]),
};
const TIME_AWAY: Journey = {
  key: "time-away", scenario: "time_away", title: "Arrange time away", minutes: "1 minute",
  blurb: "Six weeks of leave, three clients. Describe each by need, choose who is asked, and see where every handover stands.",
  outcome: "Every client has a colleague, and every handover is ready, before you go.",
  learned: ["Clients are described by need, never by name.", "You review exactly who is asked before anything is sent.", "An agreed colleague is not the same as a ready handover."],
  summary: "Ready to start your Cover plan? Next, add your dates and anonymous client requirements. You’ll review every recipient before anything is sent.",
  cta: { label: "Start my cover plan", href: "/start?need=time_away" },
  steps: NEED_STEPS([
    ["dates", "Your dates and the kind of cover", "Rachel chooses the kind of absence and the dates. The states default to where she is licensed.", w("cover", "cover-new"), "Continue to needs", "Next, who fits.", undefined],
    ["colleagues", "Colleagues who fit, with reasons", "For each client: a reviewed license in the right state, the right focus and recently confirmed availability. Rachel picks who to ask.", w("cover", "cover-matches"), "Review invitations", "Then she reviews before sending.", undefined, true],
    ["review", "Reviewed before anything is sent", "Rachel sees exactly who will be asked, in what order and by when. Nothing is sent until she confirms.", w("cover", "cover-review"), "Send cover requests", undefined, { who: "Maya", alert: "Rachel has a cover request. Review request.", sees: "The anonymous client needs, the dates, and the choice to accept, discuss or decline." }],
  ]),
};
const CLIENT_REFERRAL: Journey = {
  key: "client-referral", scenario: "client_referral", title: "Find a colleague for a client", minutes: "1 minute",
  blurb: "A client Rachel cannot take needs OCD-informed care in New York. Describe the need anonymously and see who fits, and why.",
  outcome: "A short list of colleagues who fit, each with the reason, and you decide who receives it.",
  learned: ["You describe the need, never the person.", "Every match says why it fits.", "You review recipients before anything is sent."],
  summary: "Next, describe the need without identifying the client, look at the matches and why each fits, and review every recipient before anything is sent.",
  cta: { label: "Prepare a client referral", href: "/start?need=client_referral" },
  steps: NEED_STEPS([
    ["need", "Describe the need, not the client", "Focus, state, setting and practicalities. Nothing that identifies anyone.", w("referrals", "referral-new"), "See matched colleagues", "Next, who fits.", undefined],
    ["matches", "Matches, with the reasons", "Each colleague shows why they fit and when they last confirmed availability. Rachel chooses who to ask.", w("referrals", "referral-matches"), "Review before sending", "Then a last look.", undefined, true],
    ["review", "A last look before sending", "Rachel checks exactly who receives the request. Colleagues are notified with the request type only.", w("referrals", "referral-review"), "Send referral", undefined, { who: "Imani", alert: "Rachel has a referral request. Review request.", sees: "The anonymous need and why Imani fits. Replying, asking a question and declining are all fine." }],
  ]),
};
const PERSPECTIVE: Journey = {
  key: "perspective", scenario: "perspective", title: "Get another professional perspective", minutes: "1 minute",
  blurb: "Rachel has a practice question. Write it without identifying details, choose who may see it, and keep the discussion together.",
  outcome: "A focused question in front of the right colleagues, and the replies in one place.",
  learned: ["You choose who may see the question.", "No client details belong in a question.", "Replies stay with the discussion."],
  summary: "Next, write your question without identifying details, choose who may see it and review the recipients. Nothing is posted until you do.",
  cta: { label: "Ask a colleague", href: "/start?need=perspective" },
  steps: NEED_STEPS([
    ["question", "Write the question", "Rachel writes what she wants a second view on, leaving out anything that could identify a client.", w("consult", "consult-ask"), "#peer-title", "Next, who sees it.", undefined, true],
    ["audience", "Choose who may see it", "She picks the colleagues she trusts and reviews the list. Nothing is posted until she confirms.", w("consult", "consult-audience"), "Review before posting", "Then the replies come in.", { who: "Alex", alert: "Rachel has a consultation request. Review request.", sees: "The question and the people it was shared with. Alex can reply, or leave it." }],
    ["replies", "The discussion, in one place", "Replies gather under the question. Rachel can mark what helped.", w("consult", "consult-discussion"), "Useful", undefined, undefined],
  ]),
};
const REDUCING: Journey = {
  key: "reducing", scenario: "reducing", title: "Reduce or wind down practice", minutes: "1 minute",
  blurb: "Rachel is reducing her hours. Keep availability honest, take fewer referrals, and arrange cover for clients she cannot keep.",
  outcome: "Fewer new referrals, honest availability, and a plan for the clients who need a colleague.",
  learned: ["You decide how many new clients to offer, including none.", "Pausing is your choice and never reopens by itself.", "Cover and referrals use the same anonymous steps."],
  summary: "Next, set your availability honestly, then, if some clients need a colleague, start a cover plan or a referral. Nothing is sent until you review it.",
  cta: { label: "Review my availability", href: "/start?need=reducing" },
  steps: NEED_STEPS([
    ["availability", "Say how much room you have", "Rachel lowers her spaces and keeps cover answers honest. Each setting is separate.", w("home", "availability"), "Save & confirm availability", "Next, requests that arrive anyway.", undefined, true],
    ["requests", "Requests that arrive anyway", "When a colleague asks, Rachel sees the need and her own capacity side by side, and can decline kindly.", w("referrals", "referral-capacity"), "Confirm & express interest", "Next, clients who need a colleague.", undefined],
    ["handover", "Clients who need a colleague", "For clients Rachel cannot keep, a cover plan finds colleagues who fit and tracks each handover.", w("cover", "cover-new"), "Continue to needs", undefined, undefined],
  ]),
};
const OFFER_SUPPORT: Journey = {
  key: "offer-support", scenario: "offer_support", title: "Offer support to colleagues", minutes: "1 minute",
  blurb: "Rachel has experience and capacity to share. See how colleagues’ questions and requests reach her, and how she answers in her own time.",
  outcome: "You help when you can, on your terms, and nothing is expected of you.",
  learned: ["You see requests that match your experience.", "Answering is always optional.", "Colleagues you work with are saved in your circle."],
  summary: "Next, confirm your availability and the areas where you are glad to help. Requests reach you only when they fit, and you can always decline.",
  cta: { label: "Set how I can help", href: "/start?need=offer_support" },
  steps: NEED_STEPS([
    ["questions", "Questions you could help with", "Colleagues’ practice questions appear here. Rachel opens the ones that fit her experience.", w("consult", "consult-list"), "Ask a question", "Next, a request for a referral.", undefined, true],
    ["request", "A referral request that fits", "When a request matches, Rachel reads the anonymous need and decides in her own time.", w("referrals", "referral-incoming"), "I’m interested", "Next, her circle.", { who: "Rachel", alert: "Maya has a referral request. Review request.", sees: "The anonymous need, why Rachel fits, and the choice to reply or decline." }],
    ["circle", "Colleagues you work with", "People Rachel works with are kept in her circle, so asking and answering gets easier.", w("network", "network-invite"), "Review invitation", undefined, undefined],
  ]),
};

export const JOURNEYS: Journey[] = [OVERVIEW, COVER, REFER, CONSULT, CIRCLE, VERIFIED, LIBRARY, PROFILE, CASELOAD, TIME_AWAY, CLIENT_REFERRAL, PERSPECTIVE, REDUCING, OFFER_SUPPORT];
export const NEED_DEMOS = ["caseload", "time-away", "client-referral", "perspective", "reducing", "offer-support"];
// The three closer looks offered after the overview; the rest are supporting detail.
export const CLOSER_LOOKS = ["cover", "refer", "consult"];
export const MORE_DETAIL = ["circle", "verified", "library", "profile"];

export const findJourney = (key: string) => JOURNEYS.find((j) => j.key === key) || null;
export const findStep = (key: string, slug: string) => findJourney(key)?.steps.find((s) => s.slug === slug) || null;

// Old tour links land in the demo that now holds that screen.
export const LEGACY_SLUGS: Record<string, string> = {
  profile: "profile",
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

// Steps of the earlier demos that now live under another name. An old link to
// /tour/cover/covered lands on the step that shows that moment.
export const LEGACY_STEPS: Record<string, string> = {
  "cover/invite": "review",
  "cover/maya": "incoming",
  "cover/covered": "track",
  "refer/samuel": "incoming",
  "refer/handoff": "choose",
  "consult/review": "audience",
  "library/pdf": "template",
  "library/mine": "saved",
};

// Where each frame is loaded from. A workspace scene is the approved
// workspace itself; a page scene is the product page it shows.
export const sceneSrc = (demo: string, slug: string, scene: Scene) =>
  scene.kind === "workspace" ? `/tour/scene/${demo}/${slug}` : `/tour/frame/${demo}/${slug}`;
