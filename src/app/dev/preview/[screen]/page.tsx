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

async function noopReset() {
  "use server";
}

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ sandbox?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen } = await params;
  // ?sandbox=1 shows the sandbox band above the screen.
  const sandbox = (await searchParams).sandbox === "1";
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
      demoSite={sandbox ? { label: "Nick", expires: "Oct 17", who: "Alex Rivers, PsyD", role: "Clinical psychologist in Brooklyn" } : null}
      resetSandboxAction={sandbox ? noopReset : undefined}
    >
      {render()}
    </PremiumShell>
  );
}
