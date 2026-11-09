import { IS_DEMO_SITE } from "@/lib/env";
import { shortDate } from "@/lib/dates";
import { PageHead, Banner, Status } from "../../_components/ui";
import { setGroupsAction } from "./actions";

type Info = { consultGroups: boolean; changedAt: string | null; changedBy: string | null; groups: number } | null;

// Site switches (v5, Nick 8 Nov). Consultation groups are kept in the code and the database but hidden until
// this is switched on. Each site (sandbox and live) has its own switch.
export function FeaturesView({ info, sp }: { info: Info; sp: { error?: string; on?: string; off?: string } }) {
  const on = !!info?.consultGroups;
  const site = IS_DEMO_SITE ? "the sandbox" : "the live site";
  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Features"
        lead={`Switch parts of PsyAlliance on or off for ${site}. Changes take effect on members' next page load, with no rebuild. The other site has its own switches.`}
      />
      <Banner error={sp.error} ok={sp.on ? `Consultation groups are on for ${site}.` : sp.off ? `Consultation groups are off for ${site}.` : null} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title">
              <h3>Consultation groups</h3>
              <Status tone={on ? "" : "neutral"}>{on ? "On" : "Off"}</Status>
            </div>
            <p className="small">
              {info?.changedAt ? `Last changed ${shortDate(info.changedAt)}${info.changedBy ? ` by ${info.changedBy}` : ""}.` : "Off since v5."}{" "}
              {typeof info?.groups === "number" ? `${info.groups} group${info.groups === 1 ? "" : "s"} saved.` : ""}
            </p>
            <form action={setGroupsAction}>
              <input type="hidden" name="on" value={on ? "0" : "1"} />
              <button type="submit" className={on ? "btn secondary" : "btn"}>{on ? "Switch groups off" : "Switch groups on"}</button>
            </form>
          </section>
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">What the switch changes</div>
            <p className="small">On: members see their consultation groups in Consult and Messages, can post a question to a group, and group questions appear in Consult and the Hub.</p>
            <p className="small" style={{ marginBottom: 0 }}>Off: none of that shows and posting to a group is refused. Groups, members and their discussions are kept, and come back when the switch is turned on.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
