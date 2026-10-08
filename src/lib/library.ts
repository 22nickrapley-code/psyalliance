import { APP_TIME_ZONE } from "./dates";
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
  reviewed: boolean;
  reviewDate: string | null;
  nextReviewDate: string | null;
  storagePath: string;
  contents?: string[];
};

// The seven workflow placements from the spec, plus PA-03 and PA-06 which
// sit naturally beside Cover and Supervision.
export const WORKFLOW: Record<string, { label: string; href: string }> = {
  "PA-01": { label: "Go to Cover", href: "/dashboard/cover/new" },
  "PA-02": { label: "Plan cover", href: "/dashboard/cover/new" },
  "PA-03": { label: "Continuity plan", href: "/dashboard/continuity" },
  "PA-04": { label: "Consultation groups", href: "/dashboard/consult/groups" },
  "PA-05": { label: "Ask a question", href: "/dashboard/consult/new" },
  "PA-06": { label: "Supervision", href: "/dashboard/consult?tab=supervision" },
  "PA-07": { label: "Refer a client", href: "/dashboard/refer/new" },
  "PA-08": { label: "Refer a client", href: "/dashboard/refer/new" },
  "PA-19": { label: "Your credentials", href: "/dashboard/credentials" },
};

// The same placements described for the public pages, as plain words
// rather than links into the app.
export const PUBLIC_WORKFLOW: Record<string, string> = {
  "PA-01": "Cover",
  "PA-02": "Cover",
  "PA-03": "the continuity plan",
  "PA-04": "Consultation groups",
  "PA-05": "Ask a question",
  "PA-06": "Supervision",
  "PA-07": "Refer",
  "PA-08": "Refer",
  "PA-19": "Credentials",
};

// What a public visitor sees of a listed template (never a file path).
export type PublicDoc = {
  code: string;
  title: string;
  summary: string;
  category: string;
  audience: string;
  contents: string[];
  reviewed: boolean;
  review_date: string | null;
  reviewers: string[] | null;
  downloadable: boolean;
  version: number;
};

export const SHORT_CATEGORY: Record<string, string> = {
  "Coverage & Continuity": "Coverage",
  "Consultation & Collaboration": "Consultation",
  "Clinical Practice": "Clinical practice",
  "Regulatory & Compliance": "Compliance",
  "Business & Practice Management": "Business",
};

export function monthYear(d: string | null) {
  if (!d) return "";
  return new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: d.length === 10 ? "UTC" : APP_TIME_ZONE });
}

export const CATEGORIES = [
  "Coverage & Continuity",
  "Consultation & Collaboration",
  "Clinical Practice",
  "Regulatory & Compliance",
  "Business & Practice Management",
];

// Each template's everyday name and web address. PA numbers stay as
// internal references (Admin, the database, lead sources); people see
// names.
export const LIBRARY_NAMES: Record<string, { name: string; slug: string }> = {
  "PA-01": { name: "Reciprocal Coverage Agreement", slug: "reciprocal-coverage-agreement" },
  "PA-02": { name: "Extended Leave Pack", slug: "extended-leave-pack" },
  "PA-03": { name: "Professional Will", slug: "professional-will" },
  "PA-04": { name: "Consultation Group Charter", slug: "consultation-group-charter" },
  "PA-05": { name: "Case Consultation Template", slug: "case-consultation-template" },
  "PA-06": { name: "Supervision Agreement", slug: "supervision-agreement" },
  "PA-07": { name: "Referral and Termination Letters", slug: "referral-and-termination-letters" },
  "PA-08": { name: "Split-Treatment Agreement", slug: "split-treatment-agreement" },
  "PA-09": { name: "Informed Consent for Psychotherapy", slug: "informed-consent" },
  "PA-10": { name: "Telepsychology Consent", slug: "telepsychology-consent" },
  "PA-11": { name: "AI Tools Consent and Policy", slug: "ai-tools-policy" },
  "PA-12": { name: "Clinical Documentation Pack", slug: "clinical-documentation-pack" },
  "PA-13": { name: "Suicide Risk and Safety Planning", slug: "suicide-risk-and-safety-planning" },
  "PA-14": { name: "Telepsychiatry Prescribing Kit", slug: "telepsychiatry-prescribing-kit" },
  "PA-15": { name: "Financial Policy and Good Faith Estimate", slug: "financial-policy-and-good-faith-estimate" },
  "PA-16": { name: "Group Practice Agreement Kit", slug: "group-practice-agreement-kit" },
  "PA-17": { name: "HIPAA Privacy Notice Pack", slug: "hipaa-privacy-notice" },
  "PA-18": { name: "HIPAA Security Risk Analysis", slug: "hipaa-security-risk-analysis" },
  "PA-19": { name: "Compliance Calendar and Renewal Tracker", slug: "compliance-calendar" },
  "PA-20": { name: "Subpoena Response Guide", slug: "subpoena-response-guide" },
};

export function docName(code: string) {
  return LIBRARY_NAMES[code]?.name || "this template";
}

export function docSlug(code: string) {
  return LIBRARY_NAMES[code]?.slug || encodeURIComponent(code.toLowerCase());
}

// A web address may carry the name (professional-will) or, from older
// links, the PA number (PA-03).
export function codeFromSlug(slug: string) {
  const s = decodeURIComponent(slug).toLowerCase();
  const hit = Object.entries(LIBRARY_NAMES).find(([, v]) => v.slug === s);
  if (hit) return hit[0];
  return /^pa-\d+$/.test(s) ? s.toUpperCase() : null;
}

export function libraryHref(code: string) {
  return `/dashboard/documents/${docSlug(code)}`;
}

export function publicLibraryHref(code: string) {
  return `/library/${docSlug(code)}`;
}

export function cleanTitle(title: string) {
  return title.replace(/^PA-\d+:\s*/, "");
}

// Members see published resources (independently reviewed, with a review
// date) and provisional ones, which are always labelled as not yet
// independently reviewed. Drafts and hidden resources stay hidden.
export function isMemberVisible(d: { review_status?: string | null; review_date?: string | null }) {
  return (d.review_status === "published" && !!d.review_date) || d.review_status === "provisional";
}

export function isReviewed(d: { review_status?: string | null; review_date?: string | null }) {
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
    reviewed: isReviewed(d),
    reviewDate: d.review_date || null,
    nextReviewDate: d.next_review_date || null,
    storagePath: d.storage_path,
    contents: d.public_contents || [],
  };
}

export function matchesQuery(r: LibraryResource, q: string) {
  if (!q) return true;
  const hay = [r.code, LIBRARY_NAMES[r.code]?.name || "", r.title, r.summary, r.category, r.audience, ...r.tags].join(" ").toLowerCase();
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
    timeZone: d.length === 10 ? "UTC" : APP_TIME_ZONE,
  });
}

export const LIBRARY_SELECT =
  "id, title, library_code, summary, category, audience, tags, version, review_date, next_review_date, review_status, storage_path, applicability, public_contents";

// "Send to a colleague" on the templates that need a second clinician.
export const SHARE_ASK: Record<string, { subject: string; ask: string }> = {
  "PA-01": {
    subject: "Would you be my cover colleague?",
    ask: "I'm putting a reciprocal cover agreement in place using a template from the PsyAlliance Practice Library. Would you be my cover colleague?",
  },
  "PA-03": {
    subject: "Would you act as my professional executor?",
    ask: "I'm writing my professional will with a template from the PsyAlliance Practice Library. Would you consider acting as my professional executor?",
  },
  "PA-08": {
    subject: "Working together on shared treatment",
    ask: "I'd like to put a split-treatment collaboration agreement in place for clients we share, using a template from the PsyAlliance Practice Library. Would you look at it with me?",
  },
};
