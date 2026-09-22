import { createClient } from "@/lib/supabase/server";

// The canonical professional-event logger (Addendum A4 / Part B). Every
// module the rebuild adds - Coverage, Referrals, Consult, reciprocal
// agreements, Library workflows - calls this, and only this, to record
// professional interaction history. It's deliberately a plain function with
// no dependency on any page/form, so it's callable from a server action, a
// future admin job, or a future member-agent tool exactly the same way -
// this is the "canonical server-side service layer" the Addendum calls out
// as one of the most important architectural instructions in the rebuild.
//
// Hard rule (A4, enforced by convention - the database can't verify this):
// summary and metadata must never contain a patient name, other patient
// identifier, or clinical narrative. Only structured, de-identified facts.

export type ProfessionalEventType =
  | "availability_confirmed"
  | "trusted_invitation_sent"
  | "trusted_invitation_accepted"
  | "external_invitation_sent"
  | "external_invitation_converted"
  | "coverage_request_sent"
  | "coverage_response"
  | "coverage_confirmed"
  | "coverage_completed"
  | "referral_sent"
  | "referral_response"
  | "referral_waitlisted"
  | "referral_outcome"
  | "consultation_created"
  | "consultation_response"
  | "collaboration_established"
  | "reciprocal_coverage_established"
  | "library_workflow_launched"
  | "professional_relationship_created"
  | "new_member";

export type ActorType = "member_web" | "member_agent" | "admin" | "system";

export type LogProfessionalEventOptions = {
  eventType: ProfessionalEventType;
  /** Who performed the action. Omit only for a pure system event with no human actor. */
  actorProfileId?: string | null;
  /** Defaults to 'member_web' - the ordinary logged-in-member-in-a-browser case. */
  actorType?: ActorType;
  /** Who the event is about, when that's someone other than the actor (e.g. a new member being approved). */
  subjectProfileId?: string | null;
  /** The "other side" of a two-party interaction (e.g. who a coverage request was sent to). */
  relatedProfileId?: string | null;
  specialismLookupIds?: number[];
  state?: string | null;
  /** For reliability's "fast response" signal - seconds between a request and this response. */
  responseTimeSeconds?: number | null;
  /** Short, de-identified, human-readable description. No patient identifiers, ever. */
  summary?: string | null;
  /** Structured references only (ids, counts) - never clinical free text. */
  metadata?: Record<string, unknown>;
};

export async function logProfessionalEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: LogProfessionalEventOptions
) {
  const { error } = await supabase.from("professional_events").insert({
    event_type: opts.eventType,
    actor_profile_id: opts.actorProfileId ?? null,
    actor_type: opts.actorType ?? "member_web",
    subject_profile_id: opts.subjectProfileId ?? null,
    related_profile_id: opts.relatedProfileId ?? null,
    specialism_lookup_ids: opts.specialismLookupIds ?? [],
    state: opts.state ?? null,
    response_time_seconds: opts.responseTimeSeconds ?? null,
    summary: opts.summary ?? null,
    metadata: opts.metadata ?? {},
  });
  // Same rule as notifyProfile: the event this describes has already
  // happened and already succeeded by the time we log it. A logging
  // failure should never roll back or block the action that triggered it.
  if (error) console.error("logProfessionalEvent failed:", error.message);
}

// Reliability itself (turning this history into ranking weight and
// member-facing phrases like "Usually responds quickly") is explicitly
// gated on a configurable evidence threshold that doesn't exist yet
// (Addendum A4) - deliberately not built here. This file only ever grows
// the history; nothing reads it for ranking until that threshold is
// defined in a later phase.

export type WorkedWithBeforeEntry = {
  colleagueId: string;
  interactionCount: number;
  lastInteractionAt: string;
};

// Master Brief #28-29: "Worked with before" is derived from genuine
// platform history, not a stored relationship - backed by the
// worked_with_before view, which in turn reads professional_events. Starts
// out empty for everyone until the modules that log 'coverage_completed' /
// 'referral_outcome' / 'consultation_response' exist.
export async function getWorkedWithBefore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
): Promise<WorkedWithBeforeEntry[]> {
  const { data, error } = await supabase
    .from("worked_with_before")
    .select("colleague_id, interaction_count, last_interaction_at")
    .eq("profile_id", profileId)
    .order("last_interaction_at", { ascending: false });
  if (error) {
    console.error("getWorkedWithBefore failed:", error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    colleagueId: row.colleague_id,
    interactionCount: row.interaction_count,
    lastInteractionAt: row.last_interaction_at,
  }));
}
