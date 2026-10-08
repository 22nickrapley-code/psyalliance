import { JOIN_HREF, PUBLIC_BASE, IS_DEMO_SITE, REAL_SITE_URL, TOUR_URL } from "@/lib/env";

// Shared public-site chrome (home, join, privacy, terms, the demos), so
// every public page carries the same typography, palette and navigation.
// The brand, the demos and the one way in ("Create your account") always
// point at the real site, whichever site you're on.
const DEMOS_HREF = TOUR_URL;
const SIGN_IN_HREF = IS_DEMO_SITE ? `${REAL_SITE_URL}/auth/sign-in` : "/auth/sign-in";

export function PublicNav({ home = false }: { home?: boolean }) {
  const base = home ? "" : `${PUBLIC_BASE}/`;
  return (
    <nav className="public-nav" aria-label="Public">
      <a className="brand" href={`${PUBLIC_BASE}/`}>
        <span className="brand-mark" aria-hidden="true">ψ</span>psyalliance
      </a>
      <div className="links">
        <a className="text-link" href={`${base}#how`}>How it works</a>
        <a className="text-link" href={`${PUBLIC_BASE}/library`}>Library</a>
        <a className="text-link keep" href={DEMOS_HREF}>Demos</a>
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
        <div className="brand"><span className="brand-mark" aria-hidden="true">ψ</span>psyalliance</div>
        <p>A private, verified network for independent psychologists and psychiatrists.</p>
      </div>
      <div className="foot-links">
        <a href={`${base}#how`}>How it works</a>
        <a href={`${PUBLIC_BASE}/library`}>Practice Library</a>
        <a href={DEMOS_HREF}>Demos</a>
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
