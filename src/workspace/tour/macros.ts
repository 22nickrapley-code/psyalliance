import type { Ui } from "./ui";

// How a demo scene reaches its starting point: the same clicks a person
// would make on the approved screens, run at once when the scene opens.
// Every one is exercised by e2e/tests/staging/v13/tour-scenes.spec.ts, so a
// change to a screen that breaks a scene fails a test, not a demo.
export type Macro = (ui: Ui) => Promise<void>;

const M = ".modal";

// ---------------------------------------------------------------- Cover
async function openCover(ui: Ui) {
  await ui.act("nav:cover");
  await ui.act("cover-start");
  await ui.wait(`${M} #cover-name`);
}
async function planStep(ui: Ui, states: string[] = ["NY"]) {
  await openCover(ui);
  await ui.tick('input[name="reason"][value="extended"]');
  await ui.fill("#cover-name", "Parental leave");
  for (const st of states) await ui.tick(`input[name="states"][value="${st}"]`);
  await ui.click(`${M} button[form="cover-plan-form"]`);
  await ui.wait(`${M} #cover-focus`);
}
async function threeClients(ui: Ui) {
  await planStep(ui);
  await ui.choose("#cover-focus", "Anxiety/Panic Disorders");
  await ui.choose("#cover-age", "Adults");
  await ui.click("text=Save & add another");
  await ui.choose("#cover-focus", "Trauma/PTSD");
  await ui.choose("#cover-state", "NY");
  await ui.click("text=Save & add another");
  await ui.choose("#cover-focus", "Depression");
  await ui.tick('input[name="prescribing"]');
  await ui.click("text=Save client");
  await ui.wait(`${M} [data-action="needs-continue"]`);
}
async function previewControls(ui: Ui) {
  await ui.act("settings");
  await ui.act("review-controls");
  await ui.wait(`${M} #review-request`);
}
// One "Try the whole journey" response, as the Preview controls offer it.
async function previewResponse(ui: Ui, request: string, response: "accepted" | "declined" | "discussing" | "expired") {
  await previewControls(ui);
  await ui.choose("#review-request", request);
  await ui.choose('select[name="response"]', response === "accepted" ? "Accept" : response === "declined" ? "Decline" : response === "discussing" ? "Discuss first" : "Response deadline passes");
  await ui.click(`${M} button[type="submit"]`);
}

// ---------------------------------------------------------------- Referrals
async function referralStart(ui: Ui) {
  await ui.act("nav:referrals");
  await ui.act("referral-start");
  await ui.wait(`${M} #referral-focus`);
}
async function referralMatches(ui: Ui) {
  await referralStart(ui);
  await ui.choose("#referral-focus", "Anxiety/Panic Disorders");
  await ui.choose("#referral-state", "NY");
  await ui.click("text=See matched colleagues");
  await ui.wait(`${M} [data-action="referral-review"]`);
}

// ---------------------------------------------------------------- Messages
async function failedSend(ui: Ui) {
  await ui.act("settings");
  await ui.act("review-controls");
  await ui.act("review-fail-message");
  await ui.act("thread:rena-cover");
  await ui.fill("#message-input", "Thursday still works for me. I'll bring the handover summary.");
  await ui.click(".send-button");
  await ui.wait('[data-action^="message-retry"]', 6000);
}

export const MACROS: Record<string, Macro> = {
  // The Hub, with the list of actions open.
  "hub-actions": async (ui) => {
    await ui.act("toggle-actions");
  },
  "preview-controls": previewControls,

  // Cover
  "cover-new": openCover,
  "cover-needs": threeClients,
  "cover-matches": async (ui) => {
    await threeClients(ui);
    await ui.act("needs-continue");
    await ui.wait(`${M} [data-action="match-view:client"]`);
  },
  "cover-review": async (ui) => {
    await threeClients(ui);
    await ui.act("needs-continue");
    await ui.wait(`${M} [data-action="cover-review"]`);
    await ui.act("cover-review");
    await ui.wait(`${M} form, ${M} [data-action="peer-post"], ${M} button[type="submit"]`);
  },
  "cover-twenty": async (ui) => {
    await previewControls(ui);
    await ui.act("review-twenty");
    await ui.wait(`${M} [data-action="needs-continue"]`);
  },
  "cover-plan": async (ui) => {
    await ui.act("nav:cover");
    await ui.act("plan:1");
    await ui.wait(`${M} [data-action="plan-tab:clients"]`);
  },
  "cover-deadline": async (ui) => {
    await previewResponse(ui, "Cover · Fall leave cover · Client 3 · Sophie Chen", "expired");
    await ui.act("nav:cover");
    await ui.act("plan:1");
    await ui.wait(`${M} [data-action="plan-tab:clients"]`);
  },
  "cover-handover": async (ui) => {
    await ui.act("nav:cover");
    await ui.act("plan:1");
    await ui.act("handover:1:2");
    await ui.wait(`${M} form, ${M} input[type="checkbox"]`);
  },
  "cover-incoming": async (ui) => {
    await ui.act("nav:cover");
    await ui.act("plan:4");
    await ui.wait(`${M} [data-action^="cover-answer:4:1"]`);
  },
  "cover-calendar": async (ui) => {
    await ui.act("nav:cover");
    await ui.act("cover-layout:calendar");
  },

  // Referrals
  "referral-new": referralStart,
  "referral-matches": referralMatches,
  "referral-review": async (ui) => {
    await referralMatches(ui);
    await ui.act("referral-review");
    await ui.wait(`${M} form, ${M} button[type="submit"]`);
  },
  // Referring to one person from their profile: they are chosen already.
  "referral-targeted": async (ui) => {
    await ui.act("nav:network");
    await ui.act("profile:imani");
    await ui.act("profile-referral:imani");
    await ui.wait(`${M} #referral-focus`);
    await ui.choose("#referral-focus", "Obsessive/Compulsive Disorder");
    await ui.choose("#referral-state", "NY");
    await ui.click("text=See matched colleagues");
    await ui.wait(`${M} [data-action="referral-review"]`);
  },
  // Then the need changes (a prescriber is required): the person chosen no
  // longer fits, the screen says why, and nobody else is put in their place.
  "referral-pin-excluded": async (ui) => {
    await MACROS["referral-targeted"](ui);
    await ui.act("flow-back");
    await ui.wait(`${M} #referral-focus`);
    await ui.tick('input[name="prescribing"]');
    await ui.click("text=See matched colleagues");
    await ui.wait(`${M} [data-action="referral-review"]`);
  },
  "referral-detail": async (ui) => {
    await ui.act("nav:referrals");
    await ui.act("referral:1");
    await ui.wait(`${M} [data-action^="referral-choose"]`);
  },
  "referral-incoming": async (ui) => {
    await ui.act("nav:referrals");
    await ui.act("referral:3");
    await ui.wait(`${M} [data-action^="referral-answer:3"]`);
  },
  "referral-capacity": async (ui) => {
    await ui.act("nav:referrals");
    await ui.act("referral:3");
    await ui.act("referral-answer:3:interested");
    await ui.wait(`${M} #referral-capacity-form, ${M} input[name="capacity"]`);
  },

  // Consult
  "consult-list": async (ui) => {
    await ui.act("nav:consult");
  },
  "consult-ask": async (ui) => {
    await ui.act("nav:consult");
    await ui.act("peer-start");
    await ui.wait(`${M} #peer-title`);
  },
  "consult-audience": async (ui) => {
    await ui.act("nav:consult");
    await ui.act("peer-start");
    await ui.fill("#peer-title", "Ending therapy when a client is moving away");
    await ui.tick('input[name="audience"][value="few"]');
  },
  "consult-discussion": async (ui) => {
    await ui.act("nav:consult");
    await ui.act("discussion:1");
    await ui.wait(`${M} #discussion-reply`);
  },
  "consult-following": async (ui) => {
    await ui.act("nav:consult");
    await ui.act("discussion-tab:Following");
  },

  // Network
  "network-circle": async (ui) => {
    await ui.act("nav:network");
  },
  "network-directory": async (ui) => {
    await ui.act("nav:network");
    await ui.act("directory");
    await ui.wait(`${M} #modal-dir-q`);
  },
  "network-profile": async (ui) => {
    await ui.act("nav:network");
    await ui.act("profile:imani");
    await ui.wait(`${M} [data-action^="profile-referral"]`);
  },
  "network-invite": async (ui) => {
    await ui.act("nav:network");
    await ui.act("invite");
    await ui.wait(`${M} #invite-name`);
  },

  // Messages
  "messages-inbox": async (ui) => {
    await ui.act("nav:messages");
  },
  "messages-contexts": async (ui) => {
    await ui.act("settings");
    await ui.act("review-controls");
    await ui.act("review-conversations");
    await ui.wait("#message-input");
  },
  "messages-failed": failedSend,
  "messages-media": async (ui) => {
    await ui.act("nav:messages");
    await ui.act("thread:rena-cover");
    await ui.wait('[data-action="attach"]');
  },

  // Availability
  "availability": async (ui) => {
    await ui.act("availability");
    await ui.wait(`${M} #availability-slots`);
  },
  "availability-90": async (ui) => {
    await previewControls(ui);
    await ui.act("review-boundary:90");
    await ui.act("availability");
    await ui.wait(`${M} #availability-slots`);
  },
  "availability-91": async (ui) => {
    await previewControls(ui);
    await ui.act("review-stale");
    await ui.act("availability");
    await ui.wait(`${M} #availability-slots`);
  },

  // Library
  "library": async (ui) => {
    await ui.act("nav:library");
  },
  "library-search": async (ui) => {
    await ui.act("nav:library");
    await ui.fill("#resource-search", "leave");
  },
  "library-resource": async (ui) => {
    await ui.act("nav:library");
    await ui.act("resource:102");
    await ui.wait(`${M} [data-action="resource-save:102"]`);
  },
  "library-saved": async (ui) => {
    await ui.act("nav:library");
    await ui.act("resource:102");
    await ui.act("resource-save:102");
    await ui.act("close-modal");
    await ui.act("resource-filter:Saved");
  },
};

// Takes the "Saved", "Following" and similar toasts down, so a scene opens
// on the screen itself.
export function quiet(doc: Document = document) {
  doc.getElementById("toast")?.classList.remove("visible");
}
