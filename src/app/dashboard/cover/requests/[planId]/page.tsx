import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { CoverRequestView } from "../../views";
import { loadIncomingRequests } from "../../incoming-data";

export const metadata = { title: "Cover request" };

// One colleague's cover request to you: the need for each client first,
// then your answer and the conversation, in place (Nick, 18 Oct).
export default async function CoverRequestPage(props: { params: Promise<{ planId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { planId } = await props.params;
  const { error } = await props.searchParams;
  const id = Number(planId);
  if (!Number.isFinite(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const options = await loadNeedOptions(supabase);
  const [request] = await loadIncomingRequests(supabase, user!.id, options, { planId: id, withThreads: true });
  if (!request) notFound();
  return <CoverRequestView r={request} error={error} />;
}
