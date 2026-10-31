import "./premium.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, REAL_SITE_URL, SITE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loadOpenStates, stateList } from "@/lib/open-states";
import { PublicNav, PublicFooter } from "./_public/chrome";
import { publicLibraryHref } from "@/lib/library";
import { FOUNDING_LINE } from "@/lib/founding";
import { FoundingCount } from "./_public/founding-count";

// Public landing. Written for a busy clinician who gives it a few seconds:
// what it is and the benefit first, then the three moments it helps with,
// why it exists, why it's safe, the questions people ask first and one way
// in. Verification detail lives at /verification and the full rules at
// /privacy. The first 40 members in each state are founding members.

const FAQ: [string, string][] = [
  [
    "Who can join?",
    "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) licensed in the US. Anyone eligible can create an account; the network opens state by state, starting with New York and Massachusetts.",
  ],
  [
    "What does it cost?",
    "The first 40 members in each state are founding members and never pay: membership stays free for as long as you remain a member. A place counts once your license is approved, in your main practice state. After a state's founding places are taken, membership there will be paid; we'll publish the price before then.",
  ],
  [
    "What's in the Library?",
    "Twenty templates for independent practice, from a professional will to a reciprocal cover agreement. Browse the titles here. Members open the ones available now, placed beside the work they support, and the rest follow as each is released.",
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

// The three moments: what it is like on your own today, and what PsyAlliance does instead.
const MOMENTS: { key: string; svc: string; title: string; today: string; with: string; demo: string; label: string }[] = [
  {
    key: "Cover", svc: "cover", title: "You’re away.",
    today: "You call around, hoping someone licensed in the right state is free and suited to each client.",
    with: "One cover plan. Each client is matched to a colleague who is licensed, suited and actually available, and every handover is tracked.",
    demo: DEMO("/cover"), label: "Watch how Cover works",
  },
  {
    key: "Referrals", svc: "ref", title: "You’re full.",
    today: "The inquiry goes on a waitlist, or to a name you half remember.",
    with: "Send it to the right colleague, matched by license, focus and insurance, without sharing who the client is.",
    demo: DEMO("/refer"), label: "Watch how Referrals work",
  },
  {
    key: "Consult", svc: "con", title: "You’re unsure.",
    today: "You post to a listserv of strangers, or carry it alone.",
    with: "Ask colleagues you trust one focused question between sessions, with no client details.",
    demo: DEMO("/consult"), label: "Watch how Consult works",
  },
];

const STAGES: [string, string, string][] = [
  ["Starting out", "Someone to ask.", "Find colleagues to ask, and share perspectives with people who have built a practice before you."],
  ["Building", "Work that fits.", "Receive referrals that match your focus from colleagues who are full, and start from Library templates instead of a blank page."],
  ["Established", "A group behind you.", "Arrange cover, place a client with the right colleague and get another professional perspective."],
  ["Changing pace", "A careful next chapter.", "Plan time away, reduce your caseload responsibly and put a professional will in place."],
];

const LIBRARY_PICKS: [string, string, string][] = [ // [PA number, title, line]
  ["PA-03", "Professional Will & Practice Succession Plan", "Who looks after your clients and records if you can’t."],
  ["PA-02", "Extended Leave Pack", "Step away for more than two weeks without stranding clients."],
  ["PA-01", "Reciprocal Coverage Agreement", "A standing cover arrangement with a colleague you trust."],
];

const TRUST: [string, string][] = [
  ["Doctoral-level only.", "Psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). A person checks each license against the state board before you’re listed."],
  ["Needs, not names.", "Clients are described by need. The clinical handoff happens through your own secure channel."],
  ["Your data stays yours.", "Never sold or used for advertising, and nothing is sent until you’ve seen who will receive it."],
];

const Tick = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
);

export default async function HomePage() {
  // The demo site opens on the demo library.
  if (IS_DEMO_SITE) redirect(REAL_SITE_URL);
  const open = stateList(await loadOpenStates(await createClient()));
  return (
    <div className="pa v1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }} />
      <PublicNav home />

      <main>
        <section className="v1-wrap v1-hero">
          <div>
            <div className="eyebrow">For doctoral psychologists and psychiatrists in private practice</div>
            <h1>
              Your own practice, <em>with a group behind you.</em>
            </h1>
            <p className="v1-lead">
              Colleagues who cover your clients when you&rsquo;re away, take the referrals you can&rsquo;t, and talk a hard decision through with you. Every member is verified by a person.
            </p>
            <div className="v1-cta">
              <a className="btn lg" href="/auth/sign-up">Create your account</a>
              <a className="btn secondary lg" href="/start">Show me how it could help</a>
            </div>
            <p className="v1-found">{FOUNDING_LINE}</p>
            <FoundingCount className="founding-count hero-count" />
            <ul className="v1-proof" aria-label="Who it's for">
              <li><Tick />Doctoral-level only</li>
              <li><Tick />Every license checked by a person</li>
              <li><Tick />Co-founded by a licensed psychologist</li>
            </ul>
          </div>
          <div className="v1-panel" aria-label="Example cover plan">
            <div className="v1-panel-bar"><span>Inside PsyAlliance</span><span>Example &middot; fictional people</span></div>
            <div className="v1-plan">
              <div className="eyebrow">Cover plan &middot; six weeks&rsquo; parental leave</div>
              <h3>3 of 3 clients covered. Handovers ready.</h3>
              <div className="v1-prog" aria-hidden="true"><i /><i /><i /></div>
            </div>
            {[
              ["MC", "#2F5E8A", "Client 1 · Trauma/PTSD", "Maya Calderwick, PsyD · Brooklyn · NY license reviewed"],
              ["SB", "#6A4E8C", "Client 2 · Teen anxiety", "Samuel Brindlemoor, PhD · Queens · Aetna"],
              ["EK", "#9A5B26", "Client 3 · Needs prescribing", "Eli Kestrelby, MD · Manhattan · Psychiatry"],
            ].map(([i, c, t, s]) => (
              <div key={i} className="v1-case">
                <span className="v1-av" style={{ background: c }} aria-hidden="true">{i}</span>
                <span><b>{t}</b><small>{s}</small></span>
                <span className="v1-ok">Ready</span>
              </div>
            ))}
          </div>
        </section>

        <section className="v1-band v1-paper" id="how">
          <div className="v1-wrap">
            <div className="v1-intro">
              <div className="eyebrow">The problem</div>
              <h2>Private practice works well, <em>until the day it doesn&rsquo;t.</em></h2>
              <p>
                In a group practice someone covers your clients when you&rsquo;re ill, takes the referral you can&rsquo;t, and is down the corridor when a case keeps you up at night. On your own, each of those becomes phone calls, favors and listserv posts, usually when you have least time.
              </p>
            </div>
            <div className="v1-compare" role="table" aria-label="On your own today, and with PsyAlliance">
              <div className="v1-crow v1-chead" role="row"><div role="columnheader">The moment</div><div role="columnheader">On your own today</div><div role="columnheader">With PsyAlliance</div></div>
              {MOMENTS.map((m) => (
                <div key={m.key} className={`v1-crow svc-${m.svc}`} role="row">
                  <div className="v1-m" role="rowheader"><small>{m.key}</small><b>{m.title}</b></div>
                  <div className="v1-today" role="cell">{m.today}</div>
                  <div className="v1-with" role="cell">{m.with}<a className="moment-watch" href={m.demo}>{m.label} &rarr;</a></div>
                </div>
              ))}
            </div>
            <p className="v1-more"><a href={DEMO()}>Or watch the whole story in two minutes &rarr;</a></p>
          </div>
        </section>

        <section className="v1-band" id="stages" aria-labelledby="stages-title">
          <div className="v1-wrap">
            <div className="v1-intro">
              <div className="eyebrow">For every stage of a career</div>
              <h2 id="stages-title">The colleagues you need change. <em>The place to find them shouldn&rsquo;t.</em></h2>
            </div>
            <div className="v1-stages">
              {STAGES.map(([k, t, b]) => (
                <div key={k} className="v1-stage"><div className="k">{k}</div><h3>{t}</h3><p>{b}</p></div>
              ))}
            </div>
            <p className="v1-more">
              <a href="/start">Show me how PsyAlliance could help &rarr;</a>
              <a href="/tour">See how PsyAlliance works &rarr;</a>
            </p>
            <p className="v1-note">Membership is for doctoral-level psychologists and psychiatrists with an active US license, which a person checks before you are listed.</p>
          </div>
        </section>

        <section className="v1-band v1-paper" id="library">
          <div className="v1-wrap">
            <div className="v1-intro">
              <div className="eyebrow">The Library</div>
              <h2>Templates for the hard moments <em>of independent practice.</em></h2>
              <p>
                In a group practice, the leave plan, the referral letter and the professional will already exist. On your own, you write them yourself, usually when time is shortest. Start from a template instead, each beside the work it supports.
              </p>
            </div>
            <div className="v1-libgrid">
              {LIBRARY_PICKS.map(([code, title, line]) => (
                <article key={code} className="v1-lib">
                  <div className="k">Coverage &amp; continuity</div>
                  <h3><a href={publicLibraryHref(code)}>{title}</a></h3>
                  <p>{line}</p>
                </article>
              ))}
            </div>
            <p className="v1-more"><a href="/library">Browse all 20 templates &rarr;</a></p>
          </div>
        </section>

        <section className="v1-band v1-dark" id="why">
          <div className="v1-wrap v1-story">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/rena-pazienza.jpg" alt="Rena Pazienza, PhD" />
            <div>
              <div className="eyebrow">Why we built it</div>
              <blockquote>A directory helps patients find you. <em>PsyAlliance helps clinicians find each other.</em></blockquote>
              <p>
                Going on maternity leave, Rena Pazienza, PhD, needed her clients covered by someone qualified, and there was no good way to find them. So she
                co-founded PsyAlliance with Nick Rapley to build the professional circle she wished she&rsquo;d had.
              </p>
              <div className="v1-sig">Rena Pazienza, PhD, co-founder</div>
            </div>
          </div>
        </section>

        <section className="v1-band" id="verification">
          <div className="v1-wrap">
            <div className="v1-intro">
              <div className="eyebrow">Trust</div>
              <h2>Verified by a person. <em>Private by design.</em></h2>
            </div>
            <div className="v1-trust">
              {TRUST.map(([t, b]) => (
                <div key={t}><b>{t}</b><p>{b}</p></div>
              ))}
            </div>
            <p className="v1-more">
              <a href="/verification">How verification works &rarr;</a>
              <a href="/privacy">Our privacy rules &rarr;</a>
            </p>
          </div>
        </section>

        <section className="v1-band v1-paper" id="faq">
          <div className="v1-wrap v1-narrow">
            <div className="v1-intro">
              <div className="eyebrow">Questions</div>
              <h2>What clinicians ask first.</h2>
            </div>
            <div className="v1-faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="v1-band v1-last">
          <div className="v1-wrap">
            <div className="v1-final">
              <div>
                <div className="eyebrow">Founding members</div>
                <h2>Be one of the first 40 <em>in your state.</em></h2>
                <p>{FOUNDING_LINE} Open now in {open || "the Northeast"}; other states open as colleagues join.</p>
                <FoundingCount className="founding-count on-dark" />
              </div>
              <a className="btn lg" href="/auth/sign-up">Create your account</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter home />
    </div>
  );
}
