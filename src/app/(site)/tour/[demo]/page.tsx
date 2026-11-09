import "../../premium.css";
import "../../start/start.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL, JOIN_HREF } from "@/lib/env";
import { OtherNeeds, DEMO_NEED } from "../../start/needs";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { JOURNEYS, findJourney, LEGACY_SLUGS } from "@/tour/journeys";
import { SectionReel, watchLength } from "../story-reel";
import { Director } from "../director";
import { DEMO_SCRIPTS, findScript } from "@/tour/demo-scripts";
import { lengthLabel } from "@/tour/scripts";

export const metadata = { title: "Demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  const keys = new Set([...JOURNEYS.map((d) => d.key), ...Object.keys(DEMO_SCRIPTS)]);
  keys.delete("overview");
  return [...keys].map((demo) => ({ demo }));
}

// One job, as a short video on the real screens, then the same screens to
// click through yourself. Links to the old single tour (/tour/plan,
// /tour/quick, /tour/done) land somewhere useful.
export default async function DemoWatch({ params, searchParams }: { params: Promise<{ demo: string }>; searchParams: Promise<{ ctx?: string; pick?: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  const { ctx, pick } = await searchParams;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}`);
  if (demo === "overview") redirect("/tour");
  const j = findJourney(demo);
  const sc = findScript(demo);
  if (!j && !sc) {
    const legacy = LEGACY_SLUGS[demo];
    redirect(legacy ? `/tour/${legacy}` : "/tour");
  }
  const d = { key: demo, title: sc?.title || j!.title, blurb: sc?.blurb || j!.blurb };
  const length = sc ? lengthLabel(sc) : watchLength(j!);
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section demo-hub">
          <div className="section-inner" style={{ maxWidth: 1120 }}>
            <a className="btn secondary small-btn demo-home" href="/" data-return-home>&larr; Return to homepage</a>
            <div className="demo-hub-head story-head" style={{ marginTop: 18 }}>
              <div>
                <div className="eyebrow">{length} &middot; fictional people</div>
                <h1>{d.title}</h1>
                <p className="lead">{d.blurb} It plays on its own; pause, or step through it yourself.</p>
              </div>
            </div>
            {(() => {
              // Public demos are to watch. Trying things yourself is for members, in the sandbox (Nick, 1 Nov).
              const end = { title: sc?.outcome || j?.outcome || d.title, text: "Create your account to use it for real. A person checks every license before anyone is listed.", tryLabel: "Create your account" };
              // A demo chosen deliberately ("Watch another" or the choice page) carries its goal to sign-up; a demo opened
              // directly leaves any goal already chosen alone (R08).
              const goalNeed = pick === "1" ? DEMO_NEED(d.key) : null;
              const tryHref = goalNeed ? `${JOIN_HREF}${JOIN_HREF.includes("?") ? "&" : "?"}goal=${goalNeed}${ctx ? `&ctx=${encodeURIComponent(ctx)}` : ""}` : JOIN_HREF;
              return sc ? <Director script={sc} tryHref={tryHref} end={end} /> : <SectionReel demo={j!} tryHref={tryHref} end={end} />;
            })()}
            <h2 className="serif-title demo-next-title">Watch another</h2>
            <OtherNeeds current={DEMO_NEED(d.key)} ctx={ctx} demo={d.key} />
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
