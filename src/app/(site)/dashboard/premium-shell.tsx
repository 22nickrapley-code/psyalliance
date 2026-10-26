"use client";
import { REAL_SITE_URL } from "@/lib/env";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavGroup, NavItem } from "./nav-groups";
import { MOBILE_PRIMARY } from "./nav-groups";
import { NavIcon } from "./icons";
import { RelationshipProvider } from "./_components/relationship";
import type { RelationshipMap } from "@/lib/relationship-map";
import type { HubStates } from "@/lib/hub-states";
import { HubProvider } from "./_components/profile-tabs";

// The member workspace shell from the premium concept: a quiet left rail,
// a slim top bar with breadcrumbs and the notification bell, and a
// five-item bottom bar on mobile. Screens render inside .page.

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.matches || []).some((m) => pathname === m || pathname.startsWith(m + "/"));
}

export default function PremiumShell({
  groups,
  displayName,
  initials,
  avatarUrl,
  verificationLabel,
  unreadNotifications,
  signOutAction,
  children,
  demoView,
  gateNotice,
  demoSite,
  resetSandboxAction,
  homeHref = "/dashboard",
  activeHref,
  relationships = null,
  hub = null,
}: {
  groups: NavGroup[];
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  verificationLabel: string | null;
  unreadNotifications: number;
  signOutAction: (formData: FormData) => void;
  children: React.ReactNode;
  demoView?: boolean;
  gateNotice?: string | null;
  demoSite?: { label: string | null; expires: string | null; who?: string | null; role?: string | null } | null;
  resetSandboxAction?: () => Promise<void>;
  homeHref?: string;
  activeHref?: string;
  relationships?: RelationshipMap | null;
  hub?: HubStates | null;
}) {
  const routePath = usePathname();
  const pathname = activeHref || routePath || "/dashboard";
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);
  // Escape closes the phone menu and puts focus back on its button (R17-08).
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDrawerOpen(false);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const allItems = groups.flatMap((g) => g.items);
  // The most specific match names the page: /dashboard/admin/library is
  // "Library governance", not "Overview".
  const current = allItems
    .filter((i) => isActive(pathname, i) || (i.href === "/dashboard/admin" && pathname === "/dashboard/admin"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const primary = MOBILE_PRIMARY.map((href) => allItems.find((i) => i.href === href)).filter((i): i is NavItem => !!i);
  const mobileItems = primary.length ? primary : allItems.slice(0, 5);

  return (
    <div className="pa">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="shell">
        {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
        <aside className={`sidebar${drawerOpen ? " open" : ""}`} aria-label="Workspace navigation">
          <Link href={homeHref} className="brand">
            <span className="brand-mark" aria-hidden="true">&psi;</span>
            psyalliance
          </Link>
          <nav className="rail-scroll">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="rail-label">{group.label}</div>
                <div className="rail-nav">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rail-link${item === current ? " active" : ""}`}
                      aria-current={item === current ? "page" : undefined}
                    >
                      <span className="ico" aria-hidden="true"><NavIcon name={item.glyph} size={18} /></span>
                      {item.label}
                      {!!item.badge && <span className="count">{item.badge}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="rail-bottom">
            <Link href="/dashboard/profile" className="rail-user" title={displayName}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="avatar rel-you" style={{ objectFit: "cover" }} />
              ) : (
                <span className="avatar rel-you">{initials}</span>
              )}
              <span className="rail-user-text">
                <b>{displayName}</b>
                {verificationLabel && <span className="verification-label">{verificationLabel}</span>}
              </span>
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="plain-button sign-out">Sign out</button>
            </form>
          </div>
        </aside>

        <div className="workspace">
          {demoSite && (
            // One slim line (Nick, 13 Oct): you're in the sandbox, who you
            // are, Leave, and a ··· menu for the rest.
            <div className="sandbox-strip" role="region" aria-label="About this sandbox">
              {demoSite.who && <span className="strip-initials" aria-hidden="true">{initials}</span>}
              <p className="strip-who">
                <b>Sandbox</b>
                <span>{demoSite.who ? ` · You're ${demoSite.who}` : " · PsyAlliance demo"}</span>
              </p>
              {demoSite.label && (
                <a className="strip-leave" href={`${REAL_SITE_URL}/dashboard/profile`} title="Back to your own account on PsyAlliance. Your sandbox stays open, so you can come back to it.">
                  Leave
                </a>
              )}
              <details className="strip-menu">
                <summary aria-label="Sandbox options">
                  <span aria-hidden="true">&middot;&middot;&middot;</span>
                </summary>
                <div className="strip-pop">
                  <a href="/dashboard/demos">Demos</a>
                  {resetSandboxAction && demoSite.label && (
                    <form action={resetSandboxAction}>
                      <button type="submit" title="Clears everything you have done here and restores Alex's practice">Start the story again</button>
                    </form>
                  )}
                  <p>
                    {demoSite.role ? `${demoSite.role}. ` : ""}Everyone here is fictional and nothing is emailed. Colleagues reply to what you send within a minute or two.
                    {demoSite.label ? " Start the story again clears everything you've done and restores Alex's practice. Leave takes you back to your own account; open the sandbox again from your Home page." : ""}
                  </p>
                  {demoSite.expires && <p>Sandbox for {demoSite.label}, open until {demoSite.expires}.</p>}
                </div>
              </details>
            </div>
          )}
          <header className="workspace-top">
            <button
              type="button"
              className="icon-button mobile-menu"
              ref={opener}
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            {/* No page name up here (Nick, 18 Oct): each page says it in its
                own heading. The bell, and the menu button on phones, stay. */}
            <span className="top-spacer" />
            <div className="top-actions">
              <Link
                href="/dashboard/messages?tab=notifications"
                className="icon-button"
                data-bell=""
                aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : "Notifications"}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {unreadNotifications > 0 && <span className="red-dot" />}
              </Link>
            </div>
          </header>
          {demoView && (
            <div className="demo-bar" role="status">
              Demo network: everyone you see here is fake. <Link href="/dashboard/settings#demo">Switch back to the real network</Link>
            </div>
          )}
          {gateNotice && !demoView && (
            <div className="demo-bar gate-bar" role="status">
              {gateNotice} <a href="/dashboard/sandbox/open" data-reload="">Your sandbox</a> &middot; <Link href="/dashboard/documents">Practice Library</Link> &middot; <Link href="/dashboard/credentials">Credentials</Link>
            </div>
          )}
          <main className="page" id="main" tabIndex={-1}>
            <RelationshipProvider value={relationships}>
              <HubProvider value={hub}>{children}</HubProvider>
            </RelationshipProvider>
          </main>
        </div>
      </div>

      <nav className="mobile-bottom" aria-label="Primary">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={isActive(pathname, item) ? "active" : ""}>
            <span className="symbol" aria-hidden="true"><NavIcon name={item.glyph} size={22} /></span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
