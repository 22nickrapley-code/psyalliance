import "../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { STEPS, QUICK_STEPS } from "./steps";
import { AlexCard, CHAPTERS } from "./story";

export const metadata = { title: "Guided tour", robots: { index: false, follow: false } };

// Start of the guided tour. No sign-in: one fictional story, told on the
// real screens, from the simplest screen to the biggest job.
export default function TourIntroPage() {
  if (!TOUR_ENABLED) notFound();
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 1080 }}>
            <div className="section-intro">
              <div className="eyebrow">Guided tour &middot; read-only &middot; fictional people</div>
              <h2>See six weeks of leave covered, in two minutes.</h2>
              <p>
                Alex, a psychologist in Brooklyn, needs six weeks away. Watch three cases described without identifiers, colleagues asked, and every
                case accepted. Then, if you like, the rest of the practice.
              </p>
            </div>
            <div className="story-intro">
              <div>
                <AlexCard />
                <div className="two-ways">
                  <div className="way primary">
                    <h3>The two-minute tour</h3>
                    <p>{QUICK_STEPS.length} screens: from &ldquo;I need six weeks away&rdquo; to every case covered.</p>
                    <a className="btn lg" href={`/tour/quick/${QUICK_STEPS[0].slug}`}>Start the two-minute tour &rarr;</a>
                  </div>
                  <div className="way">
                    <h3>The full tour</h3>
                    <p>{STEPS.length} short steps, about five minutes: the practice, a referral, a consultation, then cover.</p>
                    <a className="btn secondary" href={`/tour/${STEPS[0].slug}`}>Take the full tour</a>
                  </div>
                </div>
                <p className="small" style={{ marginTop: 14 }}>
                  Want to click everything yourself? <a href="/sandbox/request">Ask for a personal sandbox</a>.
                </p>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>The full tour, chapter by chapter</div>
                <div className="chapter-list">
                  {CHAPTERS.map((c, n) => (
                    <div key={c.key} className="chapter">
                      <div className="chapter-head">
                        <span className="n">{n + 1}</span>
                        <h3>{c.title}</h3>
                      </div>
                      <p>{c.blurb}</p>
                      <ol start={STEPS.findIndex((s) => s.chapter === c.key) + 1}>
                        {STEPS.filter((s) => s.chapter === c.key).map((s) => (
                          <li key={s.slug}><a href={`/tour/${s.slug}`}>{s.title}</a></li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="micro-note" style={{ marginTop: 22 }}>
              Everyone and everything in this tour is invented. No real clinicians, clients or outcomes are shown.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
