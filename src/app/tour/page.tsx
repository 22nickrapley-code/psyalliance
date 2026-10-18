import "../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL, JOIN_HREF } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { StoryReel } from "./story-reel";
import { FOUNDING_LINE } from "@/lib/founding";

export const metadata = { title: "See PsyAlliance in two minutes", robots: { index: false, follow: false } };

// The public demo is one story of about two minutes, playing on its own on
// the real screens. The step-by-step demos, and a sandbox to try everything
// in, are for members: one story here, the detail once you've joined
// (Nick, 11 Oct: two layers of demos was too much, too soon).
export default async function DemoStoryPage(props: { searchParams: Promise<{ chapter?: string }> }) {
  if (!TOUR_ENABLED) notFound();
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(REAL_SITE_URL + "/tour");
  const { chapter } = await props.searchParams;
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section demo-hub">
          <div className="section-inner" style={{ maxWidth: 1120 }}>
            <a className="text-arrow back-home" href="/">
              &larr; Back to the homepage
            </a>
            <div className="demo-hub-head story-head">
              <div>
                <div className="eyebrow">PsyAlliance in two minutes &middot; fictional people</div>
                <h1>Your own practice, with a group behind you.</h1>
                <p className="lead">
                  Watch it work on the real screens: cover for time away, a referral out, referrals coming in, a question to colleagues, a template, and
                  joining in a minute. It plays on its own; pause or skip at any time.
                </p>
              </div>
            </div>
            <StoryReel
              tryHref={JOIN_HREF}
              chapter={chapter || null}
              end={{
                title: "That’s PsyAlliance.",
                text: "Next: create your account for longer demos and a fictional sandbox to learn in. Once your license is verified, you use it for real.",
                tryLabel: "Create your account",
                otherLabel: "Back to the homepage",
                otherHref: "/",
              }}
            />
            {/* What happens next, in order (Nick, 18 Oct). */}
            <section className="card demo-join">
              <div>
                <div className="eyebrow">How to get started</div>
                <h2>From first look to using it for real.</h2>
                <ol className="join-steps">
                  <li>
                    <b>You&rsquo;ve seen the homepage and these short demos.</b>
                  </li>
                  <li>
                    <b>Create your account.</b> Inside are longer demos of every part of PsyAlliance, and your own sandbox: a fictional practice with colleagues,
                    clients and requests to practice on. Nothing you do there reaches anyone.
                  </li>
                  <li>
                    <b>We verify your license.</b>
                  </li>
                  <li>
                    <b>Use PsyAlliance for real:</b> referrals, cover, consults and messages with verified colleagues.
                  </li>
                </ol>
                <p className="join-founding">{FOUNDING_LINE}</p>
              </div>
              <div className="demo-join-actions">
                <a className="btn lg" href={JOIN_HREF}>Create your account</a>
                <a className="btn secondary" href="/">Back to the homepage</a>
              </div>
            </section>
            <p className="micro-note" style={{ marginTop: 22 }}>
              Everyone in these demos and in the sandbox is invented. Their surnames were made up and checked so that none matches a licensed clinician.
              No real clinicians, clients or outcomes are shown.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
