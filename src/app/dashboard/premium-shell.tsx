"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup, NavItem } from "./nav-groups";
import { MOBILE_PRIMARY } from "./nav-groups";

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
}) {
  const pathname = usePathname() || "/dashboard";
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const allItems = groups.flatMap((g) => g.items);
  const current = allItems.find((i) => isActive(pathname, i));
  const mobileItems = MOBILE_PRIMARY.map((href) => allItems.find((i) => i.href === href)).filter(
    (i): i is NavItem => !!i
  );

  return (
    <div className="pa">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="shell">
        {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
        <aside className={`sidebar${drawerOpen ? " open" : ""}`} aria-label="Workspace navigation">
          <Link href="/dashboard" className="brand">
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
                      className={`rail-link${isActive(pathname, item) ? " active" : ""}`}
                      aria-current={isActive(pathname, item) ? "page" : undefined}
                    >
                      <span className="ico" aria-hidden="true">{item.glyph}</span>
                      {item.label}
                      {!!item.badge && <span className="count">{item.badge}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="rail-bottom">
            <Link href="/dashboard/profile" className="rail-user">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="avatar" style={{ objectFit: "cover" }} />
              ) : (
                <span className="avatar">{initials}</span>
              )}
              <span>
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
          <header className="workspace-top">
            <button
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              &#9776;
            </button>
            <div className="breadcrumbs">
              <span>Workspace</span>
              <span aria-hidden="true">&rsaquo;</span>
              <b>{current?.label || "PsyAlliance"}</b>
            </div>
            <div className="top-actions">
              <Link
                href="/dashboard/notifications"
                className="icon-button"
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
              {gateNotice} <Link href="/dashboard/credentials">Credentials</Link>
            </div>
          )}
          <main className="page" id="main" tabIndex={-1}>{children}</main>
        </div>
      </div>

      <nav className="mobile-bottom" aria-label="Primary">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={isActive(pathname, item) ? "active" : ""}>
            <span className="symbol" aria-hidden="true">{item.glyph}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
