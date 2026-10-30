import { IS_DEMO_SITE } from "@/lib/env";
// Navigation for the member workspace (Product Spec v1, "Site map").
// Plain data, deliberately NOT a "use client" module: the server-rendered
// dashboard layout builds the groups here and passes them to the client
// shell as a prop (importing a helper from a "use client" file into server
// code breaks under production bundling).
//
// Your workspace: the same seven places, with the same names, as the approved
// workspace (version 13). Your practice: the pages the workspace does not
// cover (profile with availability, credentials and the continuity plan
// inside it, My documents, Demos and Settings).

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
  // "I know my way around" on the Demos page.
  hideDemos?: boolean;
}): NavGroup[] {
  const adminItems: NavItem[] = [
    { href: "/dashboard/admin", label: "Overview", glyph: "overview" },
    ...(IS_DEMO_SITE ? [{ href: "/dashboard/admin/sandbox", label: "Sandbox passes", glyph: "pass" }] : [{ href: "/dashboard/admin/states", label: "States", glyph: "pulse" }, { href: "/dashboard/admin/invitations", label: "Invitations", glyph: "pass" }]),
    { href: "/dashboard/admin/verifications", label: "Verification", glyph: "check" },
    { href: "/dashboard/admin/members", label: "Members", glyph: "members" },
    { href: "/dashboard/admin/library", label: "Library governance", glyph: "library" },
    { href: "/dashboard/admin/library-leads", label: "Library leads", glyph: "library" },
    { href: "/dashboard/admin/moderation", label: "Moderation", glyph: "flag" },
    { href: "/dashboard/admin/insurance-requests", label: "Insurance requests", glyph: "check" },
    { href: "/dashboard/admin/channel-requests", label: "Channel requests", glyph: "flag" },
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
      label: "Your workspace",
      items: [
        { href: "/dashboard", label: "The Hub", glyph: "home", matches: ["/dashboard/overview", "/dashboard/full"] },
        { href: "/dashboard/referrals", label: "Referrals", glyph: "refer" },
        { href: "/dashboard/cover", label: "Cover", glyph: "cover" },
        { href: "/dashboard/consult", label: "Consult", glyph: "consult" },
        { href: "/dashboard/network", label: "Network / Search", glyph: "members", matches: ["/dashboard/people", "/dashboard/invite"] },
        { href: "/dashboard/messages", label: "Messages", glyph: "messages", badge: opts.unreadMessages, matches: ["/dashboard/notifications"] },
        { href: "/dashboard/library", label: "Library", glyph: "library" },
      ],
    },
    {
      label: "Your practice",
      items: [
        { href: "/dashboard/profile", label: "Profile", glyph: "profile", matches: ["/dashboard/availability", "/dashboard/credentials", "/dashboard/continuity"] },
        { href: "/dashboard/documents?tab=mine", label: "My documents", glyph: "library", matches: ["/dashboard/documents"] },
        ...(opts.hideDemos ? [] : [{ href: "/dashboard/demos", label: "Demos", glyph: "play" } as NavItem]),
        { href: "/dashboard/settings", label: "Settings", glyph: "settings" },
      ],
    },
  ];

  if (opts.isAdmin) groups.push({ label: "Admin", items: adminItems });

  return groups;
}

// The five destinations on the mobile bottom bar.
export const MOBILE_PRIMARY = ["/dashboard", "/dashboard/referrals", "/dashboard/cover", "/dashboard/consult", "/dashboard/messages"];
