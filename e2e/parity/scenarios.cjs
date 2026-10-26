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
module.exports = { S, VPS, ALL };
