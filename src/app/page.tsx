import "./premium.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, DEMO_URL, SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "./_public/chrome";

// Public landing (Product Spec v1, built from the premium concept Nick
// chose). Sections: hero with an illustrative cover plan, the three
// requests that matter, how verification works, the founder story, the
// trust rules, FAQ, and a founding-cohort call to action. No pricing is
// shown until it's decided.

const FAQ: [string, string][] = [
  [
    "Who can join?",
    "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) in the US. It isn't open to the public or to master's-level clinicians.",
  ],
  [
    "How is this different from Psychology Today?",
    "A directory helps patients find you. PsyAlliance helps clinicians find each other: someone to cover you while you're away, the right colleague for a referral, and peers to think a difficult decision through with.",
  ],
  [
    "What does verified mean?",
    "An admin has reviewed your professional identity, your doctoral degree and at least one in-date licence, checked against the state board. You're listed and matched only in states where a reviewed licence is on file.",
  ],
  [
    "Do client details go into PsyAlliance?",
    "They shouldn't. Cover plans and referrals describe needs, not people (\"Client 3: adult, anxiety, telehealth, Aetna\"). Before anything is sent, PsyAlliance flags dates, phone numbers, email and street addresses and record numbers. It can't reliably recognise names, so leaving those out is up to you. If something identifying is shared by mistake, report it and an admin removes it. The clinical handoff happens outside PsyAlliance once a colleague agrees.",
  ],
  [
    "How do I get cover while I'm on leave?",
    "Start a cover plan: add each client who needs cover, described without identifiers, and PsyAlliance suggests colleagues with the right licence, specialty and recently confirmed availability, trusted colleagues first. Each suggestion says why it fits, and you choose who is asked and in what order.",
  ],
  [
    "Will I get a flood of notifications?",
    "No. You hear about things that need you: a cover request, a referral that fits your practice, a reply. Everything else waits for a weekly digest, and you control every email in Settings.",
  ],
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "PsyAlliance",
  url: SITE_URL,
  description:
    "A private, credential-reviewed network for doctoral-level psychologists and psychiatrists in independent practice: cover for time away, referrals to the right colleague and peer consultation.",
  audience: { "@type": "Audience", audienceType: "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO)" },
  areaServed: "US",
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

const DEMO = (path = "") => (DEMO_URL ? `${DEMO_URL}/tour${path}` : `/tour${path}`);
const SANDBOX = DEMO_URL ? `${DEMO_URL}/sandbox/request` : "/sandbox/request";

const PROBLEMS: [string, string, string][] = [
  ["When you're away", "Leave, illness or an emergency.", "Cover gets arranged through phone calls, group chats and favours, and it's hard to tell who is licensed in the right state, suited to each client and actually free."],
  ["When you're full", "An enquiry you can't take.", "Directories are built for patients searching for a therapist, not for a clinician looking for the right colleague. So referrals go to whoever you happen to remember."],
  ["When you're unsure", "A decision between consultations.", "Asking a listserv means asking strangers in public. Waiting for your next consultation group means deciding alone in the meantime."],
];

const DOES: { n: string; title: string; body: string; demo: string; demoLabel: string }[] = [
  {
    n: "01 / Cover",
    title: "Get your clients covered",
    body: "A week off, parental leave, an emergency or closing a practice. Describe each client by need, never by name. PsyAlliance suggests colleagues who fit and says why; you choose who's asked and track every client until someone accepts.",
    demo: "/cover",
    demoLabel: "Watch the cover demo · 2 min",
  },
  {
    n: "02 / Refer",
    title: "Refer to the right colleague",
    body: "Describe what the client needs. Get a shortlist ranked by your relationships, licence, focus, insurance and current availability, with the reasons shown. Send it to the people you choose, then pick from their replies.",
    demo: "/refer",
    demoLabel: "Watch the referral demo · 2 min",
  },
  {
    n: "03 / Consult",
    title: "Think it through with peers",
    body: "Ask one focused question of a colleague, your trusted circle or the wider verified network, and keep the answers that helped. Or run a closed consultation group with a written charter.",
    demo: "/consult",
    demoLabel: "Watch the consultation demo · 1 min",
  },
];

const COMPARE: [string, string, string, string][] = [
  ["Who's in it", "Built for the public to find a therapist", "Membership varies by group", "Doctoral psychologists and psychiatrists, each licence reviewed by a person"],
  ["Finding the right colleague", "Search designed for patients", "Depends on who sees the post", "Matched by licence, focus, setting and confirmed availability, with the reasons shown"],
  ["Client privacy", "Not designed for handoffs between clinicians", "Free text in a shared thread", "Requests built around needs, with checks for obvious identifiers"],
  ["Follow-through", "Outside what a directory does", "Replies can be hard to keep track of", "Each request shows who was asked, who replied and what's covered"],
  ["Who you rely on", "Whoever is listed", "Whoever responds", "Your trusted colleagues first, then the verified network"],
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
            <div className="eyebrow">For psychologists and psychiatrists in independent practice</div>
            <h1>
              Cover, referrals and advice from colleagues <em>you trust.</em>
            </h1>
            <p className="lead">
              PsyAlliance is a private network of verified psychologists and psychiatrists. Find someone to cover your clients when you&rsquo;re away,
              refer a client to the right colleague, and think a decision through with peers. Requests describe needs, not people; PsyAlliance checks for obvious identifiers, and the clinical handoff happens through your own secure channel.
            </p>
            <div className="hero-actions">
              <a className="btn lg" href={DEMO("/cover")}>Watch the 2-minute cover demo &rarr;</a>
              <a className="btn secondary lg" href="/join">Request an invitation</a>
            </div>
            <div className="hero-proof">
              <span className="seal" aria-hidden="true">ψ</span>
              <span>
                <b>Every member&rsquo;s licence is checked by a person</b>
                Doctoral psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) only.
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Illustrative cover plan">
            <div className="visual-top">
              <span>Inside PsyAlliance</span>
              <span>Illustrative</span>
            </div>
            <div className="visual-card">
              <div className="eyebrow">Cover plan &middot; Parental leave, six weeks</div>
              <h3>Three clients, covered one by one.</h3>
              <p>Extended leave &middot; New York &middot; 3 clients described by need</p>
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
                <li>Trauma/PTSD is her top specialty</li>
                <li>NY licence reviewed</li>
                <li>Open to cover, confirmed 3 days ago</li>
              </ul>
            </div>
            <div className="visual-card row between">
              <div>
                <b style={{ fontSize: 13.5 }}>Client 2 covered &middot; Client 3 awaiting reply</b>
                <div className="micro-note">Eli Ramirez, MD was asked first for the client who needs prescribing</div>
              </div>
              <span className="status warn">1 open</span>
            </div>
            <p className="micro-note" style={{ color: "#c6dbd2", margin: 0 }}>
              Example only. Clients are described by need, never by name.
            </p>
          </div>
        </section>

        <section className="public-section tint" id="why">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Why PsyAlliance</div>
              <h2>Independent practice works, until you need a colleague.</h2>
              <p>Three moments every clinician in private practice knows, and how they&rsquo;re handled today.</p>
            </div>
            <div className="three-grid problems">
              {PROBLEMS.map(([k, t, b]) => (
                <article key={k} className="editorial-card">
                  <div className="n">{k}</div>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </article>
              ))}
            </div>
            <div className="founder" id="story" style={{ marginTop: 56 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/team/rena-pazienza.jpg" alt="Rena Pazienza, PhD" />
              <div>
                <div className="eyebrow">Why we built it</div>
                <p className="quote" style={{ margin: "10px 0 18px" }}>&ldquo;Independent clinicians deserve a dependable professional circle.&rdquo;</p>
                <p>
                  PsyAlliance began with a problem Rena Pazienza, PhD, a licensed psychologist, couldn&rsquo;t solve: going on maternity leave, she needed her
                  clients covered by someone qualified, and there was no good way to find them.
                </p>
                <p style={{ marginBottom: 0 }}>
                  So she set out to build the professional circle she wished she&rsquo;d had, shaped with feedback from her peers, and co-founded it with Nick Rapley.
                  <b style={{ color: "var(--ink)" }}> A directory helps patients find you. PsyAlliance helps clinicians find each other.</b>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section" id="how">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">What it does</div>
              <h2>Three things, done properly.</h2>
              <p>Each one starts with a clear request, shows you who will see it before anything is sent, and stays open until it&rsquo;s resolved.</p>
            </div>
            <div className="three-grid">
              {DOES.map((d) => (
                <article key={d.n} className="editorial-card does-card">
                  <div className="n">{d.n}</div>
                  <h3>{d.title}</h3>
                  <p>{d.body}</p>
                  <a className="text-arrow" href={DEMO(d.demo)}>{d.demoLabel} &rarr;</a>
                </article>
              ))}
            </div>
            <p style={{ marginTop: 26, maxWidth: 760 }}>
              Behind all three is your <b style={{ color: "var(--ink)" }}>circle</b>: trusted colleagues you choose, people you&rsquo;ve worked with before, and a
              Practice Library of templates for cover, referrals and consultation, with each one&rsquo;s review status shown.
            </p>
          </div>
        </section>

        <section className="public-section tint" id="different">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">How it&rsquo;s different</div>
              <h2>Built for clinicians finding each other.</h2>
              <p>Not a directory for patients, and not another group chat.</p>
            </div>
            <div className="compare" role="table" aria-label="How PsyAlliance compares">
              <div className="compare-row compare-head" role="row">
                <span role="columnheader" />
                <span role="columnheader">Patient directories</span>
                <span role="columnheader">Listservs and group chats</span>
                <span role="columnheader" className="us">PsyAlliance</span>
              </div>
              {COMPARE.map(([k, a, b, c]) => (
                <div key={k} className="compare-row" role="row">
                  <span role="rowheader">{k}</span>
                  <span role="cell" data-label="Patient directories">{a}</span>
                  <span role="cell" data-label="Listservs and group chats">{b}</span>
                  <span role="cell" data-label="PsyAlliance" className="us">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section" id="start">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Getting started</div>
              <h2>See it, try it, then join.</h2>
            </div>
            <div className="journey">
              <a className="journey-step" href={DEMO()}>
                <span className="k">1</span>
                <b>Watch the demos</b>
                <span>Five short demos: the three workflows, your network, and how joining works. A minute or two each, no sign-up.</span>
                <span className="text-arrow">See the demos &rarr;</span>
              </a>
              <a className="journey-step" href={SANDBOX}>
                <span className="k">2</span>
                <b>Try your own sandbox</b>
                <span>A private fictional practice for a week. Send requests and invented colleagues reply.</span>
                <span className="text-arrow">Ask for a sandbox &rarr;</span>
              </a>
              <a className="journey-step" href="/join">
                <span className="k">3</span>
                <b>Request an invitation</b>
                <span>We open a few states at a time. A person checks your licence before you&rsquo;re listed.</span>
                <span className="text-arrow">Request an invitation &rarr;</span>
              </a>
            </div>
          </div>
        </section>

        <section className="public-section tint" id="verification">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Verification</div>
              <h2>Everyone is checked before they appear.</h2>
              <p>No self-attestation and no paid badge. Verified means a person reviewed the evidence.</p>
            </div>
            <div className="steps-grid">
              <div className="step">
                <span className="k">Step 1</span>
                <b>You share your credentials</b>
                <p>Your degree, the states you&rsquo;re licensed in and each licence number and expiry.</p>
              </div>
              <div className="step">
                <span className="k">Step 2</span>
                <b>We check the record</b>
                <p>Against the state licensing board, with the NPI registry as a cross-check where it helps.</p>
              </div>
              <div className="step">
                <span className="k">Step 3</span>
                <b>A person signs off</b>
                <p>Only then are you listed. Each licence is reviewed separately, and expired licences drop off automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section" id="approach">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Our approach</div>
              <h2>Rules we don&rsquo;t bend.</h2>
            </div>
            <ul className="rules">
              <li><b>Needs, not people</b>Clients are described by need. We flag dates, contact details and record numbers before anything is sent, and remove anything identifying that&rsquo;s reported.</li>
              <li><b>Verified means reviewed</b>Listing and requests require a reviewed identity, degree and in-date licence.</li>
              <li><b>Facts, not judgements</b>Profiles show facts on file with dates. Whether a colleague suits a client is your professional call.</li>
              <li><b>Nothing sends without review</b>Every request and post shows exactly who will see it before you confirm.</li>
              <li><b>Private by default</b>Who you save, exclude or block is never visible to them.</li>
              <li><b>Never sold, never advertised to</b>Your data isn&rsquo;t sold or used for advertising.</li>
            </ul>
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
              <h2>Join the first cohort.</h2>
              <p>We&rsquo;re opening PsyAlliance state by state, starting in the Northeast.</p>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <a className="btn" href="/join">Request an invitation &rarr;</a>
              <a className="btn ghost-on-dark" href={DEMO()}>Watch the demos</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter home />
    </div>
  );
}
