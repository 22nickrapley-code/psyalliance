import type { ReactNode } from "react";

// Plain data + icons for the sidebar nav - deliberately NOT a "use client"
// file. It's imported directly from the server-rendered dashboard layout to
// build the `groups` prop, and Next.js replaces every export of a "use
// client" module (not just the default component) with a client-only
// reference when a Server Component imports it - calling a plain helper
// function like buildNavGroups() from server code would break at runtime
// under production bundling even though it's fine in local dev. Keeping this
// logic in its own server-safe module and having sidebar-nav.tsx (the actual
// client component) just render the pre-built `groups` prop avoids that.

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const icon = {
  overview: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  profile: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  ),
  messages: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16v10a1 1 0 0 1-1 1H9l-4.5 4v-4H5a1 1 0 0 1-1-1v-10Z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  ),
  caseload: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="6" width="17" height="14" rx="1.5" />
      <path d="M8 6V4.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M3.5 11h17" />
    </svg>
  ),
  income: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5v19" />
      <path d="M16.5 6.5c0-1.7-2-3-4.5-3s-4.5 1.2-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
    </svg>
  ),
  capacity: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  ),
  credentials: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4.5 6v6c0 4.7 3.2 8.4 7.5 9 4.3-.6 7.5-4.3 7.5-9V6L12 3Z" />
      <path d="m9 12 2 2 4-4.2" />
    </svg>
  ),
  documents: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2.75h7.2L18.5 7v13.25a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" />
      <path d="M14 2.75V7h4.5" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 18.5h4.5" />
    </svg>
  ),
  network: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="m8 8.5 2.5 7M16 8.5l-2.5 7M8.5 7h7" />
    </svg>
  ),
  townhall: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16v9.5a1 1 0 0 1-1 1H9l-4 3.5v-3.5H5a1 1 0 0 1-1-1V5.5Z" />
    </svg>
  ),
  referrals: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h13" />
      <path d="m12 6 7 6-7 6" />
    </svg>
  ),
  planner: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="16" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
      <path d="M7.5 13.5h3M7.5 17h3M13.5 13.5h3" />
    </svg>
  ),
  settings: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 17.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.9a1.7 1.7 0 0 0 1-1.55V3.2a2 2 0 1 1 4 0v.15c0 .68.4 1.28 1 1.55.63.28 1.37.16 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.5.5-.62 1.24-.34 1.87.27.6.87 1 1.55 1h.1a2 2 0 1 1 0 4h-.09c-.68 0-1.28.4-1.55 1Z" />
    </svg>
  ),
  supervision: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="6.5" r="2.3" />
      <path d="M3 20c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5" />
      <path d="M13.5 20c.3-2.7 2-4.5 4.2-4.5" />
    </svg>
  ),
  verification: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12.5 11 14.5 15.5 9.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  adminOverview: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.2" />
    </svg>
  ),
  members: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M2.5 20c.5-3.6 2.8-5.8 5.5-5.8s5 2.2 5.5 5.8" />
      <path d="M14.5 20c.3-2.7 1.7-4.5 3.7-4.9" />
    </svg>
  ),
  providers: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4.5 6v6c0 4.7 3.2 8.4 7.5 9 4.3-.6 7.5-4.3 7.5-9V6L12 3Z" />
      <path d="M12 8v5M9.5 10.5h5" />
    </svg>
  ),
  requests: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21c4-2.6 7.5-5.7 7.5-10A5.5 5.5 0 0 0 12 6.3 5.5 5.5 0 0 0 4.5 11c0 4.3 3.5 7.4 7.5 10Z" />
      <path d="M9.5 11h5M12 8.5v5" />
    </svg>
  ),
  consult: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="12" r="4.2" />
      <circle cx="16.5" cy="12" r="4.2" />
    </svg>
  ),
  availability: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="16" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
      <path d="m8 14 2.5 2.5L16 11.5" />
    </svg>
  ),
  library: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5h4.5v15H4z" />
      <path d="M10 4.5h4.5v15H10z" />
      <path d="m16.3 5 3.7 14.5-4.3 1.1L12 6.1z" />
    </svg>
  ),
  notifications: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10a6 6 0 0 1 12 0c0 3.5 1 5 1.8 6H4.2c.8-1 1.8-2.5 1.8-6Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  ),
};

// Rebuild Phase 5 (navigation). Master Brief's new primary destinations:
// Home / Requests / Network / Consult / Messages - always visible, always
// first. Everything that used to compete with them for top billing
// (Caseload, Income, Capacity, Town Hall, the standalone Planner,
// Supervision, the old bulletin-board Referrals page) is kept reachable
// under "Legacy" rather than deleted outright - Addendum A8 / Master
// Brief's own instruction is "do not start by deleting features"; actual
// removal is Phase 18, once every new module has fully replaced what it's
// standing in for. "Overview" is relabelled "Home" here at the nav level
// only - the page itself (dashboard/page.tsx) is still the old Overview
// content until the Phase 6 Home rebuild.
export function buildNavGroups(
  isAdmin: boolean,
  unreadMessageCount = 0,
  pendingRequestsCount = 0,
  unreadNotificationCount = 0
): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "PsyAlliance",
      items: [
        { href: "/dashboard", label: "Home", icon: icon.overview },
        { href: "/dashboard/notifications", label: "Notifications", icon: icon.notifications, badge: unreadNotificationCount },
        { href: "/dashboard/requests", label: "Requests", icon: icon.requests, badge: pendingRequestsCount },
        { href: "/dashboard/network", label: "Network", icon: icon.network },
        { href: "/dashboard/consult", label: "Consult", icon: icon.consult },
        { href: "/dashboard/messages", label: "Messages", icon: icon.messages, badge: unreadMessageCount },
      ],
    },
    {
      label: "My practice",
      items: [
        { href: "/dashboard/profile", label: "My Profile", icon: icon.profile },
        { href: "/dashboard/credentials", label: "Credentials", icon: icon.credentials },
        { href: "/dashboard/availability", label: "Availability", icon: icon.availability },
        { href: "/dashboard/documents", label: "Library", icon: icon.library },
      ],
    },
    {
      label: "Account",
      items: [{ href: "/dashboard/settings", label: "Settings", icon: icon.settings }],
    },
    {
      label: "Legacy",
      items: [
        { href: "/dashboard/caseload", label: "Caseload", icon: icon.caseload },
        { href: "/dashboard/referrals", label: "Referrals (old)", icon: icon.referrals },
        { href: "/dashboard/town-hall", label: "Town Hall", icon: icon.townhall },
        { href: "/dashboard/planner", label: "Planner", icon: icon.planner },
        { href: "/dashboard/planner/coverage-plans", label: "Coverage plans (old)", icon: icon.planner },
        { href: "/dashboard/capacity", label: "Capacity & Overhead", icon: icon.capacity },
        { href: "/dashboard/income", label: "Income", icon: icon.income },
        { href: "/dashboard/supervision", label: "Supervision", icon: icon.supervision },
      ],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: "Admin",
      items: [
        {
          href: "/dashboard/admin",
          label: "Admin overview",
          icon: icon.adminOverview,
        },
        {
          href: "/dashboard/admin/verifications",
          label: "Verification queue",
          icon: icon.verification,
        },
        {
          href: "/dashboard/admin/members",
          label: "All members",
          icon: icon.members,
        },
        {
          href: "/dashboard/admin/referring-providers",
          label: "Referring providers",
          icon: icon.providers,
        },
      ],
    });
  }

  return groups;
}
