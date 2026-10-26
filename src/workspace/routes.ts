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

// What a link opens inside a section, from its query: ?plan=7, ?referral=7, ?new=1.
export function openOf(sp: URLSearchParams | Params, view: WorkspaceView = "home"): { type: string; id?: string | number; sub?: string } | null {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) || "" : one(sp[k]));
  const plan = num(get("plan"));
  if (plan && view === "cover") return { type: "plan", id: Number(plan) };
  const referral = num(get("referral"));
  if (referral && view === "referrals") return { type: "referral", id: Number(referral) };
  if (get("new") === "1") return { type: view === "referrals" ? "referral-start" : "cover-start" };
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
  if (a === "refer") {
    if (!b) return "/dashboard/referrals";
    if (b === "new") return "/dashboard/referrals?new=1";
    if (num(b)) return `/dashboard/referrals?referral=${b}`;
  }
  return null;
}
