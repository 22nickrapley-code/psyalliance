import { IS_DEMO_SITE } from "@/lib/env";
import { shortDate } from "@/lib/dates";
import { PageHead, Banner, Status } from "../../_components/ui";
import { setAiAction } from "./actions";

type Info = {
  enabled: boolean;
  changedAt: string | null;
  changedBy: string | null;
  limit: number;
  today: { uses: number; smart: number; ask: number; members: number; atLimit: number };
  week: { uses: number; smart: number; ask: number; members: number };
} | null;

// One switch per site (Nick, 6 Nov): the sandbox and the live site each have their own. Off, members see the
// product exactly as before. On, they get smart requests (describe a need by typing, speaking or dropping a file, then
// check the filled-in form) and the Ask PsyAlliance box on the Hub. Nothing is sent or saved by AI.
export function AiView({ info, keySet, sp }: { info: Info; keySet: boolean; sp: { error?: string; on?: string; off?: string } }) {
  const on = !!info?.enabled;
  const site = IS_DEMO_SITE ? "the sandbox" : "the live site";
  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="AI"
        lead={`Switch PsyAlliance's AI features on or off for ${site}. It takes effect on members' next page load, with no rebuild. The other site has its own switch.`}
      />
      <Banner error={sp.error} ok={sp.on ? `AI is on for ${site}.` : sp.off ? `AI is off for ${site}. Members see the usual forms only.` : null} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title">
              <h3>AI tech enabled</h3>
              <Status tone={on ? "" : "neutral"}>{on ? "On" : "Off"}</Status>
            </div>
            <p className="small">
              {info?.changedAt ? `Last changed ${shortDate(info.changedAt)}${info.changedBy ? ` by ${info.changedBy}` : ""}.` : "Off since this release."}
            </p>
            {!keySet && (
              <p className="small" role="note">
                No Anthropic API key is set on this site, so AI calls will fail and members will be told to use the form. Add ANTHROPIC_API_KEY as a
                Cloudflare secret first.
              </p>
            )}
            <form action={setAiAction}>
              <input type="hidden" name="on" value={on ? "0" : "1"} />
              <button type="submit" className={on ? "btn secondary" : "btn"}>{on ? "Switch AI off" : "Switch AI on"}</button>
            </form>
          </section>
          <section className="card">
            <div className="card-title"><h3>Use</h3><span className="micro-note">{info?.limit ?? 20} uses a day per member</span></div>
            <div className="states-table">
              <div className="states-row head"><span /><span>Smart requests</span><span>Ask</span><span>Members</span></div>
              <div className="states-row"><span><b>Today</b></span><span data-label="Smart requests">{info?.today.smart ?? 0}</span><span data-label="Ask">{info?.today.ask ?? 0}</span><span data-label="Members">{info?.today.members ?? 0}</span></div>
              <div className="states-row"><span><b>Last 7 days</b></span><span data-label="Smart requests">{info?.week.smart ?? 0}</span><span data-label="Ask">{info?.week.ask ?? 0}</span><span data-label="Members">{info?.week.members ?? 0}</span></div>
            </div>
            {(info?.today.atLimit || 0) > 0 && <p className="small" style={{ marginBottom: 0 }}>{info?.today.atLimit} member{info?.today.atLimit === 1 ? " has" : "s have"} used today&apos;s allowance.</p>}
          </section>
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">What switching on changes</div>
            <p className="small">Smart requests: on Cover and Referrals, members can describe a need by typing, speaking or dropping a spreadsheet or document. The form fills in for them to check; nothing is sent until they press Send.</p>
            <p className="small">Ask PsyAlliance: a one-line box on the Hub that answers from the member&apos;s own plans and referrals, the Library and the PsyAlliance guide, with sources. Who to ask is always chosen by the usual matching rules.</p>
            <p className="small" style={{ marginBottom: 0 }}>Profile import (&ldquo;Fill in from this text&rdquo;) is not affected by this switch.</p>
          </section>
          <section className="card">
            <div className="eyebrow">Privacy</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Text with contact details, full dates, record numbers or addresses is refused before it reaches the model, and dropped files have name, date and
              contact columns removed in the member&apos;s browser first. Names in free text can&apos;t be detected reliably, so the screens ask members to leave
              them out. Members&apos; text is not stored. Speaking uses the browser&apos;s own speech service.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
