import { JOIN_HREF, PUBLIC_BASE, IS_DEMO_SITE, DEMO_URL } from "@/lib/env";

// Shared public-site chrome (home, join, privacy, terms, the demos), so
// every public page carries the same typography, palette and navigation.
// The brand always goes to the real site's home page, and "Demos" always
// goes to the demo library, whichever site you're on.
const DEMOS_HREF = IS_DEMO_SITE ? "/tour" : DEMO_URL ? `${DEMO_URL}/tour` : "/tour";

export function PublicNav({ home = false }: { home?: boolean }) {
  const base = home ? "" : `${PUBLIC_BASE}/`;
  return (
    <nav className="public-nav" aria-label="Public">
      <a className="brand" href={`${PUBLIC_BASE}/`}>
        <span className="brand-mark" aria-hidden="true">ψ</span>psyalliance
      </a>
      <div className="links">
        <a className="text-link" href={`${base}#how`}>How it works</a>
        <a className="text-link" href={`${base}#why`}>Why PsyAlliance</a>
        <a className="text-link keep" href={DEMOS_HREF}>Demos</a>
        {IS_DEMO_SITE ? (
          <a className="btn secondary small-btn" href="/sandbox/request">Get a sandbox</a>
        ) : (
          <a className="btn secondary small-btn" href="/auth/sign-in">Sign in</a>
        )}
        <a className="btn small-btn" href={JOIN_HREF}><span className="label-full">Request an invitation</span><span className="label-short">Join</span></a>
      </div>
    </nav>
  );
}

export function PublicFooter({ home = false }: { home?: boolean }) {
  const base = home ? "" : `${PUBLIC_BASE}/`;
  return (
    <footer className="public-footer">
      <div>
        <div className="brand"><span className="brand-mark" aria-hidden="true">ψ</span>psyalliance</div>
        <p>A private, verified network for independent psychologists and psychiatrists.</p>
      </div>
      <div className="foot-links">
        <a href={`${base}#how`}>How it works</a>
        <a href={`${base}#why`}>Why PsyAlliance</a>
        <a href={DEMOS_HREF}>Demos</a>
        <a href={`${base}#verification`}>Verification</a>
        <a href={`${PUBLIC_BASE}/privacy`}>Privacy</a>
        <a href={`${PUBLIC_BASE}/terms`}>Terms</a>
        <a href="mailto:hello@psyalliance.org">Contact</a>
        {IS_DEMO_SITE ? <a href="/auth/sign-in" className="admin-link">Admin sign in</a> : <a href="/auth/sign-in">Sign in</a>}
      </div>
    </footer>
  );
}
