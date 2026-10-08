import "../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { DEMOS } from "./demos";
import { AlexCard } from "./story";
import { DemoGrid } from "./demo-progress";
import { NextMoves } from "./next-moves";

export const metadata = { title: "Demos", robots: { index: false, follow: false } };

// The demo library: one short demo per job PsyAlliance does, in any order.
// Step two of a visitor's journey: home page, then demos, then a sandbox
// or a request to join.
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
                <div className="eyebrow">Demos &middot; read-only &middot; fictional people</div>
                <h1>See PsyAlliance in action.</h1>
                <p className="lead">
                  Six short demos: the three workflows (cover, referrals and consultation), your day and your network, joining and verification, and the
                  Practice Library. Each takes a minute or two on the real screens, with a fictional practice. Watch them in any order; we suggest starting with cover.
                </p>
              </div>
              <AlexCard compact />
            </div>
            <DemoGrid demos={DEMOS.map(({ key, title, blurb, minutes, steps }) => ({ key, title, blurb, minutes, screens: steps.length }))} />
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
