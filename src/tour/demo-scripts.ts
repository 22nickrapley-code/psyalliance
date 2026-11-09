import type { DemoChapter, DemoScript } from "@/tour/scripts";

// The scripted demos, one for each part of the product a member can open:
// Cover, Referrals, Consult, Network, Messages, Library, the Hub and
// Availability, and one for each job on the public site. Each is a walk through
// the real screens. Keep the facts here identical to the fictional sample data.
// v7 (Nick, 9 Nov): every caption says "you", says what is about to happen, and
// the screen then does exactly that and finishes it.

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
          title: "Start a cover plan",
          text: "Your plans sit on the left of the Cover page, and colleagues’ requests on the right. Press Plan cover to start.",
          beats: [["look", ".split-lists"], ["click", '[data-action="cover-start"]']],
        },
        {
          title: "Say what kind of cover you need",
          text: "Choose the kind of absence and name the plan, then add any state where a client lives. You could also import your whole caseload from a spreadsheet.",
          beats: [
            ["look", ".import-panel"],
            ["tick", 'input[name="reason"][value="extended"]'],
            ["type", "#cover-name", "Parental leave"],
            ["click", ".state-picker summary"],
            ["tick", 'input[name="states"][value="NY"]'],
            ["click", "text=Continue to needs"],
          ],
        },
        {
          title: "Each client, described by need",
          text: "Add each client by need: focus, state, age group and setting. Never a name. Here, three clients are saved one after another.",
          beats: [
            ["choose", "#cover-focus", "Anxiety/Panic Disorders"],
            ["choose", "#cover-age", "Adults"],
            ["click", "text=Save & add another"],
            ["choose", "#cover-focus", "Trauma/PTSD"],
            ["choose", "#cover-state", "NY"],
            ["click", "text=Save & add another"],
            ["choose", "#cover-focus", "Depression"],
            ["click", "text=Save client"],
            ["look", ".client-discs"],
          ],
        },
        {
          title: "The best colleagues, already chosen",
          text: "Continue, and up to two of the best matches are chosen for each client, with the reasons they fit. Switch clients on the left to check each one.",
          beats: [
            ["click", '[data-action="needs-continue"]'],
            ["look", ".match-list"],
            ["click", '[data-action="match-client:2"]'],
            ["look", ".client-match-tabs"],
          ],
        },
        {
          title: "Reviewed, then sent",
          text: "Review exactly who is asked and by when. Tick that you have checked it, and send. Nothing goes out before that.",
          beats: [
            ["click", '[data-action="cover-review"]'],
            ["choose", "#cover-deadline", "24"],
            ["tick", 'input[name="reviewed"]'],
            ["click", "text=Send cover requests"],
          ],
          hold: 1,
        },
      ],
    },
    {
      name: "Where each client stands",
      view: "cover",
      macro: "cover-plan",
      steps: [
        {
          title: "One picture of every client",
          text: "Open a plan. The line at the top shows asked, interested, chosen and handover, and Needs from you lists anything waiting on you.",
          beats: [["look", ".jt"], ["look", ".needs-box"], ["look", ".cdisc-row"]],
        },
        {
          title: "Agreed, then ready",
          text: "A colleague saying yes is not a finished handover. Confirm each one yourself once contact, a summary and the client are sorted.",
          beats: [
            ["click", '[data-action="handover:1:2"]'],
            ["tick", 'input[name="contact"]'],
            ["tick", 'input[name="summary"]'],
            ["tick", 'input[name="client"]'],
            ["click", "text=Confirm handover"],
          ],
          hold: 1,
        },
      ],
    },
    {
      name: "When a colleague asks you",
      view: "cover",
      macro: "cover-incoming",
      steps: [
        {
          title: "A colleague asks you for cover",
          text: "Their request opens with the need in one box and their message below it, so you can decide quickly.",
          beats: [["look", ".modal .need-card"], ["look", ".modal .need-message"]],
        },
        {
          title: "Say you can cover",
          text: "Press I can cover. The colleague who asked chooses who covers, and you hear either way.",
          beats: [["click", '[data-action^="cover-answer:4:1:interested"]'], ["look", ".modal .reply-panel"]],
          hold: 1,
        },
      ],
    },
  ],
};


const REFER: DemoScript = {
  key: "refer",
  title: "Refer a client",
  what: "Referrals",
  blurb: "Describe the need, see who fits and why, choose who is asked, then choose from the colleagues who can accept.",
  outcome: "The right colleague, chosen by you, with their current capacity confirmed.",
  tryHref: "/tour/refer/need",
  chapters: [
    {
      name: "Make a referral",
      view: "referrals",
      steps: [
        {
          title: "A client you can’t take",
          text: "Referrals you send sit on the left, and referrals sent to you on the right. Press Refer a client to start.",
          beats: [["look", ".split-lists"], ["click", '[data-action="referral-start"]']],
        },
        {
          title: "The need, and the place",
          text: "Choose the main need and the state the client is in. Everything else only narrows the search. Then see who fits.",
          beats: [
            ["choose", "#referral-focus", "Anxiety/Panic Disorders"],
            ["choose", "#referral-state", "NY"],
            ["click", "text=See matched colleagues"],
          ],
        },
        {
          title: "A shortlist that explains itself",
          text: "Only colleagues who fit are offered, each with the reasons. The best are chosen to start; change them if you like, then review.",
          beats: [["look", ".match-list"], ["click", '[data-action="referral-review"]']],
        },
        {
          title: "Exactly who receives it",
          text: "Choose who receives it, say when the client needs to start, add a note, and confirm nothing identifies them. Then send.",
          beats: [
            ["tick", 'input[name="audience"][value="selected"]'],
            ["choose", "#timeframe", "Within two weeks"],
            ["type", "#referral-message", "Evening availability would help."],
            ["tick", 'input[name="reviewed"]'],
            ["click", "text=Send referral"],
          ],
          hold: 1,
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
          text: "The line runs from you to the colleague who takes the client. Replies arrive in the card, and nothing is agreed until you choose.",
          beats: [["look", ".modal .jt"], ["look", '.modal [data-action^="referral-choose:1:"]']],
        },
        {
          title: "Agree the referral",
          text: "Choose the colleague who can accept, check the record, and agree. Everyone else asked is thanked and told.",
          beats: [["click", '[data-action^="referral-choose:1:"]'], ["look", ".modal .hv-card"], ["click", ".modal-footer .button.primary"]],
          hold: 1,
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
          text: "The need is in one box and the colleague’s message below it. Answer that you can accept, ask a question first, or say you can’t.",
          beats: [["look", ".modal .need-card"], ["click", '[data-action="referral-answer:3:interested"]']],
        },
        {
          title: "Confirm your capacity",
          text: "Tick that you have room now and confirm. It doesn’t reserve a place: the colleague who referred chooses.",
          beats: [["tick", 'input[name="capacity"]'], ["click", "text=Confirm, I can accept this referral"]],
          hold: 1,
        },
      ],
    },
  ],
};

const CONSULT: DemoScript = {
  key: "consult",
  title: "Ask colleagues a question",
  what: "Consult",
  blurb: "Ask a question of the people you choose, then read, mark and reply to the answers.",
  outcome: "Answers from named, verified colleagues, shared only with the people you chose.",
  tryHref: "/tour/consult/list",
  chapters: [
    {
      name: "Ask your question",
      view: "consult",
      steps: [
        {
          title: "A focused question",
          text: "Press Ask a question. Give it a short title and a little context, without anything that identifies a client.",
          beats: [
            ["click", '[data-action="peer-start"]'],
            ["type", "#peer-title", "How do you end therapy when a client is moving away?"],
            ["type", "#peer-body", "A long-term client is relocating in the spring. I would like to plan the last sessions well."],
          ],
        },
        {
          title: "You choose who sees it",
          text: "Pick the colleagues who may read and reply: here, two trusted colleagues. Then review the question before it is posted.",
          beats: [
            ["tick", 'input[name="audience"][value="few"]'],
            ["tick", 'input[name="recipients"][value="rena"]'],
            ["tick", 'input[name="recipients"][value="maya"]'],
            ["click", "text=Review before posting"],
          ],
          hold: 1,
        },
      ],
    },
    {
      name: "Read and reply",
      view: "consult",
      steps: [
        {
          title: "Questions from your colleagues",
          text: "Every question you can see is listed with its topic. Filter by topic, or search for a word you remember.",
          beats: [
            ["look", "#consult-results"],
            ["click", '[data-action="consult-topic:Professional life"]'],
            ["click", '[data-action="consult-topic:"]'],
          ],
        },
        {
          title: "Read the replies",
          text: "Open a discussion. Replies come from named colleagues; mark the one that helped. Only you see that.",
          beats: [["click", '[data-action="discussion:1"]'], ["look", "#reply-d1-reply-0"], ["click", '[data-action="useful:1:d1-reply-0"]']],
        },
        {
          title: "Add your reply",
          text: "Write your perspective and post it. The person who asked is told straight away.",
          beats: [
            ["type", "#discussion-reply", "A fixed weekly hour with no clients booked helped me most."],
            ["click", "text=Post reply"],
          ],
          hold: 1,
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
  blurb: "A calm start: what needs you, three places to start something, and your availability in one click.",
  outcome: "You know what is waiting and where to start.",
  tryHref: "/tour/circle/home",
  chapters: [
    {
      name: "The Hub",
      view: "home",
      steps: [
        {
          title: "A calm start to the day",
          text: "Your greeting sits at the top. One line says how many things need you, and three cards below start a referral, plan cover or ask a question.",
          beats: [["look", ".hub-hello"], ["look", ".hub-attn-toggle"], ["look", ".hub-services"]],
        },
        {
          title: "Everything that needs you, in one list",
          text: "Open the list to see every request and task waiting for you, grouped by Referrals, Cover and Consult. Click any line to open it. Close the list when you’re done.",
          beats: [["click", ".hub-attn-toggle"], ["look", ".hub-attn-panel .hub-group"], ["look", ".hub-row.is-clickable"], ["click", ".hub-attn-toggle"]],
        },
        {
          title: "Your availability, one click away",
          text: "Under each card, say whether you are taking referrals, can cover and are open to questions. Here, referrals change to Selected only, then back.",
          beats: [
            ["click", '[data-action="hub-av:referrals:limited"]'],
            ["look", ".hub-av-line"],
            ["click", '[data-action="hub-av:referrals:yes"]'],
          ],
        },
        {
          title: "Start anything from here",
          text: "Press a card to start: here, Refer a client. Nothing is sent until you say so. Close it, and you are back on the Hub.",
          beats: [["click", '[data-action="referral-start"]'], ["look", ".modal #referral-focus"], ["do", "close-modal"], ["look", ".hub-services"]],
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
          text: "Every colleague appears once, by most recent or by most conversations. Search by name or a word you remember.",
          beats: [
            ["look", "#inbox-list"],
            ["click", '[data-action="inbox-sort:most"]'],
            ["click", '[data-action="inbox-sort:recent"]'],
          ],
        },
        {
          title: "Reply in one place",
          text: "Open a conversation, write your message and send it. You see whether it is sending, sent, or failed.",
          beats: [
            ["click", '[data-action="colleague:rena"]'],
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
          beats: [["click", '[data-action="colleague:maya"]'], ["look", ".colleague-tabs"]],
        },
        {
          title: "Switch with the tabs",
          text: "Move between a colleague’s conversations with the tabs on their card: General, Referrals, Cover and All.",
          beats: [["click", '[data-action="person-tab:referrals"]'], ["look", ".context-row"]],
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
  blurb: "Templates and guides for the parts of practice that are easy to put off: leave, closing, continuity. Search, check what is inside, and keep a copy.",
  outcome: "The right template, in the moment you need it.",
  tryHref: "/tour/library/search",
  chapters: [
    {
      name: "Find a template",
      view: "library",
      steps: [
        {
          title: "Search for what you need",
          text: "Type what you need into the Library search: here, leave. Templates and guides that match appear straight away.",
          beats: [["type", "#resource-search", "leave"], ["look", "#library-results"]],
        },
        {
          title: "What is inside",
          text: "Open a template to see what is inside and what to check before you use it, before you download anything.",
          beats: [["click", '[data-action="resource:102"]'], ["look", ".modal h2"]],
        },
        {
          title: "Open it, download it, keep a copy",
          text: "Open the PDF, or download it to adapt to your practice. Close it, and you are back in the Library.",
          beats: [["look", ".modal .before-use"], ["look", ".modal-footer"], ["do", "close-modal"], ["look", "#library-results"]],
        },
        {
          title: "The things that are easy to put off",
          text: "A professional will is one many clinicians mean to write. Search for it, and the template and its steps are ready when you are.",
          beats: [["type", "#resource-search", "will"], ["look", "#library-results"]],
          hold: 1,
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
          text: "How many spaces you have, which states, and whether you see people virtually or in person. Pausing stops new requests only, never work under way, and it does not reopen by itself: you decide when to resume.",
          beats: [["type", "#availability-slots", "1"], ["tick", 'input[name="inPerson-NY"]']],
        },
        {
          title: "Cover and consultation",
          text: "Say whether you can cover for colleagues, or only when asked, and keep the box ticked if you are open to consultation questions.",
          beats: [["tick", 'input[name="cover"][value="ask"]'], ["look", 'input[name="consult"]']],
        },
        {
          title: "Saved, and confirmed today",
          text: "Saving confirms it is current. Colleagues see when you last did, so they can rely on it. If you ask for an alert, it is one short line: a first name, the kind of request, and Review request.",
          beats: [["click", "text=Save & confirm availability"]],
        },
      ],
    },
  ],
};

// The public demos (v7, Nick 9 Nov): one per job a member comes for, built from the same steps as the in-app demos,
// so every demo shows the product exactly as it is. "Just explore" is the whole story in about two minutes.
const pick = (s: DemoScript, c: number, steps: number[], name: string): DemoChapter => ({ ...s.chapters[c], name, steps: steps.map((i) => s.chapters[c].steps[i]) });
const OVERVIEW: DemoScript = {
  key: "overview",
  title: "PsyAlliance in two minutes",
  what: "PsyAlliance",
  blurb: "The Hub, cover for time away, a referral, a question to colleagues, and the Library, on the real screens.",
  outcome: "Your own practice, with a group behind you.",
  tryHref: "/join",
  chapters: [
    pick(HUB, 0, [0, 1], "The Hub"),
    pick(COVER, 0, [0, 1, 2, 3, 4], "Cover"),
    pick(REFER, 0, [0, 1, 2], "Referrals"),
    pick(CONSULT, 0, [0, 1], "Consult"),
    pick(LIBRARY, 0, [0, 1, 2], "Library"),
  ],
};

const TIME_AWAY: DemoScript = {
  key: "time-away",
  title: "Arrange time away",
  what: "Cover",
  blurb: "Describe each client by need, let PsyAlliance choose the best colleagues, review who is asked, and see every handover through.",
  outcome: "Every client has a colleague, and every handover is ready, before you go.",
  tryHref: "/join",
  chapters: [pick(COVER, 0, [0, 1, 2, 3, 4], "Plan your time away"), pick(COVER, 1, [0, 1], "Where each client stands")],
};

const CLIENT_REFERRAL: DemoScript = {
  key: "client-referral",
  title: "Find a colleague for a client",
  what: "Referrals",
  blurb: "Describe the need, see who fits and why, choose who is asked, then agree with the colleague who can take the client.",
  outcome: "The right colleague, chosen by you, with their current capacity confirmed.",
  tryHref: "/join",
  chapters: [pick(REFER, 0, [0, 1, 2, 3], "Make a referral"), pick(REFER, 1, [0, 1], "Choose who takes the client")],
};

const CASELOAD: DemoScript = {
  key: "caseload",
  title: "Establish or rebuild my caseload",
  what: "Referrals",
  blurb: "Say honestly how much room you have, and answer the referrals colleagues send you.",
  outcome: "Colleagues can see when you have room, and when you do not.",
  tryHref: "/join",
  chapters: [
    {
      name: "Say you have room",
      view: "home",
      macro: "availability",
      steps: [
        {
          title: "Take referrals",
          text: "Open your availability and choose Accepting referrals, so colleagues with a client who fits can find you.",
          beats: [["tick", 'input[name="referrals"][value="yes"]']],
        },
        {
          title: "How many spaces, and where",
          text: "Say how many new clients you can take, and where you see people. Zero is a fine answer.",
          beats: [["type", "#availability-slots", "3"], ["tick", 'input[name="inPerson-NY"]']],
        },
        {
          title: "Saved, and confirmed today",
          text: "Save it. Colleagues see that it was confirmed today, so they can rely on it.",
          beats: [["click", "text=Save & confirm availability"]],
          hold: 1,
        },
      ],
    },
    pick(REFER, 2, [0, 1], "When a referral comes to you"),
  ],
};

const PERSPECTIVE: DemoScript = {
  key: "perspective",
  title: "Get another professional perspective",
  what: "Consult",
  blurb: "Ask a focused question of the colleagues you choose, and keep the discussion together.",
  outcome: "Answers from named, verified colleagues, shared only with the people you chose.",
  tryHref: "/join",
  chapters: [pick(CONSULT, 0, [0, 1], "Ask your question"), pick(CONSULT, 1, [1, 2], "Read and reply")],
};

const REDUCING: DemoScript = {
  key: "reducing",
  title: "Reduce or close my practice",
  what: "Your practice",
  blurb: "Take fewer new clients, pass a client on to the right colleague, and arrange temporary cover while you wind down.",
  outcome: "Fewer new requests, and every client placed with care.",
  tryHref: "/join",
  chapters: [
    {
      name: "Take fewer new clients",
      view: "home",
      macro: "availability",
      steps: [
        {
          title: "Selected referrals only",
          text: "Open your availability and choose Selected referrals only. You are asked directly, never matched automatically.",
          beats: [["tick", 'input[name="referrals"][value="limited"]']],
        },
        {
          title: "Fewer spaces, saved",
          text: "Lower your spaces, then save. Colleagues see the change at once, and work already under way is not affected.",
          beats: [["type", "#availability-slots", "1"], ["click", "text=Save & confirm availability"]],
          hold: 1,
        },
      ],
    },
    pick(REFER, 0, [0, 1, 2], "Pass a client on"),
    {
      name: "Cover while you close",
      view: "cover",
      steps: [
        {
          title: "Temporary cover while you close",
          text: "Start a cover plan and choose Closing or reducing practice. PsyAlliance reminds you that a permanent move is a referral.",
          beats: [["click", '[data-action="cover-start"]'], ["tick", 'input[name="reason"][value="closing"]'], ["look", ".closing-note"]],
          hold: 1,
        },
      ],
    },
  ],
};

export const DEMO_SCRIPTS: Record<string, DemoScript> = {
  cover: COVER, refer: REFER, consult: CONSULT, circle: CIRCLE, hub: HUB, messages: MESSAGES, library: LIBRARY, availability: AVAILABILITY, overview: OVERVIEW,
  "time-away": TIME_AWAY, "client-referral": CLIENT_REFERRAL, caseload: CASELOAD, perspective: PERSPECTIVE, reducing: REDUCING,
};
export const findScript = (key: string) => DEMO_SCRIPTS[key] || null;
