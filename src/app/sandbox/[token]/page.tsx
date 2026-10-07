import "../../premium.css";
import { notFound } from "next/navigation";
import { IS_DEMO_SITE } from "@/lib/env";
import { PublicNav } from "../../_public/chrome";
import { enterSandboxAction } from "./actions";
import { AlexCard } from "../../tour/story";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your sandbox", robots: { index: false, follow: false } };

// Landing for a personal sandbox link. Opening it is a deliberate click
// (link previewers and mail scanners only fetch the page), and each open
// starts the story again from the beginning.
export default async function SandboxPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!IS_DEMO_SITE) notFound();
  const { token } = await props.params;
  const { error } = await props.searchParams;
  // Say on arrival whether the link still works, rather than after a click.
  const supabase = await createClient();
  const { data: status } = await supabase.rpc("sandbox_pass_status", { p_token: token }).maybeSingle<{ state: string; expires_at: string | null }>();
  const state = status?.state || "unknown";
  const usable = state === "ok";
  const until = status?.expires_at
    ? new Date(status.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })
    : null;
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
                A working copy of PsyAlliance with 1,200 fictional colleagues across six Northeast states. It starts quiet; about a minute after you
                arrive, colleagues start getting in touch. Nothing is emailed and nothing reaches the real network.
              </p>
            </div>
            {error && <div className="banner error" role="alert">{error}</div>}
            <div className="story-intro">
              <div>
{usable ? (
                <form action={enterSandboxAction} className="way primary">
                  <input type="hidden" name="token" value={token} />
                  <h3>Ready when you are</h3>
                  <p>Your link is personal{until ? ` and works until ${until}` : ""}. Open it again on any device to carry on where you left off; &ldquo;Start the story again&rdquo; inside resets everything.</p>
                  <button type="submit" className="btn lg">Enter the sandbox &rarr;</button>
                </form>
                ) : (
                  <div className="way">
                    <h3>{state === "expired" ? "This sandbox link has expired." : state === "revoked" ? "This sandbox link has been closed." : "We don't recognize this sandbox link."}</h3>
                    <p>Sandbox links are personal and last 7 days. Ask for a new one and we&rsquo;ll be in touch personally, usually within a working day.</p>
                    <div className="row wrap" style={{ gap: 10 }}>
                      <a className="btn lg" href="/sandbox/request">Ask for a new sandbox &rarr;</a>
                      <a className="btn secondary" href="/tour">Watch the demos</a>
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 16 }}>
                  <AlexCard eyebrow="In your sandbox you’re" />
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>A good order to explore</div>
                <div className="chapter-list">
                  {[
                    ["Look around", "Home starts quiet. Open your profile and the network; about a minute in, colleagues start getting in touch, one at a time."],
                    ["Answer what arrives", "A message from Maya, a cover request for two clients, a referral from Eli, and invitations to a trusted circle and a consultation group."],
                    ["Plan your leave", "Cover: add your six weeks of parental leave, describe each client by need and invite colleagues in order."],
                  ].map(([t, b], n) => (
                    <div key={t} className="chapter">
                      <div className="chapter-head"><span className="n">{n + 1}</span><h3>{t}</h3></div>
                      <p style={{ marginBottom: 0 }}>{b}</p>
                    </div>
                  ))}
                </div>
                <p className="small" style={{ marginTop: 16 }}>
                  Prefer to watch first? <a href="/tour">See the demos</a>: five short ones, a minute or two each.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
