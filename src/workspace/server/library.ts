import { REFERENCE_DATA } from "../fixtures/reference-data";
import { isAvailable, isReviewed, monthYear } from "@/lib/library";

// The Library as the screens read it: the six workflow guides that are part
// of the product, then the templates the database holds. A template's review
// status comes only from the database; nothing here marks anything reviewed.
// Until a template is reviewed it carries the same "Supplied draft · Review
// pending" label as the approved design, and on the live site (unless the
// preview setting is on) it is listed as "Coming soon" with no file.

type Row = {
  code: string; title: string; summary: string; category: string; tags: string[]; version: number;
  status: string; reviewDate: string | null; nextReviewDate: string | null; contents: string[]; warning: string; hasFile: boolean;
};

const REF: any[] = REFERENCE_DATA.resources;
const guides = REF.filter((r) => r.type !== "PDF template");
const byCode = new Map<string, any>(REF.filter((r) => r.type === "PDF template").map((r) => [`PA-${String(r.id - 100).padStart(2, "0")}`, r]));

export function shapeLibrary(raw: { resources?: Row[]; saved?: string[] } | null | undefined) {
  const rows = raw?.resources || [];
  const templates = rows.map((d) => {
    const n = Number(d.code.slice(3));
    const ref = byCode.get(d.code);
    const doc = { review_status: d.status, review_date: d.reviewDate };
    const reviewed = isReviewed(doc);
    const available = isAvailable(doc) && d.hasFile;
    const inside = ref?.description || d.summary || "";
    const sections: [string, string][] = [["What’s inside", d.contents.length ? `${inside} ${d.contents.join(", ")}.`.trim() : inside]];
    sections.push([
      "Review status",
      reviewed
        ? `Reviewed ${monthYear(d.reviewDate)}${d.nextReviewDate ? `. Next review ${monthYear(d.nextReviewDate)}` : ""}. Adapt it to your state and your practice before use.`
        : ref?.sections?.[1]?.[1] || "Supplied draft template. Professional and jurisdiction-specific review is pending. Adapt it with the appropriate professional advice before use.",
    ]);
    if (d.warning) sections.push(["Before you use it", d.warning]);
    return {
      id: 100 + n,
      key: d.code,
      code: d.code,
      title: ref?.title || d.title.replace(/^PA-\d+:\s*/, ""),
      category: ref?.category || "Practice essentials",
      description: ref?.description || d.summary || "",
      type: "PDF template",
      supplied: !reviewed,
      reviewed,
      reviewLabel: reviewed ? `Reviewed · ${monthYear(d.reviewDate)}` : "",
      soon: !available,
      pdf: available ? `/dashboard/library-files/${d.code}` : "",
      sections,
    };
  });
  const savedKeys = raw?.saved || [];
  const all = [...guides.map((g) => ({ ...g, key: `guide:${g.id}` })), ...templates];
  const saved = all.filter((r) => savedKeys.includes(r.key)).map((r) => r.id);
  return { resources: all, savedResources: saved };
}

// The key the database stores a saved resource under.
export function resourceKey(id: number): string | null {
  if (id >= 1 && id <= 6) return `guide:${id}`;
  if (id >= 101 && id <= 199) return `PA-${String(id - 100).padStart(2, "0")}`;
  return null;
}
