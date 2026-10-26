import WorkspaceHost from "@/workspace/WorkspaceHost";
import { loadWorkspaceBoot } from "@/workspace/server/boot";

// The member's workspace: loaded once for the visit, as that member. Moving
// between its sections never reloads it; each section's page is only a URL.
export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardLayout({ children }: { children: React.ReactNode }) {
  const boot = await loadWorkspaceBoot("/dashboard");
  return (
    <>
      <WorkspaceHost boot={boot} />
      {children}
    </>
  );
}
