import "../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { DEMOS, CLOSER_LOOKS, MORE_DETAIL, findDemo, LEGACY } from "../demos";
import { SectionReel, watchLength } from "../story-reel";
import { DemoGrid } from "../demo-progress";

export const metadata = { title: "Demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return DEMOS.filter((d) => d.key !== "overview").map((d) => ({ demo: d.key }));
}

// One job, as a short video on the real screens, then the same screens to
// click through yourself. Links to the old single tour (/tour/plan,
// /tour/quick, /tour/done) land somewhere useful.
export default async function DemoWatch({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}`);
  if (demo === "overview") redirect("/tour");
  const d = findDemo(demo);
  if (!d) {
    const legacy = LEGACY[demo];
    redirect(legacy ? `/tour/${legacy}` : "/tour");
  }
  const first = `/tour/${d.key}/${d.steps[0].slug}`;
  const others = DEMOS.filter((x) => [...CLOSER_LOOKS, ...MORE_DETAIL].includes(x.key) && x.key !== d.key);
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section demo-hub">
          <div className="section-inner" style={{ maxWidth: 1120 }}>
            <a className="text-arrow" href="/tour">&larr; All demos</a>
            <div className="demo-hub-head story-head" style={{ marginTop: 14 }}>
              <div>
                <div className="eyebrow">{watchLength(d)} &middot; fictional people</div>
                <h1>{d.title}</h1>
                <p className="lead">{d.blurb} It plays on its own; pause or skip at any time.</p>
              </div>
            </div>
            <SectionReel demo={d} tryHref={first} />
            <section className="try-panel" id="try">
              <div>
                <h2 className="serif-title">Try it yourself</h2>
                <p className="small">Click through the same {d.steps.length} screens at your own pace. Nothing is sent and nobody is contacted.</p>
              </div>
              <a className="btn" href={first}>Try it yourself &rarr;</a>
            </section>
            <h2 className="serif-title demo-next-title">Watch another</h2>
            <DemoGrid demos={others.map((x) => ({ key: x.key, title: x.title, blurb: x.blurb, minutes: watchLength(x), screens: x.steps.length }))} />
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
