// Practice Library (Product Spec v1). Curated, reviewed resources, each a
// card with a PA number, purpose, who it applies to, version, review date
// and a route into the workflow it supports.

export type LibraryResource = {
  id: number;
  code: string;
  title: string;
  summary: string;
  category: string;
  audience: string;
  tags: string[];
  version: number;
  reviewDate: string | null;
  nextReviewDate: string | null;
  storagePath: string;
};

// The seven workflow placements from the spec, plus PA-03 and PA-06 which
// sit naturally beside Cover and Supervision.
export const WORKFLOW: Record<string, { label: string; href: string }> = {
  "PA-01": { label: "Go to Cover", href: "/dashboard/cover/new" },
  "PA-02": { label: "Plan cover", href: "/dashboard/cover/new" },
  "PA-03": { label: "Go to Cover", href: "/dashboard/cover" },
  "PA-04": { label: "Consultation groups", href: "/dashboard/consult/groups" },
  "PA-05": { label: "Ask a question", href: "/dashboard/consult/new" },
  "PA-06": { label: "Supervision", href: "/dashboard/consult?tab=supervision" },
  "PA-07": { label: "Refer a patient", href: "/dashboard/refer/new" },
  "PA-08": { label: "Refer a patient", href: "/dashboard/refer/new" },
  "PA-19": { label: "Your credentials", href: "/dashboard/credentials" },
};

export const CATEGORIES = [
  "Coverage & Continuity",
  "Consultation & Collaboration",
  "Clinical Practice",
  "Regulatory & Compliance",
  "Business & Practice Management",
];

export function libraryHref(code: string) {
  return `/dashboard/documents/${encodeURIComponent(code)}`;
}

export function cleanTitle(title: string) {
  return title.replace(/^PA-\d+:\s*/, "");
}

// Members only ever see a resource with a recorded review (spec trust rule
// "Reviewed resources only"). Drafts and anything without a review date
// stay hidden.
export function isMemberVisible(d: { review_status?: string | null; review_date?: string | null }) {
  return d.review_status === "published" && !!d.review_date;
}

export function toResource(d: any): LibraryResource {
  return {
    id: d.id,
    code: d.library_code || "",
    title: cleanTitle(String(d.title || "")),
    summary: d.summary || d.applicability || "",
    category: d.category || "Practice",
    audience: d.audience || "",
    tags: d.tags || [],
    version: d.version || 1,
    reviewDate: d.review_date || null,
    nextReviewDate: d.next_review_date || null,
    storagePath: d.storage_path,
  };
}

export function matchesQuery(r: LibraryResource, q: string) {
  if (!q) return true;
  const hay = [r.code, r.title, r.summary, r.category, r.audience, ...r.tags].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const LIBRARY_SELECT =
  "id, title, library_code, summary, category, audience, tags, version, review_date, next_review_date, review_status, storage_path, applicability";
