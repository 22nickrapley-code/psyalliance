import { createClient } from "@/lib/supabase/server";
import { notifyProfile } from "@/lib/notifications";

// PsyA2 #101 (content moderation): a member reports a consultation,
// message, profile, user, or Library concern; an admin reviews and acts.
// Canonical service layer over the `reports` table - see the
// rebuild_admin_moderation migration for the schema/RLS this relies on.

export type ReportTargetType =
  | "consultation"
  | "consultation_response"
  | "message"
  | "profile"
  | "user"
  | "library_document"
  | "referral"
  | "referral_response"
  | "cover_request";

export type ReportCategory = "patient_information" | "conduct" | "other";

// Content an admin can redact in place (admin_redact, migration 0084).
export const REDACTABLE: ReportTargetType[] = ["consultation", "consultation_response", "message", "referral", "referral_response", "cover_request"];

export async function fileReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reporterProfileId: string,
  opts: { targetType: ReportTargetType; targetId: string; reason: string; category?: ReportCategory }
) {
  const category: ReportCategory = opts.category || "other";
  const reason = opts.reason.trim() || (category === "patient_information" ? "Contains patient information" : "");
  if (!reason) return { error: "Say what's wrong so an admin has something to act on" };

  const { error } = await supabase.from("reports").insert({
    reporter_profile_id: reporterProfileId,
    target_type: opts.targetType,
    target_id: opts.targetId,
    reason,
    category,
  });
  return { error: error?.message ?? null };
}

// The admin side of #101's action list (hide/warn/restrict/suspend/
// escalate) plus dismiss. "Hide" isn't wired to an actual visibility flag
// on the reported content yet - see the moderation queue page for why
// that's a deliberate, documented gap rather than an oversight - so for
// now it just resolves the report with that as the recorded action.
// Restrict/suspend write straight to the reported member's account_status
// when the admin supplies one (accountStatusProfileId); nothing about the
// target content itself changes for those two.
export async function resolveReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminProfileId: string,
  reportId: number,
  opts: {
    action: "dismissed" | "hidden" | "warned" | "restricted" | "suspended" | "escalated";
    adminNotes?: string;
    accountStatusProfileId?: string;
  }
) {
  const status = opts.action === "escalated" ? "escalated" : opts.action === "dismissed" ? "dismissed" : "resolved";

  const { error } = await supabase
    .from("reports")
    .update({
      status,
      resolved_by: adminProfileId,
      resolved_at: new Date().toISOString(),
      action_taken: opts.action,
      admin_notes: opts.adminNotes || null,
    })
    .eq("id", reportId);
  if (error) return { error: error.message };

  if ((opts.action === "restricted" || opts.action === "suspended") && opts.accountStatusProfileId) {
    const { error: statusError } = await supabase
      .from("profiles")
      .update({ account_status: opts.action === "restricted" ? "restricted" : "suspended" })
      .eq("id", opts.accountStatusProfileId);
    if (statusError) return { error: statusError.message };
  }

  if (opts.action === "warned" && opts.accountStatusProfileId) {
    await notifyProfile(supabase, {
      profileId: opts.accountStatusProfileId,
      title: "A moderation note on your account",
      body:
        opts.adminNotes ||
        "An admin reviewed a report involving your account and wanted to flag it to you directly. Reach out if you have questions.",
      createdBy: adminProfileId,
    });
  }

  return { error: null };
}
