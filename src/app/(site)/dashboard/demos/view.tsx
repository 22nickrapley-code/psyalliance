import { IS_DEMO_SITE, TOUR_URL } from "@/lib/env";
import { findJourney } from "@/tour/journeys";
import { findScript } from "@/tour/demo-scripts";
import { lengthLabel } from "@/tour/scripts";
import { watchLength } from "../../tour/story-reel";
import { PageHead } from "../_components/ui";
import { WatchDemo } from "../_components/watch-demo";
import { hideDemosAction } from "./actions";

export const metadata = { title: "Demos" };

// Demos for members: a short video of each part of PsyAlliance, played on
// the same screens members use (the approved workspace on fictional people).
// The public site shows only the two-minute story; the detail lives here,
// once someone has an account (Nick, 11 Oct).
const WHERE: Record<string, { href: string; label: string }> = {
  cover: { href: "/dashboard/cover", label: "Go to Cover" },
  refer: { href: "/dashboard/referrals", label: "Go to Referrals" },
  consult: { href: "/dashboard/consult", label: "Go to Consult" },
  profile: { href: "/dashboard/profile", label: "Go to your profile" },
  circle: { href: "/dashboard/network", label: "Go to Network" },
  verified: { href: "/dashboard/credentials", label: "Go to Credentials" },
  library: { href: "/dashboard/library", label: "Go to the Library" },
  hub: { href: "/dashboard", label: "Go to the Hub" },
  messages: { href: "/dashboard/messages", label: "Go to Messages" },
};

// Every part of the product that has a self-playing demo, then the two pages the workspace does not cover.
const DEMO_KEYS = ["hub", "cover", "refer", "consult", "circle", "messages", "library", "availability", "profile", "verified"];

export default function DemosPage() {
  const keys = DEMO_KEYS;
  return (
    <>
      <PageHead
        eyebrow="Your practice"
        title="Demos"
        lead={
          IS_DEMO_SITE
            ? "A short video of each part of PsyAlliance, then try it right here. Everyone in your sandbox is fictional, and nothing you do reaches anyone."
            : "A short video of each part of PsyAlliance. To try anything safely first, open your sandbox: a fully set-up fictional practice to learn on."
        }
        actions={
          IS_DEMO_SITE ? undefined : (
            // Opens (or reuses) this member's sandbox on the sandbox site.
            <a className="btn secondary" href="/dashboard/sandbox/open" data-reload="">
              Open your sandbox
            </a>
          )
        }
      />
      <div className="demo-list">
        {keys.map((k, n) => {
          const sc = findScript(k);
          const j = findJourney(k);
          const d = sc ? { title: sc.title, blurb: sc.blurb } : j;
          if (!d) return null;
          const length = sc ? lengthLabel(sc) : watchLength(j!);
          const go = WHERE[k];
          return (
            <section key={k} className="card demo-row">
              <span className="demo-n" aria-hidden="true">{n + 1}</span>
              <div className="demo-row-text">
                <div className="eyebrow">{length}</div>
                <h3>{d.title}</h3>
                <p className="small">{d.blurb}</p>
              </div>
              <div className="demo-row-actions">
                <WatchDemo href={`${TOUR_URL}/${k}`} what={d.title} label="Watch" />
                {go && (
                  <a className="text-arrow small" href={go.href}>
                    {go.label} &rarr;
                  </a>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="small" style={{ marginTop: 18 }}>
        Prefer the whole story? <a href={TOUR_URL} target="_blank" rel="noopener">Watch PsyAlliance in two minutes</a>.
      </p>
      {!IS_DEMO_SITE && (
        <form action={hideDemosAction} className="demos-hide">
          <button type="submit" className="btn ghost small-btn">I know my way around, hide Demos</button>
          <span className="micro-note">Removes Demos from the menu on this device. Bring it back any time in Settings.</span>
        </form>
      )}
    </>
  );
}
