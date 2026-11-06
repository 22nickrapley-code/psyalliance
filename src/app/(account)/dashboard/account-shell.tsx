"use client";
import { REAL_SITE_URL } from "@/lib/env";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavGroup, NavItem } from "@/app/(site)/dashboard/nav-groups";
import { MOBILE_PRIMARY } from "@/app/(site)/dashboard/nav-groups";
import { RelationshipProvider } from "@/app/(site)/dashboard/_components/relationship";
import type { RelationshipMap } from "@/lib/relationship-map";
import type { HubStates } from "@/lib/hub-states";
import { HubProvider } from "@/app/(site)/dashboard/_components/profile-tabs";
import { AcIcon } from "./account-icons";

// The frame around the account pages (profile, documents, continuity,
// credentials, notifications, settings, demos, admin). It is the workspace's
// own frame, drawn the same way with the same stylesheet classes (sidebar,
// top bar, mobile bar), so moving between the workspace and these pages looks
// like one product. The pages inside keep their own working code.

const ICON: Record<string, string> = {
  home: "layout-grid", cover: "shield-check", refer: "arrow-right-left", consult: "message-circle-more", members: "users-round", network: "users-round",
  messages: "messages-square", library: "book-open", profile: "user-round", play: "circle-play", settings: "settings", overview: "layout-dashboard",
  pass: "ticket", pulse: "activity", check: "circle-check", flag: "flag",
};
const MOBILE_ICON: Record<string, string> = { "/dashboard": "layout-grid", "/dashboard/cover": "shield-check", "/dashboard/referrals": "arrow-right-left", "/dashboard/consult": "message-circle-more", "/dashboard/messages": "messages-square" };
const MOBILE_LABEL: Record<string, string> = { "/dashboard": "The Hub", "/dashboard/cover": "Cover", "/dashboard/referrals": "Referrals", "/dashboard/consult": "Consult", "/dashboard/messages": "Messages" };

const PAGE_LABEL: Record<string, string> = {
  "/dashboard/profile": "Your profile", "/dashboard/credentials": "Credentials", "/dashboard/continuity": "Continuity plan",
  "/dashboard/settings": "Account and privacy", "/dashboard/notifications": "Notifications", "/dashboard/demos": "Demos",
  "/dashboard/documents": "My files", "/dashboard/start": "Getting started",
};

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/dashboard") return pathname === "/dashboard" || (item.matches || []).some((m) => pathname === m || pathname.startsWith(m + "/"));
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.matches || []).some((m) => pathname === m || pathname.startsWith(m + "/"));
}

export default function AccountShell({
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
  relationships?: RelationshipMap | null;
  hub?: HubStates | null;
}) {
  const pathname = usePathname() || "/dashboard";
  const [open, setOpen] = useState(false);
  // Opened as a card over another page (PageCardLink): the page drops its own frame.
  useEffect(() => {
    try {
      if (window.self !== window.top && window.name === "pa-card") document.documentElement.classList.add("in-card");
    } catch {}
  }, []);
  // "Back" to where the member came from (Nick, 1 Nov): pages opened from Settings, a card or another page carry ?back=.
  const [back, setBack] = useState<{ href: string; label: string } | null>(null);
  useEffect(() => {
    try {
      const b = new URLSearchParams(location.search).get("back") || "";
      if (!/^\/dashboard(\/[a-z0-9\-/]*)?(\?[a-z0-9=&%\-_.]*)?$/i.test(b)) return setBack(null);
      const to = b.includes("settings=1") ? "Back to Settings" : b.startsWith("/dashboard/profile") ? "Back to your profile" : "Back";
      setBack({ href: b, label: to });
    } catch {
      setBack(null);
    }
  }, [pathname]);
  useEffect(() => setOpen(false), [pathname]);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
  // The most specific match names the page: /dashboard/admin/library is "Library governance", not "Overview".
  const current = all.filter((i) => isActive(pathname, i)).sort((a, b) => b.href.length - a.href.length)[0];
  // Like the workspace: while the phone menu is closed, nothing in it can be reached with the keyboard or a screen reader.
  const side = useRef<HTMLElement>(null);
  useEffect(() => {
    const sync = () => {
      const closed = window.innerWidth <= 760 && !open;
      if (side.current) {
        (side.current as any).inert = closed;
        side.current.setAttribute("aria-hidden", String(closed));
      }
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [open]);
  const primary = MOBILE_PRIMARY.filter((h) => all.some((i) => i.href === h));
  const messageBadge = all.find((i) => i.href === "/dashboard/messages")?.badge || 0;

  return (
    <div id="app">
      <aside ref={side} className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
        <Link href={homeHref} className="brand" aria-label="PsyAlliance · The Hub">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workspace/assets/logo.svg" alt="PsyAlliance" />
        </Link>
        <div className="account-nav">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="nav-caption">{g.label}</div>
              <nav className="nav" aria-label={g.label}>
                {g.items.map((item) => {
                  const on = current?.href === item.href;
                  return (
                    <Link key={item.href} href={item.href} className={`nav-item${on ? " active" : ""}`} title={item.label} aria-label={item.badge ? `${item.label}, ${item.badge} unread` : item.label} aria-current={on ? "page" : undefined}>
                      <AcIcon name={ICON[item.glyph] || "layout-grid"} />
                      <span>{item.label}</span>
                      {!!item.badge && <span className="nav-count">{item.badge}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          {demoSite && (
            <div className="sandbox-note" role="note">
              <span className="note-icon"><AcIcon name="flask-conical" /></span>
              <div>
                <h3>Sandbox</h3>
                <p>Everyone here is fictional. Nothing is sent to real people.</p>
                {/* One sandbox control, the same as the workspace's (Nick, 4 Nov): no banner across the page. */}
                <div className="sandbox-controls">
                  {demoSite.label && (
                    <a className="text-link" href={`${REAL_SITE_URL}/dashboard/profile`} title="Back to your own account. Your sandbox stays open.">Leave</a>
                  )}
                  {resetSandboxAction && (
                    <a className="text-link" href="/dashboard?sandbox-restart=1">Restart</a>
                  )}
                </div>
              </div>
            </div>
          )}
          <Link href="/dashboard/profile" className="profile-button" title={displayName} aria-label={`Your profile: ${displayName}`}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="avatar self" style={{ objectFit: "cover" }} />
            ) : (
              <span className="avatar self" aria-hidden="true">{initials}</span>
            )}
            <span>
              <strong>{displayName}</strong>
              {verificationLabel && <small>{verificationLabel}</small>}
            </span>
            <AcIcon name="user-round" />
          </Link>
          {/* One Settings, the same as the workspace's (Nick, 1 Nov): it opens over this page and comes back here. */}
          <a href={`/dashboard?settings=1&back=${encodeURIComponent(pathname)}`} className="button text small settings-link">
            {demoSite ? "Settings & preview controls" : "Settings"}
          </a>
          <form action={signOutAction} hidden>
            <button type="submit" className="sign-out">Sign out</button>
          </form>
        </div>
      </aside>
      {open && <button type="button" className="mobile-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}

      <div className="workspace feature-account">
        <header className="topbar">
          <div className="breadcrumbs">
            {current && current.href !== "/dashboard/profile" ? current.group : "Your account"} <AcIcon name="chevron-right" size={14} /> <strong>{(current && current.href !== "/dashboard/profile" ? current.label : PAGE_LABEL[pathname.split("/").slice(0, 3).join("/")]) || "Account"}</strong>
          </div>
          <div className="mobile-brand">
            <button type="button" className="icon-button mobile-menu" ref={opener} onClick={() => setOpen((o) => !o)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open}>
              <AcIcon name="menu" size={20} />
            </button>
            <Link href={homeHref} aria-label="PsyAlliance · The Hub">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/workspace/assets/logo.svg" alt="PsyAlliance" />
            </Link>
          </div>
          <div className="top-actions">
            {demoSite && (
              <span className="sandbox-chip" role="note" title="Sandbox: everyone here is fictional and nothing is sent to real people">
                <AcIcon name="flask-conical" size={14} />
                <b>Sandbox</b>
              </span>
            )}
            <Link href="/dashboard?search=1" className="top-search" aria-label="Search">
              <AcIcon name="search" size={15} />
              <span className="top-search-text">Search colleagues, referrals, cover, consults, Library</span>
              <kbd>⌘ K</kbd>
            </Link>
            <span className="top-date" suppressHydrationWarning>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })}
            </span>
            <span className="top-divider" />
            <Link href="/dashboard?search=1" className="mobile-search" aria-label="Search">
              <AcIcon name="search" size={18} />
              <span>Search</span>
            </Link>
            <Link
              href="/dashboard?notifications=1"
              className="icon-button"
              data-bell=""
              aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : "Notifications"}
            >
              <AcIcon name="bell" size={18} />
              {unreadNotifications > 0 && <span className="notification-dot" />}
            </Link>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="avatar self sm" style={{ objectFit: "cover" }} />
            ) : (
              <span className="avatar self sm" aria-hidden="true">{initials}</span>
            )}
          </div>
        </header>

        {demoView && (
          <div className="demo-bar" role="status">
            Demo network: everyone you see here is fake. <Link href="/dashboard/settings#demo">Switch back to the real network</Link>
          </div>
        )}
        {/* The waiting-for-review notice now lives in the Hub's Actions (Profile setup), not as a banner (Nick, 1 Nov). */}
        {back && (
          <div className="back-bar">
            <a href={back.href} data-back="">
              <AcIcon name="arrow-left" size={16} /> {back.label}
            </a>
          </div>
        )}
        <div className="pa account-page">
          <main id="main" className="page" tabIndex={-1}>
            <RelationshipProvider value={relationships}>
              <HubProvider value={hub}>{children}</HubProvider>
            </RelationshipProvider>
          </main>
        </div>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primary.map((href) => (
          <Link key={href} href={href} className={current?.href === href ? "active" : ""} aria-current={current?.href === href ? "page" : undefined}>
            <AcIcon name={MOBILE_ICON[href] || "layout-grid"} size={20} />
            <span>{MOBILE_LABEL[href] || href}</span>
            {href === "/dashboard/messages" && messageBadge > 0 && <b className="mobile-badge" aria-label={`${messageBadge} unread messages`}>{messageBadge}</b>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
