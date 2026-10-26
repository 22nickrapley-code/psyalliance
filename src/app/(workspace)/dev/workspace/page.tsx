import { notFound } from "next/navigation";
import Workspace from "@/workspace/Workspace";

// Fixture-mode workspace for visual comparison with the frozen reference.
// Only on staging builds that set WORKSPACE_FIXTURE_PREVIEW=1; 404 elsewhere.
export const dynamic = "force-dynamic";
export default function FixtureWorkspace() {
  if (process.env.WORKSPACE_FIXTURE_PREVIEW !== "1") notFound();
  return <Workspace mode="fixture" />;
}
