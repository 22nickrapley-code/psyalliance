import "../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { DEMOS, CLOSER_LOOKS, MORE_DETAIL, findDemo } from "./demos";
import { StoryReel, watchLength } from "./story-reel";
import { DemoGrid } from "./demo-progress";
import { NextMoves } from "./next-moves";

export const metadata = { title: "Demos", robots: { index: false, follow: false } };

// Demos: the 90-second story first, playing on its own on the real
// screens, then hands-on demos to try (cover, referrals, consultation).
// The rest is supporting detail, linked quietly.
export default function DemoLibraryPage() {
  if (!TOUR_ENABLED) notFound();
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(REAL_SITE_URL + "/tour");
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section demo-hub">
          <div className="section-inner" style={{ maxWidth: 1120 }}>
            <div className="demo-hub-head story-head">
              <div>
                <div className="eyebrow">PsyAlliance in 90 seconds &middot; fictional people</div>
                <h1>Your own practice, with a group behind you.</h1>
                <p className="lead">
                  Watch it work on the real screens: cover for time away, a referral out, referrals coming in, a template and a question to colleagues. It plays on
                  its own; pause or skip at any time.
                </p>
              </div>
            </div>
            <StoryReel tryHref="#try" />
            <h2 className="serif-title demo-next-title" id="try">Try it yourself</h2>
            <p className="small" style={{ marginTop: -6 }}>
              Pick one job. Each plays as a short video first, then you click through it yourself on the same screens. Prefer the whole story at your own
              pace? <a href={`/tour/overview/${findDemo("overview")!.steps[0].slug}`}>Step through it</a>.
            </p>
            <DemoGrid demos={DEMOS.filter((d) => CLOSER_LOOKS.includes(d.key)).map((d) => ({ key: d.key, title: d.title, blurb: d.blurb, minutes: watchLength(d), screens: d.steps.length }))} />
            <p className="demo-more small">
              More detail:{" "}
              {MORE_DETAIL.map((k, i) => {
                const d = findDemo(k)!;
                return (
                  <span key={k}>
                    {i > 0 && " · "}
                    <a href={`/tour/${k}`}>{d.title}</a>
                  </span>
                );
              })}
            </p>
            <h2 className="serif-title demo-next-title">When you&rsquo;re ready</h2>
            <NextMoves />
            <p className="micro-note" style={{ marginTop: 22 }}>
              Everyone and everything in these demos is invented. No real clinicians, clients or outcomes are shown.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
