import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { CoverPlanStepView } from "../views";

export default async function NewCoverPlanPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const options = await loadNeedOptions(supabase);
  return <CoverPlanStepView options={options} error={error} />;
}
