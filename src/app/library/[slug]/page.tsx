import "../../premium.css";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { codeFromSlug, docSlug } from "@/lib/library";
import { loadPublicLibrary, seoTitle } from "../load";
import { PublicResourceView } from "../view";

async function find(slug: string) {
  const code = codeFromSlug(slug);
  if (!code) return { d: null, related: [] };
  const docs = await loadPublicLibrary();
  const d = docs.find((x) => x.code === code) || null;
  return { d, related: d ? docs.filter((x) => x.category === d.category && x.code !== d.code).slice(0, 3) : [] };
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { d } = await find(slug);
  if (!d) return { title: "Template not found", robots: { index: false, follow: false } };
  return {
    title: seoTitle(d),
    description: d.summary.slice(0, 300),
    alternates: { canonical: `/library/${docSlug(d.code)}` },
  };
}

// One public template page: what's inside, who it's for, its review
// status, and a download (once reviewed and turned on) or a way to hear
// when it's free. Addressed by name (/library/professional-will); older
// links by PA number land on the named address.
export default async function PublicResourcePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/library/${encodeURIComponent(slug)}`);
  const code = codeFromSlug(slug);
  if (code && slug !== docSlug(code)) permanentRedirect(`/library/${docSlug(code)}`);
  const { d, related } = await find(slug);
  if (!d) notFound();
  return <PublicResourceView d={d} related={related} />;
}
