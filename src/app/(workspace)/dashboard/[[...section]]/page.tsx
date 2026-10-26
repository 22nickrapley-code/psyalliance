import { notFound, redirect } from "next/navigation";
import { SECTIONS, legacyDestination } from "@/workspace/routes";

// Each section of the workspace is a URL; the workspace itself is mounted by
// the layout, so these pages render nothing of their own. Links from earlier
// versions (emails, notifications, bookmarks) land here and are sent to the
// matching place in the new workspace.
export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { section = [] } = await params;
  const sp = await searchParams;
  const dest = legacyDestination(section, sp);
  if (dest) redirect(dest);
  if (section.length > 1 || (section.length === 1 && !SECTIONS.includes(section[0] as any))) notFound();
  return null;
}
