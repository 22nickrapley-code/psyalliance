import "../../premium.css";
import { notFound } from "next/navigation";
import { IS_DEMO_SITE } from "@/lib/env";
import { PublicNav } from "../../_public/chrome";
import { enterSandboxAction } from "./actions";
import { AlexCard, CHAPTERS } from "../../tour/story";

export const metadata = { title: "Your sandbox", robots: { index: false, follow: false } };

// Landing for a personal sandbox link. Opening it is a deliberate click
// (link previewers and mail scanners only fetch the page), and each open
// starts the story again from the beginning.
export default async function SandboxPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!IS_DEMO_SITE) notFound();
  const { token } = await props.params;
  const { error } = await props.searchParams;
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 1040 }}>
            <div className="section-intro">
              <div className="eyebrow">Your personal sandbox</div>
              <h2>Step into Alex&rsquo;s practice.</h2>
              <p>
                A working copy of PsyAlliance with 1,200 fictional colleagues across New York, New Jersey, Massachusetts, Connecticut, Rhode Island and
                Vermont. Send a referral, answer a cover request, ask a question: colleagues reply within a minute or two. Nothing is emailed and
                nothing reaches the real network.
              </p>
            </div>
            {error && <div className="banner error" role="alert">{error}</div>}
            <div className="story-intro">
              <div>
                <AlexCard />
                <form action={enterSandboxAction} className="way primary" style={{ marginTop: 16 }}>
                  <input type="hidden" name="token" value={token} />
                  <h3>Ready when you are</h3>
                  <p>Your link is personal and expires. Opening it again starts the story from the beginning.</p>
                  <button type="submit" className="btn lg">Enter the sandbox &rarr;</button>
                </form>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>A good order to explore</div>
                <div className="chapter-list">
                  {[
                    ["Look around", "Open your profile, then Home: an urgent cover request, a referral ready to choose and three referrals waiting for you."],
                    ["Refer and consult", "Choose a colleague for your OCD referral, reply to one sent to you, and post a question to your trusted circle."],
                    ["Plan your leave", "Cover: add your six weeks of parental leave, describe each case by need and invite colleagues in order."],
                  ].map(([t, b], n) => (
                    <div key={t} className="chapter">
                      <div className="chapter-head"><span className="n">{n + 1}</span><h3>{t}</h3></div>
                      <p style={{ marginBottom: 0 }}>{b}</p>
                    </div>
                  ))}
                </div>
                <p className="small" style={{ marginTop: 16 }}>
                  Prefer to watch first? <a href="/tour">Take the guided tour</a>: {CHAPTERS.length} short chapters, no sign-in.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
