import { createClient } from "@/lib/supabase/server";
import { PageHead, Empty } from "../../../_components/ui";
import { PlanDocument } from "../../document";
import { loadPlanForDocument } from "../../load";

export const metadata = { title: "Continuity plan" };

// A colleague's plan, for the backup who agreed to act on it.
export default async function ColleaguePlanPage(props: { params: Promise<{ owner: string }> }) {
  const { owner } = await props.params;
  const supabase = await createClient();
  const doc = await loadPlanForDocument(supabase, owner);
  if (!doc) {
    return (
      <>
        <PageHead eyebrow="Continuity plan" title="Plan not available" />
        <Empty title="You can open a colleague's plan once you've agreed to be their backup." body="If they've changed who they named, it's no longer shared with you." action={<a className="btn secondary" href="/dashboard/continuity/duties">Plans you're named in</a>} />
      </>
    );
  }
  return (
    <>
      <PageHead
        eyebrow="Continuity plan"
        title={doc.ownerName}
        lead="You agreed to act on this plan. Keep a printed, signed copy somewhere you can reach it."
        actions={<a className="btn" href={`/continuity/print?owner=${owner}`} target="_blank" rel="noopener">Print or save as PDF</a>}
      />
      <section className="card plan-doc-card">
        <PlanDocument {...doc} />
      </section>
    </>
  );
}
