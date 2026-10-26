import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { CoverIndexView } from "./views";
import { summarise } from "./data";
import { loadIncomingRequests } from "./incoming-data";

export const metadata = { title: "Cover" };

// The Cover home (Nick, 18 Oct): plan cover in the green box, then cover
// requests sent to you and the plans you've set up, each a colour-coded
// history. Each request and plan opens on its own page.
export default async function CoverPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const options = await loadNeedOptions(supabase);
  const [{ data: plans }, incoming] = await Promise.all([
    supabase.from("coverage_plans").select("*, coverage_plan_cases(status, jurisdiction_state)").eq("profile_id", myself).order("created_at", { ascending: false }),
    loadIncomingRequests(supabase, myself, options),
  ]);

  return (
    <CoverIndexView
      plans={(plans || []).map((p: any) => summarise(p, p.coverage_plan_cases || []))}
      incoming={incoming}
      ok={ok}
      error={error}
    />
  );
}
