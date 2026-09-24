import { notFound } from "next/navigation";
import PremiumShell from "../../../dashboard/premium-shell";
import { buildNavGroups } from "../../../dashboard/nav-groups";
import { previewScreens } from "./screens";
import "../../../premium.css";

// Development-only visual preview of member screens with fixture data, so
// each rebuilt screen can be screenshotted and reviewed without a signed-in
// session or a database. Returns 404 in production builds.
async function noopSignOut() {
  "use server";
}

export default async function PreviewPage({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen } = await params;
  const render = previewScreens[screen];
  if (!render) notFound();
  const groups = buildNavGroups({ isAdmin: false, unreadMessages: 2, pendingCoverRequests: 1, pendingReferrals: 0 });
  return (
    <PremiumShell
      groups={groups}
      displayName="Alex Rivers, PsyD"
      initials="AR"
      avatarUrl={null}
      verificationLabel="Verified"
      unreadNotifications={2}
      signOutAction={noopSignOut}
    >
      {render()}
    </PremiumShell>
  );
}
