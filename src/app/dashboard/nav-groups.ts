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
  unreadMessages: number;
  pendingCoverRequests: number;
  pendingReferrals: number;
}): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { href: "/dashboard", label: "Home", glyph: "⌂" },
        { href: "/dashboard/cover", label: "Cover", glyph: "◇", badge: opts.pendingCoverRequests },
        { href: "/dashboard/refer", label: "Refer", glyph: "↗", badge: opts.pendingReferrals },
        { href: "/dashboard/network", label: "Network", glyph: "◎", matches: ["/dashboard/people"] },
        { href: "/dashboard/consult", label: "Consult", glyph: "✳" },
        { href: "/dashboard/messages", label: "Messages", glyph: "✉", badge: opts.unreadMessages },
      ],
    },
    {
      label: "Your practice",
      items: [
        { href: "/dashboard/profile", label: "Profile", glyph: "○" },
        { href: "/dashboard/availability", label: "Availability", glyph: "◷" },
        { href: "/dashboard/credentials", label: "Credentials", glyph: "◈" },
        { href: "/dashboard/documents", label: "Practice Library", glyph: "▤" },
        { href: "/dashboard/settings", label: "Settings", glyph: "⚙" },
      ],
    },
  ];

  if (opts.isAdmin) {
    groups.push({
      label: "Admin",
      items: [
        { href: "/dashboard/admin", label: "Admin overview", glyph: "▣" },
        { href: "/dashboard/admin/invitations", label: "Invitations", glyph: "✉" },
        { href: "/dashboard/admin/verifications", label: "Verification", glyph: "✓" },
        { href: "/dashboard/admin/members", label: "Members", glyph: "☷" },
        { href: "/dashboard/admin/library", label: "Library governance", glyph: "▤" },
        { href: "/dashboard/admin/moderation", label: "Moderation", glyph: "⚑" },
        { href: "/dashboard/admin/network-health", label: "Network health", glyph: "∿" },
      ],
    });
  }

  return groups;
}

// The five destinations on the mobile bottom bar.
export const MOBILE_PRIMARY = ["/dashboard", "/dashboard/cover", "/dashboard/refer", "/dashboard/consult", "/dashboard/messages"];
