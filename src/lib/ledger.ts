import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Ledger = {
  year: number;
  placed: number; // your clients placed with a colleague through a referral
  covered: number; // your clients covered by colleagues while you were away
  weeks: number; // weeks of your time away with cover in place
  coveredForOthers: number; // colleagues' clients you covered
  referralsTaken: number; // referrals you took on
  answers: number; // colleagues' questions you answered
};

// What PsyAlliance did for a member this calendar year, and what they did
// for colleagues. Counts only; nothing about clients.
export async function loadLedger(supabase: Supabase, me: string): Promise<Ledger> {
  const year = new Date().getUTCFullYear();
  const start = `${year}-01-01`;
  const [refs, plans, coverGiven, refsTaken, answers] = await Promise.all([
    supabase.from("referral_requests").select("id", { count: "exact", head: true }).eq("requesting_profile_id", me).in("status", ["connected", "handoff"]).gte("created_at", start),
    supabase.from("coverage_plans").select("starts_on, ends_on, coverage_plan_cases(status)").eq("profile_id", me).gte("created_at", start),
    supabase.from("coverage_requests").select("id", { count: "exact", head: true }).eq("requested_profile_id", me).eq("status", "accepted").gte("sent_at", start),
    supabase.from("referral_responses").select("id", { count: "exact", head: true }).eq("responding_profile_id", me).eq("status", "accepted").gte("created_at", start),
    supabase.from("consultation_responses").select("id", { count: "exact", head: true }).eq("responder_profile_id", me).gte("created_at", start),
  ]);
  let covered = 0;
  let days = 0;
  for (const p of (plans.data as any[]) || []) {
    const confirmed = ((p.coverage_plan_cases as any[]) || []).filter((c) => c.status === "confirmed").length;
    covered += confirmed;
    if (confirmed > 0 && p.starts_on && p.ends_on) days += Math.max(0, (new Date(p.ends_on).getTime() - new Date(p.starts_on).getTime()) / 86_400_000);
  }
  return {
    year,
    placed: refs.count || 0,
    covered,
    weeks: Math.round(days / 7),
    coveredForOthers: coverGiven.count || 0,
    referralsTaken: refsTaken.count || 0,
    answers: answers.count || 0,
  };
}

export const ledgerItems = (l: Ledger) =>
  [
    l.placed ? `${l.placed} client${l.placed === 1 ? "" : "s"} placed` : null,
    l.covered ? `${l.covered} client${l.covered === 1 ? "" : "s"} covered${l.weeks ? ` over ${l.weeks} week${l.weeks === 1 ? "" : "s"} away` : ""}` : null,
    l.coveredForOthers ? `${l.coveredForOthers} colleague client${l.coveredForOthers === 1 ? "" : "s"} you covered` : null,
    l.referralsTaken ? `${l.referralsTaken} referral${l.referralsTaken === 1 ? "" : "s"} you took on` : null,
    l.answers ? `${l.answers} question${l.answers === 1 ? "" : "s"} you answered` : null,
  ].filter(Boolean) as string[];
