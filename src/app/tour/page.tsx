import "../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { STEPS } from "./steps";
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
              <div className="eyebrow">Guided tour &middot; {STEPS.length} short steps, about five minutes</div>
              <h2>Follow one practice through a busy month.</h2>
              <p>
                Alex is about to take six weeks of parental leave. Start with the simple screens, then refer a new enquiry, ask colleagues a question and
                plan cover case by case. You&rsquo;ll see one request from both sides.
              </p>
            </div>
            <div className="story-intro">
              <div>
                <AlexCard />
                <div className="two-ways">
                  <div className="way primary">
                    <h3>Guided tour</h3>
                    <p>Read-only. Step through the story at your own pace.</p>
                    <a className="btn lg" href={`/tour/${STEPS[0].slug}`}>Start the story &rarr;</a>
                  </div>
                  <div className="way">
                    <h3>Your own sandbox</h3>
                    <p>A personal copy of Alex&rsquo;s practice for a week. Colleagues reply to what you send.</p>
                    <a className="btn secondary" href="mailto:hello@psyalliance.org?subject=PsyAlliance%20sandbox">Ask for a sandbox</a>
                  </div>
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>What you&rsquo;ll do</div>
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
