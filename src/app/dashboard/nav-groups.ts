import { IS_DEMO_SITE } from "@/lib/env";
// Navigation for the member workspace (Product Spec v1, "Site map").
// Plain data, deliberately NOT a "use client" module: the server-rendered
// dashboard layout builds the groups here and passes them to the client
// shell as a prop (importing a helper from a "use client" file into server
// code breaks under production bundling).
//
// Six product tabs, then "Your practice". There is no Legacy group:
// Income, Capacity, Caseload, Planner and the old Referrals/Coverage pages
// are retired, and Town Hall and Supervision move into Consult.

export type NavItem = {
  href: string;
  label: string;
  glyph: string;
  badge?: number;
  // Extra path prefixes that should also highlight this item (e.g. the
  // Cover tab while its screens still live under /dashboard/requests).
  matches?: string[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export function buildNavGroups(opts: {
  isAdmin: boolean;
  isOperator?: boolean;
  unreadMessages: number;
  pendingCoverRequests: number;
  pendingReferrals: number;
}): NavGroup[] {
  const adminItems: NavItem[] = [
    { href: "/dashboard/admin", label: "Overview", glyph: "overview" },
    ...(IS_DEMO_SITE ? [{ href: "/dashboard/admin/sandbox", label: "Sandbox passes", glyph: "pass" }] : [{ href: "/dashboard/admin/states", label: "States", glyph: "pulse" }, { href: "/dashboard/admin/invitations", label: "Invitations", glyph: "pass" }]),
    { href: "/dashboard/admin/verifications", label: "Verification", glyph: "check" },
    { href: "/dashboard/admin/members", label: "Members", glyph: "members" },
    { href: "/dashboard/admin/library", label: "Library governance", glyph: "library" },
    { href: "/dashboard/admin/library-leads", label: "Library leads", glyph: "library" },
    { href: "/dashboard/admin/moderation", label: "Moderation", glyph: "flag" },
    { href: "/dashboard/admin/network-health", label: "Network health", glyph: "pulse" },
    { href: "/dashboard/admin/activation", label: "Activation", glyph: "check" },
  ];

  // An operator (admin-only) login has no practice, so it sees the admin
  // console and its own account settings, nothing clinical.
  if (opts.isOperator) {
    return [
      { label: "Admin", items: adminItems },
      { label: "Account", items: [{ href: "/dashboard/settings", label: "Settings", glyph: "settings" }] },
    ];
  }

  const groups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { href: "/dashboard", label: "Home", glyph: "home" },
        { href: "/dashboard/cover", label: "Cover", glyph: "cover", badge: opts.pendingCoverRequests },
        { href: "/dashboard/refer", label: "Refer", glyph: "refer", badge: opts.pendingReferrals },
        { href: "/dashboard/network", label: "Network", glyph: "network", matches: ["/dashboard/people", "/dashboard/invite"] },
        { href: "/dashboard/consult", label: "Consult", glyph: "consult" },
        { href: "/dashboard/messages", label: "Messages", glyph: "messages", badge: opts.unreadMessages },
      ],
    },
    {
      label: "Your practice",
      items: [
        { href: "/dashboard/profile", label: "Profile", glyph: "profile" },
        { href: "/dashboard/availability", label: "Availability", glyph: "availability" },
        { href: "/dashboard/continuity", label: "Continuity plan", glyph: "continuity" },
        { href: "/dashboard/full", label: "When you're full", glyph: "overflow" },
        { href: "/dashboard/credentials", label: "Credentials", glyph: "credentials" },
        { href: "/dashboard/documents", label: "Practice Library", glyph: "library" },
        { href: "/dashboard/settings", label: "Settings", glyph: "settings" },
      ],
    },
  ];

  if (opts.isAdmin) groups.push({ label: "Admin", items: adminItems });

  return groups;
}

// The five destinations on the mobile bottom bar.
export const MOBILE_PRIMARY = ["/dashboard", "/dashboard/cover", "/dashboard/refer", "/dashboard/consult", "/dashboard/messages"];
