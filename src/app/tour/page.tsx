import "../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { DEMOS, CLOSER_LOOKS, MORE_DETAIL, findDemo } from "./demos";
import { AlexCard } from "./story";
import { DemoGrid } from "./demo-progress";
import { NextMoves } from "./next-moves";

export const metadata = { title: "Demos", robots: { index: false, follow: false } };

// Demos: one 90-second interactive preview first, then three optional
// closer looks (cover, referrals, consultation). The rest is supporting
// detail, linked quietly.
export default function DemoLibraryPage() {
  if (!TOUR_ENABLED) notFound();
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(REAL_SITE_URL + "/tour");
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section demo-hub">
          <div className="section-inner" style={{ maxWidth: 1120 }}>
            <div className="demo-hub-head">
              <div>
                <div className="eyebrow">Interactive preview &middot; fictional people</div>
                <h1>See PsyAlliance in 90 seconds.</h1>
                <p className="lead">
                  One story on the real screens: Alex needs six weeks away, and colleagues cover every client. Each step explains what you&rsquo;re looking at
                  before you see it.
                </p>
                <a className="btn lg" href="/tour/overview">Start the preview &rarr;</a>
              </div>
              <AlexCard compact />
            </div>
            <h2 className="serif-title demo-next-title">Want a closer look?</h2>
            <p className="small" style={{ marginTop: -6 }}>Optional. Each follows one job from start to finish.</p>
            <DemoGrid demos={DEMOS.filter((d) => CLOSER_LOOKS.includes(d.key)).map(({ key, title, blurb, minutes, steps }) => ({ key, title, blurb, minutes, screens: steps.length }))} />
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
