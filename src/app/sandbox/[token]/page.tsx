import "../../premium.css";
import { notFound } from "next/navigation";
import { IS_DEMO_SITE } from "@/lib/env";
import { PublicNav } from "../../_public/chrome";
import { enterSandboxAction } from "./actions";

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
          <div className="section-inner" style={{ maxWidth: 640 }}>
            <div className="section-intro">
              <div className="eyebrow">Demo sandbox</div>
              <h2>Try PsyAlliance as Dr. Alex Rivers.</h2>
              <p>
                You&rsquo;ll step into a fictional psychologist&rsquo;s practice in Austin, among 120 fictional colleagues. Plan cover, refer, consult and message:
                colleagues reply within a minute or two. Everyone and everything here is invented. Nothing is emailed, and nothing reaches the real network.
              </p>
            </div>
            {error && <div className="banner error" role="alert">{error}</div>}
            <form action={enterSandboxAction} className="card">
              <input type="hidden" name="token" value={token} />
              <p className="small">Your link is personal and expires. Opening it again starts the story from the beginning.</p>
              <button type="submit" className="btn">Enter the sandbox</button>
            </form>
            <p className="small" style={{ marginTop: 16 }}>Prefer a quick look first? <a href="/tour">Take the three-minute guided tour</a>, no sign-in needed.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
