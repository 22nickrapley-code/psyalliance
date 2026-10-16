import { IS_DEMO_SITE, TOUR_URL } from "@/lib/env";
import { CLOSER_LOOKS, MORE_DETAIL, findDemo } from "../../tour/demos";
import { watchLength } from "../../tour/story-reel";
import { PageHead } from "../_components/ui";
import { WatchDemo } from "../_components/watch-demo";
import { hideDemosAction } from "./actions";

export const metadata = { title: "Demos" };

// Demos for members: a short step-by-step video of each part of
// PsyAlliance. The public site shows only the two-minute story; the detail
// lives here, once someone has an account (Nick, 11 Oct).
const WHERE: Record<string, { href: string; label: string }> = {
  cover: { href: "/dashboard/cover", label: "Go to Cover" },
  refer: { href: "/dashboard/refer", label: "Go to Refer" },
  consult: { href: "/dashboard/consult", label: "Go to Consult" },
  profile: { href: "/dashboard/profile", label: "Go to your profile" },
  circle: { href: "/dashboard/network", label: "Go to Network" },
  verified: { href: "/dashboard/credentials", label: "Go to Credentials" },
  library: { href: "/dashboard/documents", label: "Go to the Practice Library" },
};

export default function DemosPage() {
  const keys = [...CLOSER_LOOKS, ...MORE_DETAIL];
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
          const d = findDemo(k);
          if (!d) return null;
          const go = WHERE[k];
          return (
            <section key={k} className="card demo-row">
              <span className="demo-n" aria-hidden="true">{n + 1}</span>
              <div className="demo-row-text">
                <div className="eyebrow">{watchLength(d)}</div>
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
