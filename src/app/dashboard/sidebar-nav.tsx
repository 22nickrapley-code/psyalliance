"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "./nav-groups";

const MenuIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const MoreIcon = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
    <circle cx="5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" />
  </svg>
);

// The primary destinations (Master Brief's Home / Requests / Network /
// Consult / Messages), always one tap away on mobile - same reasoning as
// any mainstream app's bottom tab bar (LinkedIn, IG, Facebook): a handful
// of primary spots plus a catch-all ("More") for everything else, rather
// than every single nav item competing for the same row.
const PRIMARY_TAB_HREFS = [
  "/dashboard",
  "/dashboard/requests",
  "/dashboard/network",
  "/dashboard/consult",
  "/dashboard/messages",
];

export default function SidebarNav({
  groups,
  displayName,
  initials,
  avatarUrl,
  verificationStatus,
  signOutAction,
}: {
  groups: NavGroup[];
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  verificationStatus: string | null;
  signOutAction: (formData: FormData) => void;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  // Close the drawer whenever the route changes (tapping a link inside it
  // navigates, so this is really "close on navigate") and stop the page
  // behind it from scrolling while it's open - the same behavior as any
  // native app's slide-out menu.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  const allItems = groups.flatMap((g) => g.items);
  const primaryItems = PRIMARY_TAB_HREFS.map((href) => allItems.find((i) => i.href === href)).filter(
    (i): i is NonNullable<typeof i> => !!i
  );
  const isOnPrimaryTab = primaryItems.some((i) => isActive(i.href));

  return (
    <>
      {/* Mobile-only top bar: brand + hamburger, fixed so it's reachable
          without scrolling past anything - this is what replaces the old
          "every tab wraps in a row across the top of the page" layout. */}
      <div className="mobile-topbar">
        <Link href="/dashboard" className="brand">psyalliance.org</Link>
        <button type="button" className="mobile-topbar-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          {MenuIcon}
        </button>
      </div>

      {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
        <div className="sidebar-drawer-head">
          <Link href="/dashboard" className="brand">
            psyalliance.org
            <span>Practice network</span>
          </Link>
          <button type="button" className="sidebar-close-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            {CloseIcon}
          </button>
        </div>

        <nav>
          {groups.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              <div className="nav-links">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link${isActive(item.href) ? " active" : ""}`}
                  >
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {!!item.badge && <span className="nav-badge">{item.badge}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="avatar" style={{ objectFit: "cover" }} />
            ) : (
              <div className="avatar">{initials}</div>
            )}
            <div className="who">
              <div className="name">{displayName}</div>
              {verificationStatus && <div className="status">{verificationStatus}</div>}
            </div>
          </div>
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Mobile-only bottom tab bar: the handful of destinations people use
          most, always one tap away with no scrolling. Everything else - the
          full grouped nav, profile status, sign out - lives behind "More",
          which opens the same drawer as the hamburger button above. */}
      <nav className="mobile-tabbar">
        {primaryItems.map((item) => (
          <Link key={item.href} href={item.href} className={`mobile-tab${isActive(item.href) ? " active" : ""}`}>
            <span className="mobile-tab-icon">
              {item.icon}
              {!!item.badge && <span className="mobile-tab-badge">{item.badge}</span>}
            </span>
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`mobile-tab${drawerOpen || !isOnPrimaryTab ? " active" : ""}`}
          onClick={() => setDrawerOpen(true)}
        >
          <span className="mobile-tab-icon">{MoreIcon}</span>
          <span className="mobile-tab-label">More</span>
        </button>
      </nav>
    </>
  );
}
