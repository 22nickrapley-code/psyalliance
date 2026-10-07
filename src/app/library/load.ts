import { createClient } from "@/lib/supabase/server";
import type { PublicDoc } from "@/lib/library";

// Listed templates, as the public sees them (never file paths).
export async function loadPublicLibrary(): Promise<PublicDoc[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_library");
  return ((data as PublicDoc[]) || []).map((d) => ({ ...d, contents: d.contents || [] }));
}

// Search-friendly titles for the templates people look for by name.
const SEO_TITLES: Record<string, string> = {
  "PA-01": "Reciprocal Coverage Agreement for Psychologists",
  "PA-02": "Extended Leave Plan and Clinical Handoff Templates for Therapists",
  "PA-03": "Professional Will Template for Psychologists",
  "PA-07": "Referral and Termination Letter Templates for Psychologists",
  "PA-09": "Informed Consent for Psychotherapy Template",
  "PA-10": "Telepsychology Consent and PSYPACT Checklist",
  "PA-11": "AI Scribe Consent and Practice Policy for Therapists",
  "PA-13": "Suicide Risk Assessment and Safety Plan Templates",
  "PA-15": "Good Faith Estimate and Superbill Templates for Therapists",
  "PA-17": "HIPAA Notice of Privacy Practices Template for Therapists",
  "PA-18": "HIPAA Security Risk Analysis for Small Practices",
  "PA-20": "Responding to a Subpoena: A Guide for Psychologists",
};

export function seoTitle(d: PublicDoc) {
  return SEO_TITLES[d.code] || `${d.title} for Psychologists and Psychiatrists`;
}
