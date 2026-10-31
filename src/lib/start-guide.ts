// The optional public guide: "Show me how PsyAlliance could help".
// Plain data shared by the public page and the signed-in starting page. Everything here describes
// capabilities, never outcomes, and every example person is fictional.

export type Need = "caseload" | "time_away" | "client_referral" | "perspective" | "reducing" | "explore" | "offer_support";
export const NEED_IDS: Need[] = ["caseload", "time_away", "client_referral", "perspective", "reducing", "explore", "offer_support"];
export const HELPS = ["referrals", "cover", "consult"] as const;
export type Help = (typeof HELPS)[number];
export const CONTEXTS = ["early_career", "established", "changing_pace", "employed", "other"] as const;

type Entry = { choice: string; headline: string; benefit: string; demo: string; summary: string; needs: string; cta: string; target: string };

export const GUIDE: Record<Need, Entry> = {
  caseload: {
    choice: "Establish or rebuild my caseload",
    headline: "Help appropriate colleagues discover your practice",
    benefit: "See how your experience, settings and current capacity help others consider you for referrals.",
    demo: "/tour/caseload",
    summary: "Next, review your profile, the states you are licensed in and your settings, then confirm your current capacity before accepting referral requests.",
    needs: "Your profile details, licensed states and how you work, and how many places you can honestly offer (zero is fine).",
    cta: "Set up my referral preferences",
    target: "/dashboard/settings#approach",
  },
  time_away: {
    choice: "Arrange time away",
    headline: "Time away, with a clearer plan",
    benefit: "See how you can find suitable colleagues, review their responses and track the handovers that still need arranging.",
    demo: "/tour/time-away",
    summary: "Ready to start your Cover plan? Next, add your dates and anonymous client requirements. You’ll review every recipient before anything is sent.",
    needs: "Your dates, and each client described by need only: no names or identifying details.",
    cta: "Start my cover plan",
    target: "/dashboard/cover?new=1",
  },
  client_referral: {
    choice: "Find a colleague for a client",
    headline: "A clearer route to an appropriate colleague",
    benefit: "See how requirements, match explanations and recipient review help you approach suitable colleagues.",
    demo: "/tour/client-referral",
    summary: "Next, describe the need without identifying the client, look at the matches and why each fits, and review every recipient before anything is sent.",
    needs: "The client’s need, location and practical requirements, described anonymously.",
    cta: "Prepare a client referral",
    target: "/dashboard/referrals?new=1",
  },
  perspective: {
    choice: "Get another professional perspective",
    headline: "Another professional perspective",
    benefit: "See how to choose who you ask and keep the discussion together.",
    demo: "/tour/perspective",
    summary: "Next, write your question without identifying details, choose who may see it and review the recipients. Nothing is posted until you do.",
    needs: "Your question and the context colleagues need, and who you want to ask.",
    cta: "Ask my question",
    target: "/dashboard/consult?new=1",
  },
  reducing: {
    choice: "Reduce or close my practice",
    headline: "Support for your next chapter",
    benefit: "See how to consider onward referrals and the arrangements involved in changing your practice.",
    demo: "/tour/reducing",
    summary: "Passing a client on permanently is a referral, and planning for continuity is separate from temporary Cover. Next, you choose the route that fits; nothing is started for you.",
    needs: "For a referral, each client’s need described anonymously. For continuity, your own plan and who looks after your records.",
    cta: "Review my transition options",
    target: "/dashboard/start?route=transition",
  },
  explore: {
    choice: "Just explore",
    headline: "Cover, Referrals and Consult in one place",
    benefit: "A short tour of the three services. Move through it at your own pace.",
    demo: "/tour",
    summary: "You can look around first. When you are ready, creating an account takes a few minutes and a person then checks your license.",
    needs: "Nothing yet.",
    cta: "Create your account",
    target: "/dashboard",
  },
  offer_support: {
    choice: "I’m here to offer support",
    headline: "How colleagues would reach you",
    benefit: "See what a colleague receives when they ask, and how you choose which kinds of request you would consider.",
    demo: "/tour/offer-support",
    summary: "Next, you choose which kinds of request you would consider: referrals, Cover or Consult. Each is separate and can be paused. Considering requests is not a commitment to accept any, and nothing is published until you confirm.",
    needs: "Your choices for each kind of request. Zero referral places does not stop you offering Cover or Consult.",
    cta: "Choose how I can help",
    target: "/dashboard/start?route=help",
  },
};

export const HELP_LABEL: Record<Help, string> = { referrals: "Referral requests", cover: "Cover requests", consult: "Contributing to Consult" };
export const CONTEXT_LABEL: Record<string, string> = { early_career: "Starting out", established: "Established in practice", changing_pace: "Changing pace or direction", employed: "Working in an employed role", other: "Something else" };

// What travels through sign-up: structured choices only, with an expiry. Never free text.
export type Handoff = { need: Need; ctx?: string; helps?: Help[]; exp: number };
export const HANDOFF_COOKIE = "pa_start";
export const HANDOFF_HOURS = 24;

export function parseHandoff(raw: string | undefined | null): Handoff | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    if (!NEED_IDS.includes(v.need) || typeof v.exp !== "number" || v.exp < Date.now()) return null;
    const helps = Array.isArray(v.helps) ? v.helps.filter((h: string) => (HELPS as readonly string[]).includes(h)) : undefined;
    const ctx = (CONTEXTS as readonly string[]).includes(v.ctx) ? v.ctx : undefined;
    return { need: v.need, ctx, helps, exp: v.exp };
  } catch {
    return null;
  }
}
