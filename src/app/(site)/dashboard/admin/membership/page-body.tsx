import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { stateName } from "@/lib/open-states";
import { PageHead, Banner } from "../../_components/ui";

export const metadata = { title: "Membership" };

// Who has activated membership (v4). Nobody is charged: activation records the choice and the main practice state.
// The first 40 in each state are founding members, free for life; then $30 a month, taken once payments are set up.
export default async function AdminMembershipPage() {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { data, error } = await supabase.rpc("admin_membership");
  const info = (data as any) || { states: [], waiting: 0, priceCents: 3000 };
  const price = `$${Math.round(Number(info.priceCents || 3000) / 100)} a month`;
  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Membership"
        lead={`Verified members activate membership from their Actions. The first 40 in each state are founding members, free for life; after that it is ${price}. Nobody is charged until payments are set up.`}
      />
      <Banner error={error?.message} />
      <section className="card">
        <div className="card-title"><h3>Activated</h3><span className="micro-note">{info.waiting} verified member{info.waiting === 1 ? " hasn't" : "s haven't"} activated yet</span></div>
        {info.states.length === 0 ? (
          <p className="small" style={{ marginBottom: 0 }}>Nobody has activated yet.</p>
        ) : (
          <div className="states-table">
            <div className="states-row head"><span>State</span><span>Founding (of 40)</span><span>{price}</span><span /></div>
            {info.states.map((s: any) => (
              <div key={s.state} className="states-row">
                <span><b>{stateName(s.state)}</b></span>
                <span data-label="Founding">{s.founding}</span>
                <span data-label={price}>{s.standard}</span>
                <span />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
