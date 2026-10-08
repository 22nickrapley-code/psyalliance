import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { longDate } from "@/lib/dates";
import { PageHead, Banner, Status, Empty } from "../../_components/ui";
import { respondContinuityAction } from "../actions";

export const metadata = { title: "Plans you're named in" };

// Colleagues who named you as their backup: agree or decline, then open
// the plans you've agreed to.
export default async function ContinuityDutiesPage(props: { searchParams: Promise<{ accepted?: string; declined?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_continuity_duties");
  const duties = ((data as any[]) || []).sort((a, b) => Number(b.status === "invited") - Number(a.status === "invited"));
  return (
    <>
      <PageHead
        eyebrow="Continuity plan"
        title="Plans you're named in"
        lead="Colleagues who have asked you to act for them if they can't practice. Agreeing lets you open their plan; it holds no client information."
        actions={<a className="btn secondary" href="/dashboard/continuity">Your own plan</a>}
      />
      <Banner
        error={sp.error}
        ok={sp.accepted ? "Thank you. They've been told, and you can open their plan below." : sp.declined ? "They've been told you can't do it, so they can ask someone else." : null}
      />
      {duties.length === 0 ? (
        <Empty title="No one has named you yet." body="When a colleague names you as their backup, it appears here for you to agree or decline." />
      ) : (
        <div className="stack">
          {duties.map((d: any) => {
            const name = clinicianName(d.owner_name, d.qualification_level, d.credential_prefix);
            return (
              <section key={`${d.owner_id}-${d.role}`} className="card duty-card">
                <div className="row between wrap" style={{ gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>
                      <a href={`/dashboard/people/${d.owner_id}`}>{name}</a>
                    </h3>
                    <p className="small" style={{ margin: "4px 0 0" }}>
                      Named you as their {d.role === "backup" ? "backup" : "alternate backup"} &middot; updated {longDate(d.updated_at)}
                    </p>
                  </div>
                  <Status tone={d.status === "invited" ? "warn" : d.status === "accepted" ? "" : "neutral"}>
                    {d.status === "invited" ? "Waiting for your reply" : d.status === "accepted" ? "You agreed" : "You declined"}
                  </Status>
                </div>
                {d.status === "invited" && (
                  <>
                    <p className="small" style={{ margin: "12px 0" }}>
                      If {name.split(",")[0]} can&rsquo;t practice, you&rsquo;d tell their clients, help arrange continuing care and look after
                      their records, following the instructions in their plan. You can talk it through with them first.
                    </p>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <form action={respondContinuityAction} className="inline">
                        <input type="hidden" name="owner" value={d.owner_id} />
                        <input type="hidden" name="accept" value="1" />
                        <button type="submit" className="btn small-btn resp-accept">I agree</button>
                      </form>
                      <a className="btn small-btn resp-discuss" href={`/dashboard/messages?to=${d.owner_id}`}>Talk first</a>
                      <form action={respondContinuityAction} className="inline">
                        <input type="hidden" name="owner" value={d.owner_id} />
                        <input type="hidden" name="accept" value="0" />
                        <button type="submit" className="btn small-btn resp-decline">I can&rsquo;t</button>
                      </form>
                    </div>
                  </>
                )}
                {d.status === "accepted" && (
                  <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                    <a className="btn secondary small-btn" href={`/dashboard/continuity/view/${d.owner_id}`}>Open their plan</a>
                    <a className="text-arrow" href={`/continuity/print?owner=${d.owner_id}`} target="_blank" rel="noopener">Print or save as PDF &rarr;</a>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
