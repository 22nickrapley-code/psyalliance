import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { clinicianName } from "@/lib/profession";
import { CoverPlanStepView } from "../views";

export const metadata = { title: "New cover plan" };

export default async function NewCoverPlanPage(props: {
  searchParams: Promise<{ error?: string; absence?: string; title?: string; starts?: string; ends?: string; state?: string; fix?: string; with?: string }>;
}) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const options = await loadNeedOptions(supabase);
  const kept = sp.absence || sp.title || sp.starts || sp.ends || sp.state;
  // "Ask for cover" on a colleague's profile: that colleague is asked first.
  let withColleague: { id: string; name: string } | null = null;
  if (sp.with && /^[0-9a-f-]{36}$/i.test(sp.with)) {
    const { data: rows } = await supabase.from("public_directory").select("id, full_name, credential_prefix, qualification_level").eq("id", sp.with).limit(1);
    const p: any = rows?.[0];
    if (p) withColleague = { id: p.id, name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix) };
  }
  return (
    <CoverPlanStepView
      options={options}
      error={sp.error}
      fix={sp.fix}
      withColleague={withColleague}
      preset={kept ? { absenceType: sp.absence || "", title: sp.title || "", starts: sp.starts || "", ends: sp.ends || "", state: sp.state || "" } : undefined}
    />
  );
}
