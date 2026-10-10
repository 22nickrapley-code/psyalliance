import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { CoverPlanStepView } from "../views";

export const metadata = { title: "New cover plan" };

export default async function NewCoverPlanPage(props: {
  searchParams: Promise<{ error?: string; absence?: string; title?: string; starts?: string; ends?: string; state?: string; fix?: string }>;
}) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const options = await loadNeedOptions(supabase);
  const kept = sp.absence || sp.title || sp.starts || sp.ends || sp.state;
  return (
    <CoverPlanStepView
      options={options}
      error={sp.error}
      fix={sp.fix}
      preset={kept ? { absenceType: sp.absence || "", title: sp.title || "", starts: sp.starts || "", ends: sp.ends || "", state: sp.state || "" } : undefined}
    />
  );
}
