// The practice scenarios: one small, fictional practice workspace for each
// need on the starting page. A scenario is data for the same workspace engine
// the product runs on, so a practice screen can never drift from the real
// one. It runs in the visitor's browser only: nothing is saved, sent or
// connected to a real account, and it cannot reach production data or grant
// anything. Reset reloads the scenario from this file; a returning visitor's
// own work is never stored here.
import { REFERENCE_DATA } from "@/workspace/fixtures/reference-data";
import type { Need } from "@/lib/start-guide";

export type ScenarioId = Exclude<Need, "explore">;

export type Scenario = {
  id: ScenarioId;
  // The demo route that opens it (/tour/<journey>).
  journey: string;
  title: string;
  premise: string;
  // What Reset scenario does, said plainly on the page.
  resets: string;
  // Where "Create my account" leads, with the same need carried in.
  signup: string;
  me: Record<string, any>;
  myAvailability?: { open?: boolean; slots?: number; confirmedDaysAgo?: number | null; referrals?: string; cover?: string };
  patchPeople?: Record<string, Record<string, any>>;
  keepDiscussions?: number[];
};

const BASE_ME = {
  id: "me", name: "Rachel Davis", initials: "RD", credential: "PhD", role: "Clinical psychologist", state: "MA", city: "Boston",
  licenses: { MA: { virtual: true, inPerson: true, city: "Boston" }, NY: { virtual: true, inPerson: false, city: "" }, VT: { virtual: true, inPerson: false, city: "" } },
  specialties: ["Anxiety/Panic Disorders", "Depression", "Life Transitions"], slots: 2,
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  caseload: {
    id: "caseload", journey: "caseload", title: "Rebuild a caseload",
    premise: "Rachel has just opened a practice in Boston. She has no places confirmed yet, and colleagues cannot yet tell she is taking referrals.",
    resets: "Puts Rachel’s profile, availability and every request back to the start of this scenario.",
    signup: "/start?need=caseload",
    me: { ...BASE_ME, slots: 0 },
    myAvailability: { open: false, slots: 0, confirmedDaysAgo: 120 },
  },
  time_away: {
    id: "time_away", journey: "time-away", title: "Arrange time away",
    premise: "Rachel has six weeks of parental leave coming. Three clients need a colleague, and some colleagues have not confirmed availability lately.",
    resets: "Discards the cover plan you were building and the colleagues you chose.",
    signup: "/start?need=time_away",
    me: { ...BASE_ME },
    patchPeople: { james: { confirmedDaysAgo: 120 }, ben: { confirmedDaysAgo: 100 } },
  },
  client_referral: {
    id: "client_referral", journey: "client-referral", title: "Find a colleague for a client",
    premise: "Rachel cannot take a new client who needs OCD-informed care in New York. She wants a short list of colleagues who fit, with reasons.",
    resets: "Clears the anonymous need you described and any colleagues you selected.",
    signup: "/start?need=client_referral",
    me: { ...BASE_ME, slots: 0 },
    myAvailability: { open: false, slots: 0, confirmedDaysAgo: 10 },
    patchPeople: { imani: { slots: 1, confirmedDaysAgo: 3 }, lena: { slots: 2, confirmedDaysAgo: 6 } },
  },
  perspective: {
    id: "perspective", journey: "perspective", title: "Get another perspective",
    premise: "Rachel has a practice question she would like to put to a few colleagues she trusts, without naming anyone she treats.",
    resets: "Discards the question you were drafting and who you chose to ask.",
    signup: "/start?need=perspective",
    me: { ...BASE_ME },
    keepDiscussions: [1, 2, 6, 8],
  },
  reducing: {
    id: "reducing", journey: "reducing", title: "Reduce or wind down practice",
    premise: "Rachel is reducing her hours. She wants fewer new referrals, honest availability, and a way to arrange cover for clients she cannot keep.",
    resets: "Puts Rachel’s availability back to where it began and clears any cover plan.",
    signup: "/start?need=reducing",
    me: { ...BASE_ME, slots: 1 },
    myAvailability: { open: true, slots: 1, confirmedDaysAgo: 40 },
  },
  offer_support: {
    id: "offer_support", journey: "offer-support", title: "Offer support to colleagues",
    premise: "Rachel has capacity and experience to share. She wants to answer colleagues’ questions and take suitable referrals, in her own time.",
    resets: "Clears the replies you wrote and any requests you answered.",
    signup: "/start?need=offer_support",
    me: { ...BASE_ME, slots: 3 },
    myAvailability: { open: true, slots: 3, confirmedDaysAgo: 5 },
    keepDiscussions: [1, 2, 3, 4, 5, 6],
  },
};

export const SCENARIO_LIST: Scenario[] = Object.values(SCENARIOS);
export const findScenario = (id?: string | null) => (id && (SCENARIOS as Record<string, Scenario | undefined>)[id]) || null;
export const scenarioForJourney = (journey: string) => SCENARIO_LIST.find((s) => s.journey === journey) || null;

// The engine's environment for a scenario: a private copy of the sample data
// with only this scenario's differences applied.
export function scenarioEnv(id?: string | null): { data: any; me?: any; myAvailability?: any } {
  const sc = findScenario(id);
  if (!sc) return { data: REFERENCE_DATA };
  const data = JSON.parse(JSON.stringify(REFERENCE_DATA));
  for (const p of data.people) Object.assign(p, sc.patchPeople?.[p.id] || {});
  if (sc.keepDiscussions) data.discussions = data.discussions.filter((d: any) => sc.keepDiscussions!.includes(d.id));
  return { data, me: sc.me, myAvailability: sc.myAvailability };
}
