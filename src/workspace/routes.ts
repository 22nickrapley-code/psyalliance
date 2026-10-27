// The workspace's sections as URLs, and where links from earlier versions go.
// No server code here: the workspace host uses the same table in the browser.
import type { WorkspaceView } from "./adapters/live";

export const SECTIONS = ["cover", "referrals", "consult", "network", "messages", "library"] as const;

export function viewOf(pathname: string): WorkspaceView {
  const seg = pathname.replace(/^\/dashboard\/?/, "").split("/")[0];
  return (SECTIONS as readonly string[]).includes(seg) ? (seg as WorkspaceView) : "home";
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const num = (v: string) => (/^\d{1,12}$/.test(v) ? v : "");

// What a link opens inside a section, from its query: ?plan=7, ?referral=7, ?thread=KEY, ?new=1.
export function openOf(sp: URLSearchParams | Params, view: WorkspaceView = "home"): { type: string; id?: string | number; sub?: string } | null {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) || "" : one(sp[k]));
  const plan = num(get("plan"));
  if (plan && view === "cover") return { type: "plan", id: Number(plan) };
  if (get("tab") === "physicians" && view === "referrals") return { type: "physicians" };
  // From the account pages' top bar and the retired availability page.
  if (get("search") === "1") return { type: "search" };
  if (get("settings") === "1") return { type: "settings" };
  if (get("availability") === "1" && view === "home") return { type: "availability" };
  const referral = num(get("referral"));
  if (referral && view === "referrals") return { type: "referral", id: Number(referral) };
  const to = get("to");
  if (to && view === "messages" && /^[0-9a-f-]{36}$/i.test(to)) return { type: "person-message", id: to };
  if (get("compose") && view === "messages") return { type: "new-message" };
  const thread = get("thread");
  if (thread && view === "messages" && /^(c-\d{1,18}|[a-z]+-[0-9a-f-]{1,120})$/i.test(thread)) return { type: "thread", id: thread };
  const profile = get("profile");
  if (profile && /^[0-9a-f-]{36}$/i.test(profile)) return { type: "profile", id: profile };
  const discussion = num(get("discussion"));
  if (discussion && view === "consult") return { type: "discussion", id: Number(discussion) };
  const resource = get("resource");
  if (resource && view === "library" && /^(PA-\d{2}|\d{1,3})$/i.test(resource)) return { type: "resource", id: resource.toUpperCase() };
  if (get("invite") === "1" && view === "network") return { type: "invite" };
  if (get("new") === "1") {
    if (view === "consult") return { type: "peer-start", sub: num(get("group")) || undefined };
    if (view === "cover" || view === "referrals") return { type: view === "referrals" ? "referral-start" : "cover-start" };
  }
  return null;
}

// Older addresses, kept working. Returns the new address, or null if the
// address is already a section of the workspace.
export function legacyDestination(section: string[], sp: Params): string | null {
  const [a, b, c] = section;
  if (a === "cover") {
    if (b === "new") return "/dashboard/cover?new=1";
    if (b === "requests" && num(c || "")) return `/dashboard/cover?plan=${c}`;
    if (b && num(b)) return `/dashboard/cover?plan=${b}`;
  }
  if (a === "messages" && !b && one(sp.tab) === "notifications") return "/dashboard/notifications";
  if (a === "messages" && b && num(b)) return `/dashboard/messages?thread=c-${b}`;
  if (a === "consult" && b !== "groups") {
    if (!b) return null;
    if (b === "new") return `/dashboard/consult?new=1${num(one(sp.group)) ? `&group=${one(sp.group)}` : ""}`;
    if (num(b)) return `/dashboard/consult?discussion=${b}`;
  }
  if (a === "clinicians") return "/dashboard/network";
  if (a === "physician-referrals") return "/dashboard/referrals?tab=physicians";
  if (a === "invite") return "/dashboard/network?invite=1";
  if (a === "refer") {
    if (!b) return "/dashboard/referrals";
    if (b === "new") return "/dashboard/referrals?new=1";
    if (num(b)) return `/dashboard/referrals?referral=${b}`;
  }
  return null;
}
