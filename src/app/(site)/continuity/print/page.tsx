import "../../premium.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { PlanDocument } from "../../dashboard/continuity/document";
import { loadPlanForDocument } from "../../dashboard/continuity/load";
import { PrintButton } from "./print-button";

export const metadata = { title: "Continuity plan", robots: { index: false, follow: false } };

// The plan on its own page, laid out for paper: choose "Save as PDF" in
// the print dialog to keep a copy, then print and sign it.
export default async function ContinuityPrintPage(props: { searchParams: Promise<{ owner?: string }> }) {
  const { owner } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(IS_DEMO_SITE ? "/sandbox/ended" : "/auth/sign-in");
  const doc = await loadPlanForDocument(supabase, owner || user.id);
  return (
    <div className="pa print-shell">
      <div className="print-toolbar">
        <a className="text-arrow" href={owner ? "/dashboard/continuity/duties" : "/dashboard/continuity"}>&larr; Back</a>
        <span className="micro-note">In the print dialog, choose &ldquo;Save as PDF&rdquo; to keep a copy.</span>
        <PrintButton />
      </div>
      {doc ? (
        <PlanDocument {...doc} />
      ) : (
        <div className="card" style={{ maxWidth: 640, margin: "40px auto" }}>
          <h3>Nothing to print yet.</h3>
          <p className="small">Start your plan first: name a backup and fill in a section or two.</p>
          <a className="btn" href="/dashboard/continuity">Start your plan</a>
        </div>
      )}
    </div>
  );
}
