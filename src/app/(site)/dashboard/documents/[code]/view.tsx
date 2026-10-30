import { notFound, redirect } from "next/navigation";
import { codeFromSlug } from "@/lib/library";

export const metadata = { title: "Library" };

// A resource has one address now: the Library, opened on that resource. The old address, by name or by PA number,
// lands there. A code that does not exist is a plain not-found.
export default async function ResourcePage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const c = codeFromSlug(code);
  if (!c) notFound();
  redirect(`/dashboard/library?resource=${c}`);
}
