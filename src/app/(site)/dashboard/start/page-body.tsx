import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHead, Banner } from "../_components/ui";
import { GUIDE, HELPS, HELP_LABEL, CONTEXT_LABEL, HANDOFF_COOKIE, parseHandoff } from "@/lib/start-guide";
import { createClient } from "@/lib/supabase/server";
import { continueStartAction, confirmHelpAction, startFreshAction, discardSuggestionAction } from "./actions";

export const metadata = { title: "Getting started" };

// Shown once after sign-in when a choice came from the public guide. It only offers; the member decides.
export default async function StartPage(props: { searchParams: Promise<{ route?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const h = parseHandoff((await cookies()).get(HANDOFF_COOKIE)?.value);
  if (!h && !sp.route) redirect("/dashboard");
  const need = h?.need;
  const e = need ? GUIDE[need] : null;
  const route = sp.route;
  // What the account already says. A suggestion never overwrites it silently: where they differ, both are shown and the member picks.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: mp } = user ? await supabase.from("member_participation").select("open_referrals, open_cover, open_consult, situations_updated_at").eq("profile_id", user.id).maybeSingle() : { data: null };
  const decided = !!mp?.situations_updated_at;
  const current: Record<string, boolean> = { referrals: mp?.open_referrals ?? true, cover: mp?.open_cover ?? true, consult: mp?.open_consult ?? true };
  return (
    <>
      <PageHead eyebrow="Getting started" title="We’ve used your choices to get you started" lead="Check or change them below. Nothing has been sent, published or switched on." />
      <Banner error={sp.error} ok={null} />
      <section className="card" data-handoff>
        {e && need ? (
          <>
            <ul className="summary-list">
              <li><span>You chose</span><strong>{e.choice}</strong></li>
              {h?.ctx ? (
                <li data-suggestion="ctx">
                  <span>Private context</span>
                  <strong>{CONTEXT_LABEL[h.ctx] || h.ctx}</strong>
                  <small className="muted" data-provenance>Suggested from your choice on the public guide. Only you see this.</small>
                  <form action={discardSuggestionAction}><button type="submit" name="discard" value="ctx" className="btn secondary small-btn">Discard</button></form>
                </li>
              ) : null}
            </ul>
            <p className="small">{e.summary}</p>
            <p className="small">Your licence is still checked by a person. Until it is, some actions may be limited, and you will be told which.</p>
          </>
        ) : null}

        {route === "help" || need === "offer_support" ? (
          <form action={confirmHelpAction}>
            <p><strong>Which kinds of request would you consider?</strong></p>
            <p className="small">Choose any, or none. This is not a commitment to accept any request, and you can pause each one later. Having no referral places does not stop you offering Cover or Consult.</p>
            {HELPS.map((k) => {
              const suggested = !!h?.helps?.includes(k);
              // Nothing the member has already decided is changed unless they tick or untick it here.
              const checked = decided ? current[k] : suggested;
              const differs = decided && suggested !== current[k] && (suggested || h?.helps !== undefined);
              return (
                <div key={k} data-suggestion={k}>
                  <label className="item row" style={{ gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" name="help" value={k} defaultChecked={checked} style={{ accentColor: "var(--forest)", width: 18, height: 18 }} />
                    <span>{HELP_LABEL[k]}</span>
                  </label>
                  {suggested ? <small className="muted" data-provenance>Suggested from your choice on the public guide.</small> : null}
                  {differs ? <small className="muted" data-conflict> Your account currently has this {current[k] ? "on" : "off"}; it stays that way unless you change it here.</small> : null}
                  {suggested ? <button type="submit" formAction={discardSuggestionAction} name="discard" value={k} className="text-link small" formNoValidate>Discard suggestion</button> : null}
                </div>
              );
            })}
            <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
              <button type="submit" className="btn small-btn">Save my choices</button>
            </div>
          </form>
        ) : route === "transition" || need === "reducing" ? (
          <form action={continueStartAction}>
            <p><strong>Which fits what you need?</strong></p>
            <p className="small">Passing a client on permanently is a referral. Planning for continuity is separate from temporary Cover. Pick one; nothing is started for you.</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="submit" name="route" value="referral" className="btn small-btn">Prepare a client referral</button>
              <button type="submit" name="route" value="continuity" className="btn secondary small-btn">Open my continuity plan</button>
            </div>
          </form>
        ) : (
          <form action={continueStartAction} className="row wrap" style={{ gap: 8 }}>
            <button type="submit" className="btn small-btn" data-start-continue>{e?.cta || "Continue"}</button>
          </form>
        )}
        <form action={startFreshAction} className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn secondary small-btn" data-start-fresh>Start fresh</button>
          <a className="btn secondary small-btn" href="/dashboard/settings#situations">Review in Settings</a>
        </form>
      </section>
    </>
  );
}
