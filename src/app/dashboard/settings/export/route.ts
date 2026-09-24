import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Settings > Data: a member's own data as one JSON file. Everything is read
// with the member's own session, so RLS limits it to what they own.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  const me = user.id;

  const q = async (table: string, column: string, select = "*") => {
    const { data } = await supabase.from(table).select(select).eq(column, me);
    return data || [];
  };

  const [profile, practiceFacts, licences, ce, panels, referrals, coverPlans, consultations, consultReplies, messages, saved, excluded, blocked, ratings, prefs, myDocuments] =
    await Promise.all([
      supabase.rpc("my_profile").maybeSingle<any>().then((r) => r.data),
      q("profile_lookup_values", "profile_id", "rank, lookup_values(category, value)"),
      q("licenses", "profile_id"),
      q("continuing_education_credits", "profile_id"),
      q("insurance_panels", "profile_id"),
      q("referral_requests", "requesting_profile_id"),
      q("coverage_plans", "profile_id", "*, coverage_plan_cases(*)"),
      q("consultations", "author_profile_id"),
      q("consultation_responses", "responder_profile_id"),
      q("conversation_messages", "author_id", "conversation_id, body, created_at, edited_at"),
      q("saved_clinicians", "profile_id"),
      q("do_not_work_with", "profile_id"),
      q("blocked_members", "profile_id"),
      q("collaboration_ratings", "rater_profile_id"),
      q("notification_preferences", "profile_id"),
      supabase.from("documents").select("title, created_at, sources").eq("profile_id", me).eq("owner_scope", "personal").then((r) => r.data || []),
    ]);

  const body = {
    exported_at: new Date().toISOString(),
    account_email: user.email,
    profile,
    practice_facts: practiceFacts,
    licences,
    continuing_education: ce,
    insurance_panels: panels,
    referrals_sent: referrals,
    cover_plans: coverPlans,
    consultations_asked: consultations,
    consultation_replies: consultReplies,
    messages_sent: messages,
    saved_colleagues: saved,
    excluded: excluded,
    blocked: blocked,
    would_work_with_again: ratings,
    notification_preferences: prefs,
    my_library_files: myDocuments,
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="psyalliance-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
