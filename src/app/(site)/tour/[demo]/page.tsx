import "../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { JOURNEYS, CLOSER_LOOKS, MORE_DETAIL, findJourney, LEGACY_SLUGS } from "@/tour/journeys";
import { SectionReel, watchLength } from "../story-reel";
import { Director } from "../director";
import { DEMO_SCRIPTS, findScript } from "@/tour/demo-scripts";
import { lengthLabel } from "@/tour/scripts";
import { DemoGrid } from "../demo-progress";

export const metadata = { title: "Demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  const keys = new Set([...JOURNEYS.map((d) => d.key), ...Object.keys(DEMO_SCRIPTS)]);
  keys.delete("overview");
  return [...keys].map((demo) => ({ demo }));
}

// One job, as a short video on the real screens, then the same screens to
// click through yourself. Links to the old single tour (/tour/plan,
// /tour/quick, /tour/done) land somewhere useful.
export default async function DemoWatch({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}`);
  if (demo === "overview") redirect("/tour");
  const j = findJourney(demo);
  const sc = findScript(demo);
  if (!j && !sc) {
    const legacy = LEGACY_SLUGS[demo];
    redirect(legacy ? `/tour/${legacy}` : "/tour");
  }
  const d = { key: demo, title: sc?.title || j!.title, blurb: sc?.blurb || j!.blurb, steps: j?.steps || [], first: j ? `/tour/${j.key}/${j.steps[0].slug}` : sc!.tryHref };
  const first = d.first;
  const others = JOURNEYS.filter((x) => [...CLOSER_LOOKS, ...MORE_DETAIL].includes(x.key) && x.key !== d.key);
  const length = sc ? lengthLabel(sc) : watchLength(j!);
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section demo-hub">
          <div className="section-inner" style={{ maxWidth: 1120 }}>
            <a className="text-arrow" href="/tour">&larr; All demos</a>
            <div className="demo-hub-head story-head" style={{ marginTop: 14 }}>
              <div>
                <div className="eyebrow">{length} &middot; fictional people</div>
                <h1>{d.title}</h1>
                <p className="lead">{d.blurb} It plays on its own; pause or skip at any time.</p>
              </div>
            </div>
            {sc ? <Director script={sc} tryHref={first} /> : <SectionReel demo={j!} tryHref={first} />}
            <section className="try-panel" id="try">
              <div>
                <h2 className="serif-title">Try it yourself</h2>
                <p className="small">Click through the same screens at your own pace. Nothing is sent and nobody is contacted.</p>
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
