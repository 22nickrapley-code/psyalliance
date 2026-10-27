// Paired capture scenarios for the v13 parity ledger (VIS-xx). Each runs the same
// steps against the frozen reference and the rebuilt workspace, so selectors are
// the engine's own data-action hooks. Keep these deterministic: fixed clock,
// no animation, same fixture.
const click = (a) => async (p) => { await p.evaluate((x) => document.querySelector(`[data-action="${x}"]`)?.click(), a); await p.waitForTimeout(150); };
const nav = (v) => click(`nav:${v}`);
const seq = (...fs) => async (p) => { for (const f of fs) await f(p); };
const VPS = {
  d1440: { width: 1440, height: 1000 }, d1365: { width: 1365, height: 900 }, t900: { width: 900, height: 760 },
  p390: { width: 390, height: 844 }, p320: { width: 320, height: 700 }, s390: { width: 390, height: 390 },
};
const ALL = ["d1440", "d1365", "t900", "p390", "p320", "s390"];
const S = [];
const add = (id, area, run, vps = ALL, opts = {}) => S.push({ id, area, run, vps, ...opts });
add("hub-initial", "VIS-01", async () => {});
add("hub-actions-open", "VIS-01", click("toggle-actions"));
add("hub-following", "VIS-02", click("discussion-tab:Following"));
add("hub-next-question", "VIS-02", click("discussion-page:2"));
add("hub-suggested", "VIS-03", click("pulse-people:suggested"));
add("hub-people-next", "VIS-03", seq(click("people-next"), click("people-next")));
add("cover-overview", "VIS-04", nav("cover"));
add("referrals-overview", "VIS-14", nav("referrals"));
add("consult-overview", "VIS-16", nav("consult"));
add("network-circle", "VIS-17", nav("network"));
add("messages-inbox", "VIS-18", nav("messages"));
add("library-overview", "VIS-21", nav("library"));
add("cover-calendar", "VIS-05", seq(nav("cover"), click("cover-layout:calendar")));
add("cover-start", "VIS-06", click("cover-start"));
add("referral-start", "VIS-12", click("referral-start"));
add("consult-start", "VIS-15", click("peer-start"));
add("availability-modal", "VIS-22", click("availability"));
add("invite-modal", "VIS-23", click("invite"));
add("search-modal", "VIS-24", click("search"));
add("settings-modal", "VIS-24", click("settings"));
add("notifications-modal", "VIS-24", click("notifications"));
add("directory-modal", "VIS-17", click("directory"));

// ---- Extended states (every VIS family). Helpers fill and submit the engine's own forms. ----
const fill = (id, vals) => async (p) => {
  await p.evaluate(([formId, v]) => {
    const f = document.getElementById(formId); if (!f) return;
    for (const [k, x] of Object.entries(v)) {
      const els = [...f.querySelectorAll(`[name="${k}"]`)], el = els[0]; if (!el) continue;
      if (el.type === "radio") (typeof x === "number" ? els[x] : els.find((e) => e.value === x) || els[0]).click();
      else if (el.type === "checkbox") { el.checked = !!x; el.dispatchEvent(new Event("change", { bubbles: true })); }
      else if (el.tagName === "SELECT") { el.selectedIndex = x; el.dispatchEvent(new Event("change", { bubbles: true })); }
      else { el.value = x; el.dispatchEvent(new Event("input", { bubbles: true })); }
    }
  }, [id, vals]);
  await p.waitForTimeout(120);
};
const submit = (id, n = 0) => async (p) => { await p.evaluate(([formId, i]) => { const f = document.getElementById(formId); f?.requestSubmit(f.querySelectorAll("button[type=submit]")[i]); }, [id, n]); await p.waitForTimeout(300); };
const coverStep1 = seq(click("cover-start"), fill("cover-plan-form", { name: "Parental leave" }), submit("cover-plan-form"));
const coverNeeds = seq(coverStep1, fill("client-form", { focus: 1, state: 0 }), submit("client-form", 0));
const controls = seq(click("settings"), click("review-controls"));
const x = (id, area, run, base, vps = ALL) => add(id, area, run, vps, { base });

x("cover-past", "VIS-04", seq(nav("cover"), click("cover-filter:past")), "cover-overview");
x("cover-draft-saved", "VIS-04", seq(click("cover-start"), fill("cover-plan-form", { name: "Winter break" }), click("close-modal"), nav("cover")), "cover-overview");
x("cover-plan-own", "VIS-10", seq(nav("cover"), click("plan:1")), "cover-overview");
x("cover-plan-colleagues", "VIS-10", seq(nav("cover"), click("plan:1"), click("plan-tab:colleagues")), "cover-plan-own");
x("cover-plan-history", "VIS-10", seq(nav("cover"), click("plan:1"), click("plan-tab:history")), "cover-plan-own");
x("cover-plan-incoming", "VIS-04", seq(nav("cover"), click("plan:4")), "cover-overview");
x("cover-handover", "VIS-11", seq(nav("cover"), click("plan:1"), click("handover:1:2")), "cover-plan-own");
x("cover-plan-cancel", "VIS-25", seq(nav("cover"), click("plan:1"), click("plan-cancel:1")), "cover-plan-own");
x("cover-calendar-colleagues", "VIS-05", seq(nav("cover"), click("cover-layout:calendar"), click("calendar-scope:colleagues")), "cover-calendar");
x("cover-calendar-own", "VIS-05", seq(nav("cover"), click("cover-layout:calendar"), click("calendar-scope:own")), "cover-calendar");
x("cover-calendar-next", "VIS-05", seq(nav("cover"), click("cover-layout:calendar"), click("calendar-month:1")), "cover-calendar");
x("cover-calendar-day", "VIS-05", seq(nav("cover"), click("cover-layout:calendar"), click("calendar-day:2026-10-26")), "cover-calendar");
x("cover-start-validation", "VIS-06", seq(click("cover-start"), submit("cover-plan-form")), "cover-start");
x("cover-start-reason", "VIS-06", seq(click("cover-start"), fill("cover-plan-form", { reason: 3 })), "cover-start");
x("cover-needs", "VIS-07", coverStep1, "cover-start");
x("cover-needs-added", "VIS-07", coverNeeds, "cover-needs");
x("cover-needs-twenty", "VIS-07", seq(controls, click("review-twenty")), "cover-start");
x("cover-matching", "VIS-08", seq(coverNeeds, click("needs-continue")), "cover-needs-added");
x("cover-matching-colleague", "VIS-08", seq(coverNeeds, click("needs-continue"), click("match-view:colleague")), "cover-matching");
x("cover-review", "VIS-09", seq(coverNeeds, click("needs-continue"), click("cover-review")), "cover-matching");
x("referrals-discussion", "VIS-14", seq(nav("referrals"), click("referral-filter:discussion")), "referrals-overview");
x("referrals-placed", "VIS-14", seq(nav("referrals"), click("referral-filter:placed")), "referrals-overview");
x("referral-open", "VIS-14", seq(nav("referrals"), click("referral:1")), "referrals-overview");
x("referral-incoming", "VIS-14", seq(nav("referrals"), click("referral:3")), "referrals-overview");
x("referral-place", "VIS-25", seq(nav("referrals"), click("referral:1"), click("referral-choose:1:maya")), "referral-open");
x("referral-withdraw", "VIS-25", seq(nav("referrals"), click("referral:1"), click("referral-withdraw:1")), "referral-open");
x("referral-need-validation", "VIS-12", seq(click("referral-start"), submit("referral-need-form")), "referral-start");
x("referral-matching", "VIS-13", seq(click("referral-start"), fill("referral-need-form", { focus: 1, state: 1 }), submit("referral-need-form")), "referral-start");
x("consult-following", "VIS-16", seq(nav("consult"), click("discussion-tab:Following")), "consult-overview");
x("consult-page2", "VIS-16", seq(nav("consult"), click("consult-page:2")), "consult-overview");
x("consult-discussion", "VIS-16", seq(nav("consult"), click("discussion:1")), "consult-overview");
x("consult-group", "VIS-24", seq(nav("consult"), click("group")), "consult-overview");
x("consult-ask-validation", "VIS-15", seq(click("peer-start"), submit("peer-form")), "consult-start");
x("consult-ask-audience", "VIS-15", seq(click("peer-start"), fill("peer-form", { title: "Handling a first session with an anxious teenager", body: "I would value how others open the first session.", audience: 3 })), "consult-start");
x("network-directory-tab", "VIS-17", seq(nav("network"), click("network-tab:directory")), "network-circle");
x("network-tier-suggested", "VIS-17", seq(nav("network"), click("network-tier:suggested")), "network-circle");
x("profile-colleague", "VIS-17", seq(nav("network"), click("profile:rena")), "network-circle");
x("profile-me", "VIS-17", seq(nav("network"), click("profile:me")), "network-circle");
x("thread-cover", "VIS-19", seq(nav("messages"), click("thread:rena-cover")), "messages-inbox");
x("thread-referral", "VIS-19", seq(nav("messages"), click("thread:maya-referral")), "messages-inbox");
x("thread-menu", "VIS-19", seq(nav("messages"), click("thread:rena-cover"), click("message-menu:r1")), "thread-cover");
x("messages-unread", "VIS-18", seq(nav("messages"), click("inbox-filter:Unread")), "messages-inbox");
x("messages-cover-filter", "VIS-18", seq(nav("messages"), click("inbox-filter:Cover")), "messages-inbox");
x("messages-new", "VIS-18", seq(nav("messages"), click("new-message")), "messages-inbox");
x("library-saved", "VIS-21", seq(nav("library"), click("resource-filter:Saved")), "library-overview");
x("library-saved-one", "VIS-21", seq(nav("library"), click("resource-save:1"), click("resource-filter:Saved")), "library-overview");
x("library-collection", "VIS-21", seq(nav("library"), click("resource-filter:Cover & continuity")), "library-overview");
x("library-page2", "VIS-21", seq(nav("library"), click("resource-page:2")), "library-overview");
x("library-resource", "VIS-21", seq(nav("library"), click("resource:1")), "library-overview");
x("availability-stale", "VIS-22", seq(controls, click("review-stale"), click("close-modal"), click("availability")), "availability-modal");
x("availability-fresh", "VIS-22", seq(controls, click("review-fresh"), click("close-modal"), click("availability")), "availability-modal");
x("invite-purpose", "VIS-23", seq(click("invite"), click("invite-purpose:cover")), "invite-modal");
x("invite-review", "VIS-23", seq(click("invite"), fill("invite-form", { name: "Dana Wright", email: "dana@example.com" }), submit("invite-form")), "invite-modal");
x("preferences-modal", "VIS-24", seq(click("settings"), click("preferences")), "settings-modal");
x("draft-delete", "VIS-24", seq(click("cover-start"), fill("cover-plan-form", { name: "Winter break" }), click("close-modal"), nav("cover"), click("draft-delete")), "cover-draft-saved");
x("review-controls", "VIS-26", controls, "settings-modal");
x("review-conversations", "VIS-26", seq(controls, click("review-conversations"), click("close-modal"), nav("messages")), "messages-inbox");
module.exports = { S, VPS, ALL };
