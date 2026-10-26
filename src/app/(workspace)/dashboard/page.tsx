import Workspace from "@/workspace/Workspace";
import { loadWorkspaceBoot } from "@/workspace/server/boot";

export const dynamic = "force-dynamic";

export default async function Page() {
  const boot = await loadWorkspaceBoot("/dashboard");
  return <Workspace mode="live" boot={boot} view="home" />;
}
