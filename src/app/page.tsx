import "./premium.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, REAL_SITE_URL, SITE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loadOpenStates, stateList } from "@/lib/open-states";
import { PublicNav, PublicFooter } from "./_public/chrome";
import { publicLibraryHref } from "@/lib/library";

// Public landing. Written for a busy clinician who gives it a few seconds:
// what it is and the benefit first, then the three moments it helps with,
// why it exists, why it's safe, the questions people ask first and one way
// in. Verification detail lives at /verification and the full rules at
// /privacy. Founding members never pay.

const FAQ: [string, string][] = [
  [
    "Who can join?",
    "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) licensed in the US. Anyone eligible can create an account; the network opens state by state, starting with New York and Massachusetts.",
  ],
  ["What does it cost?", "Nothing. Founding members never pay: membership stays free for as long as you remain a member. If a fee is ever introduced, it applies only to people who join after the founding period."],
  [
    "What's in the Practice Library?",
    "Twenty templates for independent practice, from a professional will to a reciprocal cover agreement. Members get all of them, placed beside the work they support. Each becomes a free download for everyone once it has been independently reviewed.",
  ],
  [
    "Do client details go into PsyAlliance?",
    "No. Requests describe needs (\"adult, anxiety, telehealth, Aetna\"). PsyAlliance flags dates, phone numbers, emails, addresses and record numbers before anything is sent. It can't reliably catch names, so leaving those out is up to you.",
  ],
  [
    "Will I get a flood of notifications?",
    "No. You hear about what needs you: a cover request, a referral that fits, a reply. Nothing else interrupts you.",
  ],
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "PsyAlliance",
  url: SITE_URL,
  description:
    "A private, verified network for doctoral-level psychologists and psychiatrists in private practice: cover when you're away, referrals to the right colleague and peer consultation.",
  audience: { "@type": "Audience", audienceType: "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO)" },
  areaServed: "US",
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

const DEMO = (path = "") => `/tour${path}`;

const MOMENTS: [string, string, string][] = [
  [
    "Cover",
    "You’re away.",
    "Leave, illness, an emergency. Get each client covered by a colleague licensed in the right state, suited to the client and actually free, without the phone calls and favors.",
  ],
  [
    "Refer",
    "You’re full.",
    "Send an inquiry you can’t take to the right colleague, matched by license, focus and insurance, not whoever you happen to remember.",
  ],
  [
    "Consult",
    "You’re unsure.",
    "Ask colleagues you trust a focused question between consultations, instead of strangers on a listserv.",
  ],
];

const LIBRARY_PICKS: [string, string, string][] = [ // [PA number, title, line]
  ["PA-03", "Professional Will & Practice Succession Plan", "Who looks after your clients and records if you can’t."],
  ["PA-02", "Extended Leave Pack", "Step away for more than two weeks without stranding clients."],
  ["PA-01", "Reciprocal Coverage Agreement", "A standing cover arrangement with a colleague you trust."],
];

const TRUST: [string, string][] = [
  [
    "Doctoral-level only.",
    "Psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). A person checks each license against the state board before you’re listed.",
  ],
  ["Needs, not names.", "Clients are described by need. The clinical handoff happens through your own secure channel."],
  [
    "Your data stays yours.",
    "It is never sold or used for advertising, and nothing is sent until you’ve seen who will receive it.",
  ],
];

export default async function HomePage() {
  // The demo site opens on the demo library.
  if (IS_DEMO_SITE) redirect(REAL_SITE_URL);
  const open = stateList(await loadOpenStates(await createClient()));
  return (
    <div className="pa">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }} />
      <PublicNav home />

      <main>
        <section className="public-hero home-hero">
          <div>
            <div className="eyebrow">For doctoral psychologists and psychiatrists in private practice</div>
            <h1>
              Your own practice, <em>with a group behind you.</em>
            </h1>
            <p className="lead">
              PsyAlliance gives independent psychologists and psychiatrists the best of group practice: colleagues who cover your clients when you&rsquo;re away,
              take the referrals you can&rsquo;t, and talk a hard decision through with you. Every member is verified.
            </p>
            <div className="hero-actions">
              <a className="btn lg" href="/auth/sign-up">Create your account</a>
              <a className="btn secondary lg" href={DEMO()}>See it in 90 seconds &rarr;</a>
            </div>
            <p className="hero-free">Founding members never pay.</p>
            <ul className="hero-trust" aria-label="Who it's for">
              <li>Doctoral-level only</li>
              <li>Every license checked by a person</li>
              <li>Co-founded by a licensed psychologist</li>
            </ul>
          </div>
          <div className="hero-visual" aria-label="Example cover plan">
            <div className="visual-top">
              <span>Inside PsyAlliance</span>
              <span>Example</span>
            </div>
            <div className="visual-card">
              <div className="eyebrow">Cover plan &middot; Six weeks&rsquo; parental leave</div>
              <h3>3 of 3 clients covered.</h3>
              <p>Each client described by need, never by name.</p>
            </div>
            <div className="visual-card visual-match">
              <div className="row between wrap" style={{ gap: 8 }}>
                <b>Client 1 &middot; Trauma/PTSD</b>
                <span className="status">Covered</span>
              </div>
              <div className="visual-person">
                <span className="avatar" aria-hidden="true">MC</span>
                <span><b>Maya Chen, PsyD</b><small>Trusted colleague &middot; Brooklyn</small></span>
              </div>
              <ul className="reasons">
                <li>Trauma specialist, NY license reviewed</li>
              </ul>
            </div>
            <div className="visual-card visual-list">
              <div className="line">
                <b>Client 2 &middot; Teen anxiety</b>
                <span className="who">Maya Chen, PsyD</span>
                <span className="status">Covered</span>
              </div>
              <div className="line">
                <b>Client 3 &middot; Needs prescribing</b>
                <span className="who">Eli Ramirez, MD</span>
                <span className="status">Covered</span>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section tint" id="how">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">How it works</div>
              <h2>Three moments every independent clinician knows.</h2>
            </div>
            <div className="three-grid problems">
              {MOMENTS.map(([k, t, b]) => (
                <article key={k} className="editorial-card">
                  <div className="n">{k}</div>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </article>
              ))}
            </div>
            <p className="section-more">
              <a className="text-arrow" href={DEMO()}>See how each one works &rarr;</a>
            </p>
          </div>
        </section>

        <section className="public-section home-library" id="library">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Practice Library</div>
              <h2>Templates for the hard moments of independent practice.</h2>
            </div>
            <div className="lib-grid">
              {LIBRARY_PICKS.map(([code, title, line]) => (
                <article key={code} className="lib-card">
                  <div className="lib-code">Coverage &amp; continuity</div>
                  <h3><a href={publicLibraryHref(code)}>{title}</a></h3>
                  <p>{line}</p>
                </article>
              ))}
            </div>
            <p className="section-more">
              <a className="text-arrow" href="/library">Browse all 20 templates &rarr;</a>
            </p>
          </div>
        </section>

        <section className="public-section tint" id="why">
          <div className="section-inner founder">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/rena-pazienza.jpg" alt="Rena Pazienza, PhD" />
            <div>
              <div className="eyebrow">Why we built it</div>
              <h2 className="founder-line">A directory helps patients find you. PsyAlliance helps clinicians find each other.</h2>
              <p>
                Going on maternity leave, Rena Pazienza, PhD, needed her clients covered by someone qualified, and there was no good way to find them. So she
                co-founded PsyAlliance with Nick Rapley to build the professional circle she wished she&rsquo;d had.
              </p>
            </div>
          </div>
        </section>

        <section className="public-section" id="verification">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Trust</div>
              <h2>Verified by a person. Private by design.</h2>
            </div>
            <div className="steps-grid">
              {TRUST.map(([t, b]) => (
                <div key={t} className="step">
                  <b>{t}</b>
                  <p>{b}</p>
                </div>
              ))}
            </div>
            <p className="section-more">
              <a className="text-arrow" href="/verification">How verification works &rarr;</a>
              <a className="text-arrow" href="/privacy">Our privacy rules &rarr;</a>
            </p>
          </div>
        </section>

        <section className="public-section tint" id="faq">
          <div className="section-inner" style={{ maxWidth: 780 }}>
            <div className="section-intro">
              <div className="eyebrow">Questions</div>
              <h2>What clinicians ask first.</h2>
            </div>
            <div className="faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section">
          <div className="section-inner pa-cta">
            <div>
              <div className="eyebrow" style={{ color: "#e2c49c" }}>Founding members</div>
              <h2>Join the founding cohort.</h2>
              <p>Founding members never pay. Open now in {open || "the Northeast"}; other states open as colleagues join.</p>
            </div>
            <a className="btn" href="/auth/sign-up">Create your account &rarr;</a>
          </div>
        </section>
      </main>
      <PublicFooter home />
    </div>
  );
}
