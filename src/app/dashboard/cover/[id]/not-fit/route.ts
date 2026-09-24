import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Not a fit for this case" from the Candidates step. A plain POST route
// (rather than a server action on a button) because the button sits
// inside the step's GET form, which carries the member's other picks.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData();
  const [caseId, candidateId] = String(form.get("not_fit") || "").split(":");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const back = new URL(`/dashboard/cover/${id}?step=candidates`, request.url);
  if (!user || !caseId || !candidateId) return NextResponse.redirect(back, 303);
  // RLS limits inserts to the plan owner's own rows.
  await supabase.from("coverage_case_rejections").insert({
    profile_id: user.id,
    coverage_plan_case_id: Number(caseId),
    candidate_profile_id: candidateId,
  });
  return NextResponse.redirect(back, 303);
}
