const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PsyAlliance",
  url: "https://psyalliance.org",
  description: "A private professional network for doctoral-level psychologists and psychiatrists to arrange coverage, exchange referrals, consult peers and access practice resources.",
};

export default function HomePage() {
  return <div className="premium-marketing">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <nav className="premium-nav" aria-label="Main navigation"><a href="/" className="premium-brand">psyalliance<span>.</span></a>
      <div className="premium-nav-links"><a href="#purpose">The network</a><a href="#experience">How it works</a><a href="#story">Our story</a></div>
      <div className="premium-nav-actions"><a href="/auth/sign-in">Sign in</a><a className="btn" href="/auth/sign-up">Join the network ↗</a></div>
    </nav>
    <main>
      <header className="premium-hero"><div className="premium-hero-copy"><span className="premium-eyebrow"><span aria-hidden="true" /> A professional home for clinicians</span>
        <h1>Better care starts with <em>better connections.</em></h1>
        <p>Find the right colleague for coverage, referrals and consultation. A private network designed around how psychologists and psychiatrists actually work together.</p>
        <div className="premium-hero-buttons"><a className="btn" href="/auth/sign-up">Create your profile ↗</a><a href="#experience">Explore the experience ↓</a></div>
        <div className="premium-hero-rule"><span>For doctoral-level psychologists</span><span>and psychiatrists</span></div></div>
        <div className="premium-hero-art" aria-label="Professional connection illustration"><div className="premium-orbit orbit-one" /><div className="premium-orbit orbit-two" />
          <div className="premium-art-center"><span>PA</span><small>THE POWER OF<br />WORKING TOGETHER</small></div>
          <div className="premium-art-note art-note-one"><i /> Coverage</div><div className="premium-art-note art-note-two"><i /> Consultation</div><div className="premium-art-note art-note-three"><i /> Referrals</div>
          <span className="premium-art-caption">A considered space for a connected profession.</span></div>
      </header>
      <section id="purpose" className="premium-purpose"><span className="premium-eyebrow">01 / Why we exist</span><div><h2>Independent practice should never mean practicing alone.</h2><p>When you need someone to cover your work, take a referral or help think through a question, your professional network should be there. PsyAlliance brings those relationships into one thoughtful space.</p></div></section>
      <section id="experience" className="premium-experience"><div className="premium-section-heading"><span className="premium-eyebrow">02 / The experience</span><h2>The right support for the moments that matter.</h2><p>Built around the practical work of caring for people and staying connected to your profession.</p></div>
        <div className="premium-feature-grid">
          <article><span className="premium-feature-number">01 / COVERAGE</span><div className="premium-feature-icon">↗</div><h3>Step away with confidence.</h3><p>Arrange temporary coverage for leave and find colleagues whose location, practice and availability fit your needs.</p><a href="/auth/sign-up">Plan coverage →</a></article>
          <article><span className="premium-feature-number">02 / REFERRALS</span><div className="premium-feature-icon">◎</div><h3>Send care in the right direction.</h3><p>Connect a de-identified referral request with colleagues equipped to take the next step.</p><a href="/auth/sign-up">Explore referrals →</a></article>
          <article><span className="premium-feature-number">03 / CONSULTATION</span><div className="premium-feature-icon">✳</div><h3>Think better together.</h3><p>Bring focused questions to peers in a private professional space and build lasting consultation relationships.</p><a href="/auth/sign-up">Meet your peers →</a></article>
        </div>
      </section>
      <section className="premium-trust"><span className="premium-eyebrow">03 / A considered network</span><h2>Trust is built into the experience.</h2><div className="premium-trust-grid"><div><span>01</span><h3>Professional credentials</h3><p>Directory access requires a reviewed professional credential. New applicants stay out of the directory until verification is complete.</p></div><div><span>02</span><h3>Deliberate sharing</h3><p>Use de-identified requests and choose your audience before reaching out. Clinical details belong in the right care setting.</p></div><div><span>03</span><h3>Governed resources</h3><p>Practice Library resources appear when qualified, independent reviewers have approved their current version.</p></div></div></section>
      <section className="premium-story" id="story"><div className="premium-story-image"><img src="/team/rena-pazienza.jpg" alt="Rena Pazienza, PhD, cofounder of PsyAlliance" /><span>FOUNDED FROM PRACTICE, FOR PRACTICE</span></div><div className="premium-story-copy"><span className="premium-eyebrow">04 / Our story</span><h2>Made by someone who needed it.</h2><p>When psychologist Rena Pazienza, PhD, prepared for maternity leave, finding the right person to cover her clients should have been straightforward. It wasn’t. PsyAlliance grew from that experience, shaped with feedback from clinical peers and co-founded with Nick Rapley.</p><p>It is a place for the professional relationships that help clinicians care for their patients and one another.</p></div></section>
      <section className="premium-cta"><span className="premium-eyebrow">A stronger practice starts together</span><h2>Find your people.<br /><em>Do your best work.</em></h2><a className="btn" href="/auth/sign-up">Create your free profile ↗</a></section>
    </main>
    <footer className="premium-footer"><a href="/" className="premium-brand">psyalliance<span>.</span></a><p>Supporting psychology, strengthening care.</p><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:hello@psyalliance.org">Contact</a></div></footer>
  </div>;
}
