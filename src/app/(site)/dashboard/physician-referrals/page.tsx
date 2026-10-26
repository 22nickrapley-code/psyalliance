import { shortDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { PageHead, Banner, Empty } from "../_components/ui";
import { acknowledgeProviderReferral, declineProviderReferral } from "../referrals/actions";

export const metadata = { title: "Physician referrals" };

// Referrals sent to you by physicians who refer through PsyAlliance's
// physician page. They sit outside the colleague workspace: acknowledge or
// decline here, and the referring physician is told.
export default async function PhysicianReferralsPage(props: { searchParams: Promise<{ error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("provider_referrals")
    .select("id, status, created_at, reason, referring_providers(full_name, practice_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data as any[]) || [];
  return (
    <>
      <PageHead eyebrow="Your practice" title="Physician referrals" lead="Referrals from physicians. Acknowledge one to let them know you have it, or decline if you can't take it." actions={<a className="btn secondary" href="/dashboard/referrals">Back to Referrals</a>} />
      <Banner error={sp.error} />
      {rows.length === 0 ? (
        <Empty title="No physician referrals." body="When a physician refers a client to you, it appears here." />
      ) : (
        <section className="card">
          {rows.map((r: any) => (
            <div key={r.id} className="item">
              <strong>
                {r.referring_providers?.full_name || "A physician"}
                {r.referring_providers?.practice_name ? ` · ${r.referring_providers.practice_name}` : ""}
              </strong>
              <p>
                {r.reason || "Referral"} &middot; {shortDate(r.created_at)} &middot; {r.status}
              </p>
              {r.status === "sent" && (
                <div className="row" style={{ marginTop: 6 }}>
                  <form action={acknowledgeProviderReferral} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn small-btn">Acknowledge</button>
                  </form>
                  <form action={declineProviderReferral} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn ghost small-btn">Decline</button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
