import { createClient } from "@/lib/supabase/server";

const RESOURCE_PURPOSE: Record<string, string> = {
  "PA-01": "Coverage planning",
  "PA-02": "Covering clinician agreement",
  "PA-04": "Peer group charter",
  "PA-05": "Consultation framework",
  "PA-07": "Referral handoff",
  "PA-08": "Colleague communication",
  "PA-19": "Credential review",
};

// Only reviewed, published versions appear in a workflow. The database's
// Library review gate also controls visibility if a version is withdrawn.
export default async function WorkflowResources({ codes }: { codes: string[] }) {
  const wanted = [...new Set(codes.filter((code) => code in RESOURCE_PURPOSE))];
  if (!wanted.length) return null;
  const supabase = await createClient();
  const { data: resources } = await supabase.from("documents")
    .select("id,title,version,review_date")
    .eq("owner_scope", "world").eq("review_status", "published")
    .or(wanted.map((code) => `title.ilike.${code}%`).join(","))
    .order("version", { ascending: false });
  const current = new Map<string, NonNullable<typeof resources>[number]>();
  for (const resource of resources || []) {
    const code = /^PA-\d\d/.exec(resource.title)?.[0];
    if (code && !current.has(code)) current.set(code, resource);
  }
  return <aside className="workflow-resources" aria-label="Practice Library guidance">
    <div>
      <span className="section-kicker">Practice Library</span>
      <h2>Guidance for this step</h2>
      <p>Use a current reviewed resource alongside your professional judgment. Keep patient details in your established secure systems.</p>
    </div>
    <div className="workflow-resource-links">{wanted.map((code) => {
      const resource = current.get(code);
      return resource ? <a key={code} href={`/dashboard/documents/${resource.id}/open`} target="_blank" rel="noreferrer">
        <strong>{code} · {RESOURCE_PURPOSE[code]}</strong>
        <span>Reviewed {resource.review_date || "date pending"} · v{resource.version} ↗</span>
      </a> : <div key={code} className="workflow-resource-pending">
        <strong>{code} · {RESOURCE_PURPOSE[code]}</strong>
        <span>Under independent review</span>
      </div>;
    })}</div>
    <a className="workflow-resource-browse" href="/dashboard/documents">Browse Practice Library →</a>
  </aside>;
}
