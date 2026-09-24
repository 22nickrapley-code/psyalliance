import { createClient } from "@/lib/supabase/server";
import { logProfessionalEvent } from "@/lib/professional-events";
import { raiseNotification } from "@/lib/notifications-v2";

// Canonical Consult service layer (PsyA2 #56-67, PA-04/PA-05).

export type ConsultationType =
  | "diagnostic_clarification"
  | "treatment_impasse"
  | "risk"
  | "ethics_legal"
  | "boundaries_countertransference"
  | "medication_split_treatment"
  | "termination_transfer"
  | "referral_recommendation"
  | "practice_question"
  | "other";

export type ConsultationAudience = "trusted" | "selected" | "wider_network";

export type CaseDetail = Partial<{
  ageRange: string;
  culturalContext: string;
  presentingIssue: string;
  workingFormulation: string;
  treatmentSoFar: string;
  currentLevelOfCare: string;
  riskSummary: string;
  interventionsTried: string;
  stuckPoint: string;
  constraints: string;
}>;

// The 6-step composer (#58) maps directly onto this one call: question,
// type, audience, tags, optional context, then the de-identification
// confirmation gate for anything with case detail on a non-trusted
// audience (enforced again by the DB's own check constraint as a backstop).
export async function createConsultation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorProfileId: string,
  opts: {
    question: string;
    consultationType?: ConsultationType;
    audienceType: ConsultationAudience;
    audienceProfileIds?: string[];
    tags?: string[];
    context?: string;
    caseDetail?: CaseDetail;
    deidentificationConfirmed?: boolean;
    decisionNeededBy?: string;
    groupId?: number;
    kind?: "question" | "supervision_request" | "supervision_offer";
    status?: "draft" | "open";
  }
) {
  const hasCaseDetail = opts.caseDetail && Object.keys(opts.caseDetail).length > 0;
  if (hasCaseDetail && !opts.deidentificationConfirmed) {
    return { consultationId: null, error: "Confirm the question is de-identified before posting a case detail." };
  }

  const { data, error } = await supabase
    .from("consultations")
    .insert({
      author_profile_id: authorProfileId,
      question: opts.question,
      consultation_type: opts.consultationType ?? null,
      audience_type: opts.audienceType,
      audience_profile_ids: opts.audienceType === "selected" ? opts.audienceProfileIds ?? [] : [],
      tags: opts.tags ?? [],
      context: opts.context ?? null,
      deidentification_confirmed: opts.deidentificationConfirmed ?? false,
      case_detail: hasCaseDetail
        ? {
            age_range: opts.caseDetail?.ageRange,
            cultural_context: opts.caseDetail?.culturalContext,
            presenting_issue: opts.caseDetail?.presentingIssue,
            working_formulation: opts.caseDetail?.workingFormulation,
            treatment_so_far: opts.caseDetail?.treatmentSoFar,
            current_level_of_care: opts.caseDetail?.currentLevelOfCare,
            risk_summary: opts.caseDetail?.riskSummary,
            interventions_tried: opts.caseDetail?.interventionsTried,
            stuck_point: opts.caseDetail?.stuckPoint,
            constraints: opts.caseDetail?.constraints,
          }
        : {},
      status: opts.status ?? "open",
      kind: opts.kind ?? "question",
      decision_needed_by: opts.decisionNeededBy ?? null,
      group_id: opts.groupId ?? null,
    })
    .select("id")
    .single();
  if (error) return { consultationId: null, error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "consultation_created",
    actorProfileId: authorProfileId,
    summary: "opened a consultation",
    metadata: { consultationId: data.id, audienceType: opts.audienceType, consultationType: opts.consultationType },
  });

  return { consultationId: data.id, error: null };
}

export async function respondToConsultation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  responderProfileId: string,
  consultationId: number,
  body: string,
  responseType: "reply" | "clarifying_question" = "reply"
) {
  const { error } = await supabase.from("consultation_responses").insert({
    consultation_id: consultationId,
    responder_profile_id: responderProfileId,
    response_type: responseType,
    body,
  });
  if (error) return { error: error.message };

  const { data: consultation } = await supabase
    .from("consultations")
    .select("author_profile_id")
    .eq("id", consultationId)
    .maybeSingle();

  await Promise.all([
    supabase.from("consultations").update({ status: "responses_received" }).eq("id", consultationId).eq("status", "open"),
    logProfessionalEvent(supabase, {
      eventType: "consultation_response",
      actorProfileId: responderProfileId,
      summary: `${responseType === "clarifying_question" ? "asked a clarifying question on" : "replied to"} a consultation`,
      metadata: { consultationId },
    }),
    consultation?.author_profile_id
      ? raiseNotification(supabase, {
          eventType: "consultation_response",
          recipientProfileIds: [consultation.author_profile_id],
          actorProfileId: responderProfileId,
          actorType: "member_web",
          summary: responseType === "clarifying_question" ? "asked a clarifying question on your consultation" : "replied to your consultation",
          deepLink: `/dashboard/consult/${consultationId}`,
          metadata: { consultationId, responseType },
        })
      : Promise.resolve(),
  ]);

  return { error: null };
}

// PsyA2 #61: the author-only, private "mark as useful" on a response -
// explicitly not a public like-count/leaderboard, so this never touches
// anything the responder or anyone else can see. Toggles rather than only
// setting true, since the author may reconsider.
export async function setResponseUseful(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorProfileId: string,
  responseId: number,
  useful: boolean
) {
  const { data: response } = await supabase
    .from("consultation_responses")
    .select("consultation_id, consultations(author_profile_id)")
    .eq("id", responseId)
    .maybeSingle();
  if (!response) return { error: "Response not found" };
  const consultationAuthorId = (response as any).consultations?.author_profile_id as string | undefined;
  if (consultationAuthorId !== authorProfileId) return { error: "Only the consultation's author can mark a response useful" };

  const { error } = await supabase.from("consultation_responses").update({ marked_useful: useful }).eq("id", responseId);
  return { error: error?.message ?? null };
}

export async function resolveConsultation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorProfileId: string,
  consultationId: number
) {
  const { error } = await supabase
    .from("consultations")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", consultationId)
    .eq("author_profile_id", authorProfileId);
  return { error: error?.message ?? null };
}

// PA-04: create a closed peer consultation group and seed the creator as
// its first (already-joined) member.
export async function createConsultationGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  createdBy: string,
  opts: { name: string; purpose?: string; cadence?: string; meetingFormat?: "in_person" | "video" | "hybrid"; charterBody?: string }
) {
  const { data, error } = await supabase
    .from("consultation_groups")
    .insert({
      name: opts.name,
      purpose: opts.purpose ?? null,
      created_by: createdBy,
      cadence: opts.cadence ?? null,
      meeting_format: opts.meetingFormat ?? null,
      charter_body: opts.charterBody ?? null,
    })
    .select("id")
    .single();
  if (error) return { groupId: null, error: error.message };

  await supabase
    .from("consultation_group_members")
    .insert({ group_id: data.id, profile_id: createdBy, status: "joined", role: "creator", responded_at: new Date().toISOString() });

  return { groupId: data.id, error: null };
}

export async function inviteToConsultationGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: number,
  opts: { profileId?: string; externalEmail?: string }
) {
  if (!opts.profileId && !opts.externalEmail) return { error: "Need a member or an email to invite" };
  const { error } = await supabase.from("consultation_group_members").insert({
    group_id: groupId,
    profile_id: opts.profileId ?? null,
    external_email: opts.externalEmail ?? null,
  });
  return { error: error?.message ?? null };
}
