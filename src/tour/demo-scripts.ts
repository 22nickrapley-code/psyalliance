import type { DemoChapter, DemoScript } from "@/tour/scripts";

// The scripted demos, one for each part of the product a member can open:
// Cover, Referrals, Consult, Network, Messages, Library, the Hub and
// Availability. Each is a walk through the real screens. Keep the facts here
// identical to the fictional sample data (Rachel Davis and her colleagues).

const COVER: DemoScript = {
  key: "cover",
  title: "Cover your time away",
  what: "Cover",
  blurb: "Describe each client by need, see who fits and why, choose who is asked, and see where every handover stands.",
  outcome: "Every client has a colleague, and every handover is ready, before you go.",
  tryHref: "/tour/cover/plan",
  chapters: [
    {
      name: "Plan your time away",
      view: "cover",
      steps: [
        {
          title: "You need time away",
          text: "Parental leave is coming. Covering your clients starts here, on the Cover page.",
          beats: [["click", '[data-action="cover-start"]']],
        },
        {
          title: "Say what kind of cover you need",
          text: "Choose the kind of absence and name the plan. The states start from where you are licensed; add another if a client is elsewhere.",
          beats: [
            ["tick", 'input[name="reason"][value="extended"]'],
            ["type", "#cover-name", "Parental leave"],
            ["click", ".state-picker summary"],
            ["tick", 'input[name="states"][value="NY"]'],
            ["click", "text=Continue to needs"],
          ],
        },
        {
          title: "Each client, described by need",
          text: "Focus, state, age group and setting. Never a name or anything that identifies someone. Add as many clients as you have.",
          beats: [
            ["choose", "#cover-focus", "Anxiety/Panic Disorders"],
            ["choose", "#cover-age", "Adults"],
            ["click", "text=Save & add another"],
            ["choose", "#cover-focus", "Trauma/PTSD"],
            ["choose", "#cover-state", "NY"],
            ["click", "text=Save & add another"],
            ["choose", "#cover-focus", "Depression"],
            ["tick", 'input[name="prescribing"]'],
            ["click", "text=Save client"],
          ],
        },
        {
          title: "Colleagues who fit, with the reasons",
          text: "Only colleagues who match each need are offered, and every match says why. Tick the people you want to ask.",
          beats: [
            ["click", '[data-action="needs-continue"]'],
            ["look", ".match-list"],
            ["tick", 'input[value="maya"]'],
          ],
        },
        {
          title: "Reviewed before anything is sent",
          text: "You see exactly who is asked, in what order and by when. Nothing goes out until you tick that you have checked it.",
          beats: [
            ["click", '[data-action="cover-review"]'],
            ["choose", "#cover-deadline", "24"],
            ["tick", 'input[name="reviewed"]'],
            ["click", "text=Send cover requests"],
          ],
        },
      ],
    },
    {
      name: "See where each client stands",
      view: "cover",
      steps: [
        {
          title: "One picture of every client",
          text: "Open a plan and the journey bar shows where you are: asked, agreed, handover, ready. Each client has a row saying who covers them.",
          beats: [
            ["click", ".arrangement-row"],
            ["look", ".journey-bar"],
            ["look", ".client-table-head"],
          ],
        },
        {
          title: "Agreed is not the same as ready",
          text: "A colleague saying yes is not a finished handover. You confirm each one yourself: contact, a short summary, and the client told.",
          beats: [
            ["look", ".needs-box"],
            ["click", '[data-action="handover:1:2"]'],
            ["tick", 'input[name="contact"]'],
            ["tick", 'input[name="summary"]'],
            ["tick", 'input[name="client"]'],
            ["click", "text=Mark handover ready"],
          ],
        },
      ],
    },
    {
      name: "When a colleague asks you",
      view: "cover",
      steps: [
        {
          title: "A colleague asks you for cover",
          text: "Cover works both ways. Their request arrives with what the client needs and when, and you answer in one place.",
          beats: [["click", ".arrangement-row.row-reply"], ["look", ".needs-box"]],
        },
        {
          title: "Say yes, or ask first",
          text: "Answer yes, ask a question first, or say you are not available. Nobody is chased, and nothing is sent until you choose.",
          beats: [["click", "text=I can help"]],
        },
      ],
    },
  ],
};


const REFER: DemoScript = {
  key: "refer",
  title: "Refer a client",
  what: "Referrals",
  blurb: "Describe the need, see who fits and why, choose who is asked, then choose from the colleagues who are interested.",
  outcome: "The right colleague, chosen by you, with their current capacity confirmed.",
  tryHref: "/tour/refer/need",
  chapters: [
    {
      name: "Make a referral",
      view: "referrals",
      steps: [
        {
          title: "A client you can’t take",
          text: "Start on the Referrals page. You describe what the client needs and where they are, never who they are.",
          beats: [["click", '[data-action="referral-start"]']],
        },
        {
          title: "The need, and the place",
          text: "The main need and the state are enough. Setting, age group, language and a prescriber narrow the search if you need them to.",
          beats: [
            ["choose", "#referral-focus", "Anxiety/Panic Disorders"],
            ["choose", "#referral-state", "NY"],
            ["click", "text=See matched colleagues"],
          ],
        },
        {
          title: "A shortlist that explains itself",
          text: "Only colleagues who fit are offered, each with the reasons: licensed in the state, works with this need, accepting referrals now. Up to three are chosen to start, and you can change them.",
          beats: [
            ["look", '[data-action="match-profile:rena"]'],
            ["look", '[data-action="workflow-resource:107"]'],
            ["click", '[data-action="referral-review"]'],
          ],
        },
        {
          title: "Exactly who receives it",
          text: "Send it to the colleagues you chose, to your trusted colleagues, or to the verified network. Say when the client needs to start, and confirm nothing identifies them.",
          beats: [
            ["tick", 'input[name="audience"][value="selected"]'],
            ["choose", "#timeframe", "Within two weeks"],
            ["type", "#referral-message", "Evening availability would help. A calm, steady approach."],
            ["tick", 'input[name="reviewed"]'],
            ["click", "text=Send referral"],
          ],
        },
      ],
    },
    {
      name: "Choose who takes the client",
      view: "referrals",
      macro: "referral-detail",
      steps: [
        {
          title: "Where the referral stands",
          text: "Asked, interested, placed. Replies arrive here, and you are told as soon as a colleague answers. Nothing is placed until you choose.",
          beats: [["look", ".modal [class*=progress], .modal [class*=track], .modal h1, .modal h2"], ["look", '[data-action="referral-thread:1:maya"]']],
        },
        {
          title: "Interest is not a placement",
          text: "Talk with any colleague who is interested. When you have decided, choose one. The others are told it has been placed.",
          beats: [["click", '[data-action="referral-choose:1:maya"]'], ["look", "text=Confirm placement"], ["click", "text=Confirm placement"]],
        },
      ],
    },
    {
      name: "When a referral comes to you",
      view: "referrals",
      macro: "referral-incoming",
      steps: [
        {
          title: "A colleague asks you",
          text: "Eli has a client who needs someone soon. You see the need and the setting, and you answer: interested, discuss first, or not available.",
          beats: [["look", '[data-action="referral-answer:3:interested"]'], ["click", '[data-action="referral-answer:3:interested"]']],
        },
        {
          title: "Confirm your capacity first",
          text: "Before saying you are interested you confirm you have capacity now. It does not reserve a place; only the referring colleague chooses.",
          beats: [["tick", 'input[name="capacity"]'], ["click", "text=Confirm & express interest"]],
        },
      ],
    },
  ],
};

const CONSULT: DemoScript = {
  key: "consult",
  title: "Ask colleagues a question",
  what: "Consult",
  blurb: "Find a discussion by topic, read and mark the replies, then ask your own question to the people you choose.",
  outcome: "Answers from named, verified colleagues, shared only with the people you chose.",
  tryHref: "/tour/consult/list",
  chapters: [
    {
      name: "Find a discussion",
      view: "consult",
      steps: [
        {
          title: "Questions from your colleagues",
          text: "The questions you can see: ones you asked, ones you follow, and ones shared with you. Every one is labelled with its topic.",
          beats: [["look", "#consult-results"]],
        },
        {
          title: "Filter by topic, or search",
          text: "Narrow the list to clinical practice, resources or professional life. Search finds a title, a colleague, a tag, or a word from a reply.",
          beats: [
            ["click", '[data-action="consult-topic:Professional life"]'],
            ["click", '[data-action="consult-topic:"]'],
            ["type", "#consult-search", "burnout"],
          ],
        },
        {
          title: "Read the replies",
          text: "Replies come from named colleagues, newest first. Mark what helped (only you see that), and reply yourself.",
          beats: [
            ["click", '[data-action="discussion:1"]'],
            ["look", "#reply-d1-reply-0"],
            ["click", '[data-action="useful:1:d1-reply-0"]'],
          ],
        },
        {
          title: "Reply, and ask a clarifying question",
          text: "Add your perspective. If you need to know more before you can help, tick that this is a clarifying question, so the author sees it as one.",
          beats: [
            ["type", "#discussion-reply", "I found a fixed weekly hour with no clients booked helped most. Do you have one?"],
            ["tick", 'input[name="clarifying"]'],
            ["click", "text=Post reply"],
          ],
        },
      ],
    },
    {
      name: "Ask your own question",
      view: "consult",
      steps: [
        {
          title: "A focused question",
          text: "A short title and a little context. Nothing that identifies a client, and you confirm that before it can be posted.",
          beats: [
            ["click", '[data-action="peer-start"]'],
            ["type", "#peer-title", "How do you end therapy when a client is moving away?"],
            ["type", "#peer-body", "A long-term client is relocating abroad in the spring. I would like to plan the last sessions well."],
          ],
        },
        {
          title: "You choose who sees it",
          text: "Your trusted colleagues, one person, a few people you pick, one of your groups, or the verified network. You see exactly who can read and reply.",
          beats: [
            ["tick", 'input[name="audience"][value="few"]'],
            ["tick", 'input[name="recipients"][value="rena"]'],
            ["tick", 'input[name="recipients"][value="maya"]'],
            ["tick", 'input[name="reviewed"]'],
            ["click", "text=Review before posting"],
          ],
        },
      ],
    },
  ],
};

const CIRCLE: DemoScript = {
  key: "circle",
  title: "Your circle and the network",
  what: "Network",
  blurb: "Your trusted colleagues, how to find anyone by need, a colleague’s profile, and how to bring someone in.",
  outcome: "Who is around you, who fits a need, and a way to bring a colleague in.",
  tryHref: "/tour/circle/network",
  chapters: [
    {
      name: "Your circle",
      view: "network",
      steps: [
        {
          title: "People you trust, close to you",
          text: "Trusted colleagues, people you have worked with, people PsyAlliance suggests, and everyone else. Moving someone up is your decision.",
          beats: [
            ["look", ".circle-map"],
            ["look", "#net-trusted"],
            ["click", '[data-action="network-tier:worked"]'],
          ],
        },
        {
          title: "Trust is yours to give",
          text: "Add someone to your trusted colleagues, or remove them, in one click. Being trusted by someone does not make you trust them back.",
          beats: [["click", '[data-action="network-tab:circle"]'], ["look", '[data-action="trust:alex"]'], ["click", '[data-action="trust:alex"]']],
        },
      ],
    },
    {
      name: "Find a colleague by need",
      view: "network",
      macro: "network-directory",
      steps: [
        {
          title: "Search the whole network",
          text: "Search by specialty, state, profession, insurance, language, and who has room. Compact cards show what you need to decide.",
          beats: [
            ["choose", "#modal-dir-focus", "Anxiety/Panic Disorders"],
            ["choose", "#modal-dir-state", "NY"],
            ["tick", 'input[name="available"]'],
            ["click", "text=Search colleagues"],
            ["look", "#directory-results"],
          ],
        },
        {
          title: "By relationship",
          text: "See only your trusted colleagues, people you have worked with, or people you have not met yet. Clear the filters to start again.",
          beats: [["click", '[data-action="directory-tier:trusted"]'], ["click", '[data-action="directory-tier:all"]']],
        },
      ],
    },
    {
      name: "A colleague’s profile",
      view: "network",
      macro: "network-profile",
      steps: [
        {
          title: "Facts, not testimonials",
          text: "Where a colleague is licensed, what they focus on, how current their availability is, and how you have worked together.",
          beats: [["look", ".modal h2"], ["scroll", '[data-action="profile-referral:imani"]']],
        },
        {
          title: "What you can do from here",
          text: "Message them, refer a client, ask for cover, add or remove trust, or exclude them from suggestions. Each action has its own rules.",
          beats: [["look", '[data-action="profile-referral:imani"]'], ["look", '[data-action="profile-cover:imani"]'], ["look", '[data-action="exclude-toggle:imani"]']],
        },
      ],
    },
    {
      name: "Bring a colleague in",
      view: "network",
      macro: "network-invite",
      steps: [
        {
          title: "Why you are inviting them",
          text: "Choose the reason and write a personal note. PsyAlliance prepares the message; you copy it and send it yourself.",
          beats: [
            ["type", "#invite-name", "Dr. Priya Nair"],
            ["click", '[data-action="invite-purpose:cover"]'],
            ["type", "#invite-note", "I would love to have you in my circle for cover."],
            ["click", "text=Review invitation"],
          ],
        },
      ],
    },
  ],
};

const HUB: DemoScript = {
  key: "hub",
  title: "Your day on the Hub",
  what: "Hub",
  blurb: "A calm start: what needs you, where to begin, questions from colleagues, and your availability.",
  outcome: "You know what is waiting and where to start.",
  tryHref: "/tour/circle/home",
  chapters: [
    {
      name: "What needs you",
      view: "home",
      steps: [
        {
          title: "A calm start to the day",
          text: "Your greeting sits in the top bar. Below it are the four places you work in: Cover, Referrals, Consult and Network / Search.",
          beats: [["look", ".breadcrumbs strong, .hub-hello"], ["look", ".hub-areas"]],
        },
        {
          title: "What is waiting, without the noise",
          text: "A small count on Cover or Referrals shows what needs you. Click it to go straight to those items.",
          beats: [["look", ".hub-area-count"]],
        },
        {
          title: "Start anything from here",
          text: "Plan cover, make a referral, ask a question, or search the network, each one click away.",
          beats: [["look", '[data-action="cover-start"]'], ["look", '[data-action="referral-start"]'], ["look", '[data-action="directory"]']],
        },
      ],
    },
    {
      name: "Your colleagues, your availability",
      view: "home",
      steps: [
        {
          title: "Questions from your colleagues",
          text: "Recent discussions from people you trust, with their topic. Join one, or follow it to keep it in your list.",
          beats: [["scroll", "#home-discussions"], ["look", '[data-action="discussion:1"]']],
        },
        {
          title: "Keep your availability current",
          text: "Colleagues rely on it. Confirm it is unchanged in one click, or edit what has changed.",
          beats: [["scroll", '[data-action="availability"]'], ["look", '[data-action="availability-reconfirm"]']],
        },
      ],
    },
  ],
};

const MESSAGES: DemoScript = {
  key: "messages",
  title: "Conversations in context",
  what: "Messages",
  blurb: "One inbox, with each colleague’s Cover and Referral conversations kept apart.",
  outcome: "Every conversation stays with the work it belongs to.",
  tryHref: "/tour/circle/messages",
  chapters: [
    {
      name: "Your inbox",
      view: "messages",
      steps: [
        {
          title: "One inbox",
          text: "Every colleague appears once. Filter by Cover, Referral or Group, or search by name or a word you remember.",
          beats: [
            ["look", "#inbox-list"],
            ["click", '[data-action="inbox-filter:Cover"]'],
            ["click", '[data-action="inbox-filter:All"]'],
          ],
        },
        {
          title: "Reply in one place",
          text: "Open a conversation, write your message and send it. You see whether it is sending, sent, or failed.",
          beats: [
            ["click", '[data-action="thread:rena-cover"]'],
            ["type", "#message-input", "Thursday still works for me. I will bring the handover summary."],
            ["click", ".send-button"],
          ],
        },
      ],
    },
    {
      name: "One person, several contexts",
      view: "messages",
      macro: "messages-contexts",
      steps: [
        {
          title: "Cover and Referral, kept apart",
          text: "Maya appears once in your inbox. Her Cover and Referral conversations each have their own history, draft and unread count.",
          beats: [["look", '[data-action="inbox-person:maya"]'], ["look", "#conversation-context"]],
        },
        {
          title: "Switch from the menu",
          text: "Move between a colleague’s conversations from the menu above the messages, and jump to the plan or referral it is about.",
          beats: [["choose", "#conversation-context", "Referral"], ["look", '[data-action="referral:1"]']],
        },
      ],
    },
    {
      name: "If a message does not send",
      view: "messages",
      macro: "messages-failed",
      steps: [
        {
          title: "A failed message says so",
          text: "If a message cannot be sent, it says so plainly. Your words are kept, and nothing is lost.",
          beats: [["look", '[data-action^="message-retry"]']],
        },
        {
          title: "Retry sends it once",
          text: "Retry sends the same message to the same conversation, once. Your next draft is never lost.",
          beats: [["click", '[data-action^="message-retry"]']],
        },
      ],
    },
  ],
};

const LIBRARY: DemoScript = {
  key: "library",
  title: "Find the right template",
  what: "Library",
  blurb: "Planning leave: search the Library, see what is inside a template, and save it.",
  outcome: "The right template, in the moment you need it.",
  tryHref: "/tour/library/search",
  chapters: [
    {
      name: "Find a template",
      view: "library",
      steps: [
        {
          title: "Search for what you need",
          text: "Search the Library or filter by category. Each resource sits beside the work it supports.",
          beats: [["type", "#resource-search", "leave"], ["look", "#library-results"]],
        },
        {
          title: "What is inside",
          text: "Before you open it: what is inside, its review status, and what to do before you use it. Templates are adapted to your state and practice.",
          beats: [["click", '[data-action="resource:102"]'], ["look", ".modal h2"]],
        },
        {
          title: "Saved, and easy to find",
          text: "Save it and it joins your saved list, private to you. Open it later from here, or from the cover plan it belongs to.",
          beats: [["click", '[data-action="resource-save:102"]'], ["do", "close-modal"], ["click", '[data-action="resource-filter:Saved"]']],
        },
      ],
    },
  ],
};

const AVAILABILITY: DemoScript = {
  key: "availability",
  title: "Keep your availability current",
  what: "Availability",
  blurb: "Say who you take referrals from, how many spaces you have, and where, and keep it confirmed.",
  outcome: "Colleagues see current, honest availability, in your words.",
  tryHref: "/tour/verified/availability",
  chapters: [
    {
      name: "Set your availability",
      view: "home",
      macro: "availability",
      steps: [
        {
          title: "Who you take referrals from",
          text: "Accepting referrals, selected referrals only, or not accepting. Selected only means you are asked, never matched automatically.",
          beats: [["tick", 'input[name="referrals"][value="limited"]']],
        },
        {
          title: "Spaces, and where",
          text: "How many spaces you have, which states, and whether you see people virtually or in person. Pause it if you need a break.",
          beats: [["type", "#availability-slots", "1"], ["tick", 'input[name="inPerson-NY"]']],
        },
        {
          title: "Cover and consultation",
          text: "Say whether you can cover for colleagues, or only when asked, and keep the box ticked if you are open to consultation questions.",
          beats: [["tick", 'input[name="cover"][value="ask"]'], ["look", 'input[name="consult"]']],
        },
        {
          title: "Saved, and confirmed today",
          text: "Saving confirms it is current. Colleagues see when you last did, so they can rely on it.",
          beats: [["click", "text=Save & confirm availability"]],
        },
      ],
    },
  ],
};

// The public "PsyAlliance in two minutes": the best of the longer demos, in one run.
const pick = (s: DemoScript, c: number, steps: number[], name: string): DemoChapter => ({ ...s.chapters[c], name, steps: steps.map((i) => s.chapters[c].steps[i]) });
const OVERVIEW: DemoScript = {
  key: "overview",
  title: "PsyAlliance in two minutes",
  what: "PsyAlliance",
  blurb: "Cover for time away, a referral out, a question to colleagues, and messages that keep each context apart.",
  outcome: "Your own practice, with a group behind you.",
  tryHref: "/join",
  chapters: [
    pick(COVER, 0, [0, 1, 2, 3, 4], "Cover"),
    pick(REFER, 0, [0, 1, 2], "Referrals"),
    pick(CONSULT, 1, [0, 1], "Consult"),
    pick(MESSAGES, 1, [0, 1], "Messages"),
  ],
};

export const DEMO_SCRIPTS: Record<string, DemoScript> = { cover: COVER, refer: REFER, consult: CONSULT, circle: CIRCLE, hub: HUB, messages: MESSAGES, library: LIBRARY, availability: AVAILABILITY, overview: OVERVIEW };
export const findScript = (key: string) => DEMO_SCRIPTS[key] || null;
