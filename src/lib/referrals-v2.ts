import { createClient } from "@/lib/supabase/server";
import { logProfessionalEvent } from "@/lib/professional-events";
import { raiseNotification } from "@/lib/notifications-v2";

// Canonical service layer for the rebuilt Referrals lifecycle (Master
// Brief #23-24): Need identified -> Referral sent -> Interested /
// unavailable / question -> Professional connection -> Warm handoff ->
// Closed. Named referrals-v2 rather than replacing referrals/actions.ts
// outright - the existing bulletin-board actions (offerToHelp,
// acceptResponse, etc.) still work on the same tables and are left alone
// until the Phase 5 Referrals/Messages UI pass migrates callers over.

export type ReferralAudience = "trusted" | "selected" | "suggested" | "wider_network";

export async function createReferralRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  opts: {
    specialismLookupId?: number;
    specialismLookupIds?: number[];
    state?: string;
    city?: string;
    insurance?: string;
    ageBand?: string;
    modality?: string;
    languageLookupId?: number;
    sessionTypeLookupId?: number;
    timeframe?: string;
    notes?: string;
    audienceType: ReferralAudience;
    audienceProfileIds?: string[];
  }
) {
  const { data, error } = await supabase
    .from("referral_requests")
    .insert({
      requesting_profile_id: requestingProfileId,
      specialism_lookup_id: opts.specialismLookupId ?? opts.specialismLookupIds?.[0] ?? null,
      specialism_lookup_ids: opts.specialismLookupIds ?? (opts.specialismLookupId ? [opts.specialismLookupId] : []),
      state: opts.state ?? null,
      city: opts.city ?? null,
      insurance: opts.insurance ?? null,
      age_band: opts.ageBand ?? null,
      modality: opts.modality ?? null,
      language_lookup_id: opts.languageLookupId ?? null,
      session_type_lookup_id: opts.sessionTypeLookupId ?? null,
      timeframe: opts.timeframe ?? null,
      notes: opts.notes ?? null,
      audience_type: opts.audienceType,
      audience_profile_ids: opts.audienceType === "selected" ? opts.audienceProfileIds ?? [] : [],
      status: "sent",
    })
    .select("id")
    .single();
  if (error) return { requestId: null, error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "referral_sent",
    actorProfileId: requestingProfileId,
    specialismLookupIds: opts.specialismLookupIds ?? (opts.specialismLookupId ? [opts.specialismLookupId] : []),
    state: opts.state ?? null,
    summary: "sent a referral request",
    metadata: { referralRequestId: data.id, audienceType: opts.audienceType },
  });

  return { requestId: data.id, error: null };
}

// The three initial response types the Master Brief calls out (#24):
// interested / unavailable / question. A later, separate step moves an
// "interested" response into 'accepted' (Professional connection).
export async function respondToReferralRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  respondingProfileId: string,
  referralRequestId: number,
  response: "interested" | "unavailable" | "question",
  message?: string
) {
  const { error } = await supabase.from("referral_responses").insert({
    referral_request_id: referralRequestId,
    responding_profile_id: respondingProfileId,
    status: response,
    message: message ?? null,
  });
  if (error) return { error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "referral_response",
    actorProfileId: respondingProfileId,
    summary: `responded "${response}" to a referral request`,
    metadata: { referralRequestId, response },
  });

  const { data: originalRequest } = await supabase
    .from("referral_requests")
    .select("requesting_profile_id")
    .eq("id", referralRequestId)
    .maybeSingle();
  if (originalRequest?.requesting_profile_id) {
    await raiseNotification(supabase, {
      eventType: "referral_response",
      recipientProfileIds: [originalRequest.requesting_profile_id],
      actorProfileId: respondingProfileId,
      actorType: "member_web",
      summary: `responded "${response}" to your referral request`,
      deepLink: `/dashboard/refer/${referralRequestId}`,
      metadata: { referralRequestId, response },
    });
  }

  return { error: null };
}

// Master Brief #26's "Selected clinicians" audience choice - the schema
// and RLS have supported audience_type = 'selected' + audience_profile_ids
// since Phase 4 batch 3, but nothing ever wrote to audience_profile_ids.
// A request created as 'selected' starts empty (invisible to everyone but
// its own requester, per the existing RLS policy) - this is how the
// requester actually adds people to it, reusing the "Matches found" list
// already built for Referrals. Additive only (never removes anyone
// already added) and notifies each newly-added clinician the same way a
// wider_network/trusted request already does on send.
export async function addReferralAudienceProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number,
  profileIds: string[]
) {
  const { data: request } = await supabase
    .from("referral_requests")
    .select("requesting_profile_id, audience_profile_ids")
    .eq("id", referralRequestId)
    .maybeSingle();
  if (!request) return { error: "Referral request not found" };
  if (request.requesting_profile_id !== requestingProfileId) {
    return { error: "Only the requester can choose who sees this referral" };
  }

  const existing = new Set<string>(request.audience_profile_ids || []);
  const added = profileIds.filter((id) => id && !existing.has(id));
  if (added.length === 0) return { error: null };
  added.forEach((id) => existing.add(id));

  const { error } = await supabase
    .from("referral_requests")
    .update({ audience_type: "selected", audience_profile_ids: Array.from(existing) })
    .eq("id", referralRequestId);
  if (error) return { error: error.message };

  await raiseNotification(supabase, {
    eventType: "referral_sent",
    recipientProfileIds: added,
    actorProfileId: requestingProfileId,
    actorType: "member_web",
    summary: "sent you a referral request",
    deepLink: `/dashboard/refer/${referralRequestId}`,
    metadata: { referralRequestId },
  });

  return { error: null };
}

// Moves a request from "Interested" into "Professional connection" -
// requester picks one interested responder. The other open responses on
// the same request are left as-is (they weren't declined, just not
// chosen); Phase 5+ UI decides how to surface that.
export async function establishProfessionalConnection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number,
  respondingProfileId: string
) {
  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "connected" })
    .eq("id", referralRequestId)
    .eq("requesting_profile_id", requestingProfileId);
  if (error) return { error: error.message };

  // Record who was chosen, so closing the referral can credit the
  // relationship (Worked with before) to the right colleague.
  await supabase
    .from("referral_responses")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("referral_request_id", referralRequestId)
    .eq("responding_profile_id", respondingProfileId);

  await logProfessionalEvent(supabase, {
    eventType: "professional_relationship_created",
    actorProfileId: requestingProfileId,
    relatedProfileId: respondingProfileId,
    summary: "established a professional connection via referral",
    metadata: { referralRequestId },
  });

  await raiseNotification(supabase, {
    eventType: "referral_connected",
    recipientProfileIds: [respondingProfileId],
    actorProfileId: requestingProfileId,
    actorType: "member_web",
    summary: "chose you for a referral",
    deepLink: `/dashboard/refer/${referralRequestId}`,
    metadata: { referralRequestId },
  });

  return { error: null };
}

// Warm handoff / transition (Master Brief #24) - deliberately just a
// status flag for V1: the actual handoff content stays outside PsyAlliance
// per the Level 3 data-boundary rule (Addendum A7). This only marks that a
// handoff is under way, never carries patient information.
export async function markReferralHandoff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number
) {
  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "handoff" })
    .eq("id", referralRequestId)
    .eq("requesting_profile_id", requestingProfileId);
  return { error: error?.message ?? null };
}

export async function closeReferralRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number,
  outcome?: string
) {
  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", referralRequestId)
    .eq("requesting_profile_id", requestingProfileId);
  if (error) return { error: error.message };

  // Credit the chosen colleague (if any) so the referral counts towards
  // Worked with before for both members.
  const { data: chosen } = await supabase
    .from("referral_responses")
    .select("responding_profile_id")
    .eq("referral_request_id", referralRequestId)
    .eq("status", "accepted")
    .maybeSingle();

  await logProfessionalEvent(supabase, {
    eventType: "referral_outcome",
    actorProfileId: requestingProfileId,
    relatedProfileId: chosen?.responding_profile_id ?? null,
    summary: outcome ?? "closed a referral request",
    metadata: { referralRequestId },
  });

  return { error: null };
}
