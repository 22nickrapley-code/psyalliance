import { JOIN_HREF, PUBLIC_BASE, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";

// Shared public-site chrome (home, join, privacy, terms, the demos), so
// every public page carries the same typography, palette and navigation.
// The brand, the demos and the one way in ("Create your account") always
// point at the real site, whichever site you're on.
const SIGN_IN_HREF = IS_DEMO_SITE ? `${REAL_SITE_URL}/auth/sign-in` : "/auth/sign-in";

export function PublicNav({ home = false }: { home?: boolean }) {
  const base = home ? "" : `${PUBLIC_BASE}/`;
  return (
    <nav className="public-nav" aria-label="Public">
      <a className="brand" href={`${PUBLIC_BASE}/`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/workspace/assets/logo.svg" alt="PsyAlliance" />
      </a>
      <div className="links">
        {/* Just three ways on (Nick, 1 Nov): how it works, sign in, create your account. */}
        <a className="text-link" href={`${base}#how`}>How it works</a>
        {/* On phones the header is Home, Sign in and Join. */}
        <a className="text-link phone-only" href={`${PUBLIC_BASE}/`}>Home</a>
        <a className="text-link phone-only" href={SIGN_IN_HREF}>Sign in</a>
        <a className="btn secondary small-btn" href={SIGN_IN_HREF}>Sign in</a>
        <a className="btn small-btn" href={JOIN_HREF}><span className="label-full">Create your account</span><span className="label-short">Join</span></a>
      </div>
    </nav>
  );
}

export function PublicFooter({ home = false }: { home?: boolean }) {
  const base = home ? "" : `${PUBLIC_BASE}/`;
  return (
    <footer className="public-footer">
      <div>
        <div className="brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="brand-logo on-dark" src="/workspace/assets/logo.svg" alt="PsyAlliance" /></div>
        <p>A private, verified network for independent psychologists and psychiatrists.</p>
      </div>
      <div className="foot-links">
        <a href={`${base}#how`}>How it works</a>
        <a href={`${PUBLIC_BASE}/verification`}>Verification</a>
        <a href={`${PUBLIC_BASE}/privacy`}>Privacy</a>
        <a href={`${PUBLIC_BASE}/terms`}>Terms</a>
        <a href="mailto:hello@psyalliance.org">Contact</a>
        <a href={SIGN_IN_HREF}>Sign in</a>
        {IS_DEMO_SITE && <a href="/auth/sign-in" className="admin-link">Sandbox admin</a>}
      </div>
    </footer>
  );
}
