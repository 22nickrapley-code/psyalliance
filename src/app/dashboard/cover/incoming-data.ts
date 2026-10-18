import type { createClient } from "@/lib/supabase/server";
import type { NeedOptions } from "@/lib/need-options";
import { clinicianName, roleLabel } from "@/lib/profession";
import { resolveAvatarUrls } from "@/lib/avatars";
import { loadThread } from "@/lib/threads";
import { US_STATES } from "@/lib/us-states";
import { clientRef, focusLabel, coverThreadTitle } from "./data";
import { ABSENCE_LABELS } from "./labels";
import type { HistoryTone } from "../_components/ui";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Cover requests colleagues sent you, one entry per colleague's plan, with
// every client they asked you about. Used by the Cover home (a coloured
// history) and the page for one request (Nick, 18 Oct).

export type IncomingCaseItem = {
  requestId: number;
  caseId: number;
  status: string;
  reference: string;
  focus: string;
  details: [string, string][];
  threadTitle: string;
  thread?: { conversationId: number | null; messages: import("@/lib/threads").ThreadMessage[] };
};

export type IncomingRequest = {
  planId: number;
  ownerId: string;
  ownerName: string;
  ownerRole: string;
  ownerAvatar: string | null;
  absenceType: string;
  absence: string;
  planTitle: string;
  planStatus: string;
  startsOn: string | null;
  endsOn: string | null;
  dates: string;
  length: string;
  location: string;
  outreach: string;
  note: string | null;
  urgent: boolean;
  sentAt: string;
  cases: IncomingCaseItem[];
};

const fmt = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const nameOfState = (code: string | null) => (code ? US_STATES.find((s) => s.code === code)?.name || code : null);
const span = (a: string | null, b: string | null) => {
  if (!a || !b) return "";
  const days = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
  return days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} day${days === 1 ? "" : "s"}`;
};

export async function loadIncomingRequests(
  supabase: Supabase,
  myself: string,
  options: NeedOptions,
  opts: { planId?: number; withThreads?: boolean } = {}
): Promise<IncomingRequest[]> {
  let q = supabase
    .from("coverage_requests")
    .select(
      "id, status, message, sent_at, responded_at, coverage_plan_cases!inner(*, coverage_plans!inner(id, title, status, starts_on, ends_on, absence_type, jurisdiction_state, outreach_mode, notes, profile_id, owner:profile_id(full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, avatar_path)))"
    )
    .eq("requested_profile_id", myself)
    .order("sent_at", { ascending: false })
    .limit(150);
  if (opts.planId) q = q.eq("coverage_plan_cases.coverage_plans.id", opts.planId);
  const { data: rows } = await q;
  const list = ((rows as any[]) || []).filter((r) => r.coverage_plan_cases?.coverage_plans);
  const urls = await resolveAvatarUrls(supabase, list.map((r) => r.coverage_plan_cases.coverage_plans.owner?.avatar_path));

  const byPlan = new Map<number, IncomingRequest>();
  const states = new Map<number, string[]>();
  for (const r of list) {
    const c = r.coverage_plan_cases;
    const p = c.coverage_plans;
    const o = p.owner || {};
    const clientState: string | null = c.jurisdiction_state || p.jurisdiction_state || null;
    const seen = states.get(p.id) || [];
    if (clientState && !seen.includes(clientState)) states.set(p.id, [...seen, clientState]);
    if (!byPlan.has(p.id)) {
      byPlan.set(p.id, {
        planId: p.id,
        ownerId: p.profile_id,
        ownerName: clinicianName(o.full_name, o.qualification_level, o.credential_prefix),
        ownerRole: `${roleLabel(o.qualification_level)}${o.primary_practice_city ? ` · ${o.primary_practice_city}, ${o.primary_state}` : ""}`,
        ownerAvatar: urls.get(o.avatar_path || "") || null,
        absenceType: p.absence_type || "",
        absence: ABSENCE_LABELS[p.absence_type || ""] || "Cover",
        planTitle: p.title,
        planStatus: p.status,
        startsOn: p.starts_on,
        endsOn: p.ends_on,
        dates: p.starts_on ? `${fmt(p.starts_on)} to ${p.ends_on ? fmt(p.ends_on) : "return to confirm"}` : "Dates to confirm",
        length: span(p.starts_on, p.ends_on),
        location: [o.primary_practice_city && o.primary_state === p.jurisdiction_state ? o.primary_practice_city : null, nameOfState(p.jurisdiction_state)].filter(Boolean).join(", ") || "Not stated",
        outreach: p.outreach_mode === "parallel" ? "Asked of several colleagues at once" : "You're asked in turn; others follow if you can't",
        note: r.message || p.notes || null,
        urgent: p.absence_type === "unexpected",
        sentAt: r.sent_at,
        cases: [],
      });
    }
    const reference = clientRef(c.case_reference) || "Client";
    const focus = focusLabel(c.specialism_lookup_ids, options);
    byPlan.get(p.id)!.cases.push({
      requestId: r.id,
      caseId: c.id,
      status: r.status,
      reference,
      focus,
      threadTitle: coverThreadTitle(p.title, reference, focus),
      details: [
        ["Client location", nameOfState(clientState) || "Not stated"],
        ["Age band", c.age_band || "Not stated"],
        ["Setting", c.modality === "virtual" ? "Virtual" : c.modality === "in_person" ? "In person" : "Virtual or in person"],
        ["Insurance", c.insurance || "Not stated"],
        ["Frequency", c.frequency || "Not stated"],
        ["Prescribing", c.prescribing_needed ? "Needed" : "Not needed"],
        ...(c.service_needed ? [["Service", c.service_needed] as [string, string]] : []),
      ],
    });
  }
  for (const [planId, plan] of byPlan) {
    const st = states.get(planId) || [];
    if (st.length > 1) plan.location = st.map((s) => nameOfState(s)).join(" and ");
    else for (const k of plan.cases) k.details = k.details.filter(([label]) => label !== "Client location");
    // Keep the owner's numbering: Client 1, Client 2.
    plan.cases.sort((a, b) => a.caseId - b.caseId);
  }
  const out = [...byPlan.values()];
  if (opts.withThreads) {
    await Promise.all(
      out.flatMap((plan) =>
        plan.cases.map(async (k) => {
          const t = await loadThread(supabase, myself, [plan.ownerId], k.threadTitle);
          if (t.conversationId) k.thread = t;
        })
      )
    );
  }
  return out;
}

// Where a request sent to you stands, for the Cover home: amber while it
// needs your answer or you're talking it through, green while you're
// covering, red when you couldn't take any of it, grey once it's over.
export function incomingState(r: IncomingRequest): { tone: HistoryTone; label: string; action: string } {
  const statuses = r.cases.map((c) => c.status);
  const today = new Date().toISOString().slice(0, 10);
  const over = r.planStatus === "completed" || r.planStatus === "cancelled" || (!!r.endsOn && r.endsOn < today);
  if (statuses.includes("sent") && !over) return { tone: "amber", label: r.urgent ? "Urgent: needs your answer" : "Needs your answer", action: "Answer" };
  if (statuses.includes("discussing") && !over) return { tone: "amber", label: "In discussion", action: "Open" };
  if (statuses.includes("accepted")) return over ? { tone: "grey", label: "Finished", action: "View" } : { tone: "green", label: "You're covering", action: "Open" };
  if (statuses.length && statuses.every((s) => s === "declined")) return { tone: "red", label: "You couldn't take it", action: "View" };
  return { tone: "grey", label: "Closed", action: "View" };
}
