import "../../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../../../_public/chrome";
import { DEMOS, findDemo } from "../../demos";
import { NextMoves } from "../../next-moves";
import { DemoGrid, MarkDone } from "../../demo-progress";

export const metadata = { title: "Demo complete", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return DEMOS.map((d) => ({ demo: d.key }));
}

// The end of one demo: what it showed, then "what would you like to see
// next?" with the demos not yet watched first, then the two ways forward.
export default async function DemoDonePage({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  const d = findDemo(demo);
  if (!d) redirect("/tour");
  return (
    <div className="pa">
      <PublicNav />
      <MarkDone demo={d.key} />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 1040 }}>
            <div className="demo-done-head">
              <div className="eyebrow">Demo complete &middot; {d.title}</div>
              <h1>{d.outcome}</h1>
              <ul className="learned">
                {d.learned.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
            <h2 className="serif-title demo-next-title">What would you like to see next?</h2>
            <DemoGrid demos={DEMOS.map(({ key, title, blurb, minutes, steps }) => ({ key, title, blurb, minutes, screens: steps.length }))} current={d.key} />
            <h2 className="serif-title demo-next-title">Or take the next step</h2>
            <NextMoves />
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
