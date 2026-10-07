import "../../premium.css";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { OverflowPublicView, type OverflowData } from "./view";


async function load(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("overflow_page", { p_slug: slug });
  return data as OverflowData | null;
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const d = await load(slug);
  if (!d) return { title: "Page not found", robots: { index: false, follow: false } };
  const name = clinicianName(d.owner.name, d.owner.qualification, d.owner.prefix);
  return {
    title: `${name}: colleagues with openings`,
    description: `${name} isn't taking new clients right now. These colleagues they trust have openings.`,
    robots: { index: false, follow: false },
  };
}


// The public page a member links from their voicemail, auto-reply and
// directory profile: no sign-in, no client details.
export default async function OverflowPublicPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const d = await load(slug);
  if (!d) notFound();
  return <OverflowPublicView d={d} />;
}

