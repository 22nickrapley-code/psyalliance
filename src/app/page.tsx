import "./premium.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, DEMO_URL, SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "./_public/chrome";

// Public landing. Written for a busy clinician who gives it a few seconds:
// what it is and the benefit first, then the three moments it helps with,
// why it exists, why it's safe, the questions people ask first and one way
// in. Verification detail lives at /verification and the full rules at
// /privacy. Founding members join free.

const FAQ: [string, string][] = [
  [
    "Who can join?",
    "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) licensed in the US. We open a few states at a time, starting in the Northeast.",
  ],
  ["What does it cost?", "Nothing. PsyAlliance is free for founding members."],
  [
    "Do client details go into PsyAlliance?",
    "No. Requests describe needs (\"adult, anxiety, telehealth, Aetna\"). PsyAlliance flags dates, phone numbers, emails, addresses and record numbers before anything is sent. It can't reliably catch names, so leaving those out is up to you.",
  ],
  [
    "Will I get a flood of notifications?",
    "No. You hear about what needs you: a cover request, a referral that fits, a reply. Everything else waits for a weekly digest.",
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

const DEMO = (path = "") => (DEMO_URL ? `${DEMO_URL}/tour${path}` : `/tour${path}`);

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

export default function HomePage() {
  // The demo site opens on the demo library.
  if (IS_DEMO_SITE) redirect("/tour");
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
              Independent practice works, until you need <em>a colleague.</em>
            </h1>
            <p className="lead">
              PsyAlliance is a private network of verified psychologists and psychiatrists. Get your clients covered when you&rsquo;re away, refer the ones
              you can&rsquo;t take, and talk a hard decision through with peers you trust.
            </p>
            <div className="hero-actions">
              <a className="btn lg" href="/join">Request an invitation</a>
              <a className="btn secondary lg" href={DEMO("/cover")}>Watch the 2-minute demo &rarr;</a>
            </div>
            <p className="hero-free">Free for founding members.</p>
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
              <a className="text-arrow" href={DEMO()}>See each one in a short demo &rarr;</a>
            </p>
          </div>
        </section>

        <section className="public-section" id="why">
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

        <section className="public-section tint" id="verification">
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

        <section className="public-section" id="faq">
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
              <p>Free for founding members. Opening state by state, starting in the Northeast.</p>
            </div>
            <a className="btn" href="/join">Request an invitation &rarr;</a>
          </div>
        </section>
      </main>
      <PublicFooter home />
    </div>
  );
}
