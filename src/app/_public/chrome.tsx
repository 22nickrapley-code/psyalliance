import { JOIN_HREF, PUBLIC_BASE, IS_DEMO_SITE } from "@/lib/env";

// Shared public-site chrome (landing, privacy, terms, demo tour), so every
// public page carries the same typography, palette and navigation.
export function PublicNav({ home = false }: { home?: boolean }) {
  const base = home ? "" : `${PUBLIC_BASE}/`;
  return (
    <nav className="public-nav" aria-label="Public">
      <a className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">ψ</span>psyalliance
      </a>
      <div className="links">
        <a className="text-link" href={`${base}#how`}>How it works</a>
        <a className="text-link" href={`${base}#verification`}>Verification</a>
        <a className="text-link" href={`${base}#story`}>Our story</a>
        <a className="btn secondary small-btn" href="/auth/sign-in">Sign in</a>
        {IS_DEMO_SITE && <a className="text-link" href="/tour">Guided tour</a>}
        <a className="btn small-btn" href={JOIN_HREF}>Join the network</a>
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
        <p>A professional network for independent psychologists and psychiatrists.</p>
      </div>
      <div className="foot-links">
        <a href={`${base}#how`}>How it works</a>
        <a href={`${base}#verification`}>Verification</a>
        <a href={`${PUBLIC_BASE}/privacy`}>Privacy</a>
        <a href={`${PUBLIC_BASE}/terms`}>Terms</a>
        <a href="mailto:hello@psyalliance.org">Contact</a>
        <a href="/auth/sign-in">Sign in</a>
      </div>
    </footer>
  );
}
