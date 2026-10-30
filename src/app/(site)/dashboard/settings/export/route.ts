import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Settings > Data: a member's own data as one JSON file. Everything is read
// with the member's own session, so RLS limits it to what they own or take
// part in. It is a copy of your records, not a backup: files are listed
// (name and folder) but their contents aren't included; download those
// from My documents. Any section that couldn't be read is named in
// `sections_not_included`, never silently left empty (release review R09).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/sign-in?next=%2Fdashboard%2Fsettings", request.url));
  const me = user.id;
  const missing: string[] = [];

  const read = async (label: string, run: () => PromiseLike<{ data: any; error: any }>) => {
    const { data, error } = await run();
    if (error) {
      missing.push(label);
      return null;
    }
    return data ?? [];
  };
  const own = (label: string, table: string, column: string, select = "*") => read(label, () => supabase.from(table).select(select).eq(column, me));

  const [
    profile,
    practiceFacts,
    licenses,
    ce,
    panels,
    referralsSent,
    referralRepliesGiven,
    coverPlans,
    coverRequestsReceived,
    consultations,
    consultReplies,
    groups,
    continuity,
    continuityDuties,
    myConversations,
    trusted,
    excluded,
    blocked,
    ratings,
    prefs,
    myDocuments,
    folders,
  ] = await Promise.all([
    read("profile", () => supabase.rpc("my_profile").maybeSingle<any>()),
    own("practice_facts", "profile_lookup_values", "profile_id", "rank, lookup_values(category, value)"),
    own("licenses", "licenses", "profile_id"),
    own("continuing_education", "continuing_education_credits", "profile_id"),
    own("insurance_panels", "insurance_panels", "profile_id"),
    own("referrals_sent", "referral_requests", "requesting_profile_id", "*, referral_responses(status, message, created_at, responded_at)"),
    own("referral_replies_given", "referral_responses", "responding_profile_id"),
    own("cover_plans", "coverage_plans", "profile_id", "*, coverage_plan_cases(*, coverage_requests(status, sent_at, responded_at))"),
    own("cover_requests_received", "coverage_requests", "requested_profile_id", "status, message, sent_at, responded_at"),
    own("consultations_asked", "consultations", "author_profile_id", "*, consultation_responses(body, response_type, created_at)"),
    own("consultation_replies", "consultation_responses", "responder_profile_id", "id, consultation_id, response_type, body, created_at"),
    own("groups", "consultation_group_members", "profile_id", "status, role, invited_at, responded_at, consultation_groups(name, charter_body)"),
    own("continuity_plan", "continuity_plans", "profile_id"),
    read("continuity_duties", () => supabase.rpc("my_continuity_duties")),
    own("conversations", "conversation_participants", "profile_id", "conversation_id, conversations(title, created_at)"),
    own("trusted_colleagues", "trusted_colleagues", "profile_id"),
    own("excluded", "do_not_work_with", "profile_id"),
    own("blocked", "blocked_members", "profile_id"),
    own("would_work_with_again", "collaboration_ratings", "rater_profile_id"),
    own("notification_preferences", "notification_preferences", "profile_id"),
    read("my_library_files", () => supabase.from("documents").select("title, created_at, sources, storage_path, folder_id").eq("profile_id", me).eq("owner_scope", "personal")),
    own("my_library_folders", "document_folders", "profile_id", "id, name, created_at"),
  ]);

  // Every message in conversations you take part in, yours and others'.
  const conversationIds = ((myConversations as any[]) || []).map((c) => c.conversation_id);
  const messages = conversationIds.length
    ? await read("messages", () =>
        supabase.from("conversation_messages").select("conversation_id, author_id, body, created_at, edited_at").in("conversation_id", conversationIds).is("deleted_at", null).order("created_at")
      )
    : [];

  const body = {
    exported_at: new Date().toISOString(),
    what_this_is:
      "A copy of your PsyAlliance records. It is not a backup: files are listed but their contents are not included (download them from My documents), and it can't be imported back.",
    sections_not_included: missing,
    account_email: user.email,
    profile,
    practice_facts: practiceFacts,
    licenses,
    continuing_education: ce,
    insurance_panels: panels,
    referrals_sent: referralsSent,
    referral_replies_given: referralRepliesGiven,
    cover_plans: coverPlans,
    cover_requests_received: coverRequestsReceived,
    consultations_asked: consultations,
    consultation_replies: consultReplies,
    consultation_groups: groups,
    continuity_plan: continuity,
    continuity_plans_you_back_up: continuityDuties,
    conversations: myConversations,
    messages,
    trusted_colleagues: trusted,
    excluded,
    blocked,
    would_work_with_again: ratings,
    notification_preferences: prefs,
    my_library_files: ((myDocuments as any[]) || []).map((d) => ({
      title: d.title,
      created_at: d.created_at,
      sources: d.sources,
      file_name: String(d.storage_path || "").split("/").pop(),
      folder_id: d.folder_id,
    })),
    my_library_folders: folders,
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="psyalliance-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
