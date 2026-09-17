"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

type NavGroup = {
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
};

export function buildNavGroups(isAdmin: boolean, unreadMessageCount = 0): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [
        { href: "/dashboard", label: "Overview", icon: icon.overview },
        { href: "/dashboard/messages", label: "Messages", icon: icon.messages, badge: unreadMessageCount },
      ],
    },
    {
      label: "My practice",
      items: [
        { href: "/dashboard/profile", label: "Profile", icon: icon.profile },
        { href: "/dashboard/caseload", label: "Caseload", icon: icon.caseload },
        { href: "/dashboard/income", label: "Income", icon: icon.income },
        { href: "/dashboard/capacity", label: "Capacity & overhead", icon: icon.capacity },
        { href: "/dashboard/credentials", label: "Credentials", icon: icon.credentials },
        { href: "/dashboard/documents", label: "Documents", icon: icon.documents },
      ],
    },
    {
      label: "Network",
      items: [
        { href: "/dashboard/network", label: "Network", icon: icon.network },
        { href: "/dashboard/town-hall", label: "Town Hall", icon: icon.townhall },
        { href: "/dashboard/referrals", label: "Referrals", icon: icon.referrals },
        { href: "/dashboard/planner", label: "Planner", icon: icon.planner },
        { href: "/dashboard/supervision", label: "Supervision", icon: icon.supervision },
      ],
    },
    {
      label: "Account",
      items: [{ href: "/dashboard/settings", label: "Settings", icon: icon.settings }],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: "Admin",
      items: [
        {
          href: "/dashboard/admin/verifications",
          label: "Verification queue",
          icon: icon.verification,
        },
      ],
    });
  }

  return groups;
}

export default function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
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
  );
}
