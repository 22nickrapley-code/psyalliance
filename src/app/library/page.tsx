import "../premium.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { loadPublicLibrary } from "./load";
import { PublicLibraryView } from "./view";

export const metadata = {
  title: "Practice Library: templates for psychologists and psychiatrists",
  description:
    "Twenty templates for independent practice, from a professional will to a reciprocal cover agreement, informed consent and HIPAA. Each shows whether it has been independently reviewed.",
  alternates: { canonical: "/library" },
};

export default async function PublicLibraryPage(props: { searchParams: Promise<{ q?: string }> }) {
  // The Library's public pages live on the real site.
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/library`);
  const sp = await props.searchParams;
  const docs = await loadPublicLibrary();
  return <PublicLibraryView docs={docs} q={(sp.q || "").slice(0, 80)} />;
}
