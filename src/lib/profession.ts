// Psychologists (PhD/PsyD/EdD) and psychiatrists (MD/DO) are two distinct
// professions on this platform, not just two credential flavors - a
// psychologist provides therapy but can't prescribe, a psychiatrist can
// prescribe and manage medication but many don't do ongoing talk therapy, so
// the two groups routinely refer clients to each other for the piece they
// can't personally provide. qualification_level already encodes which is
// which; this just names that split clearly so it can be shown and filtered
// on everywhere a person is listed, rather than making someone read a
// credential abbreviation to work it out.

export type Profession = "psychologist" | "psychiatrist";

const PSYCHIATRIST_QUALIFICATIONS = new Set(["MD", "DO"]);

export function professionFor(qualificationLevel: string | null | undefined): Profession {
  return qualificationLevel && PSYCHIATRIST_QUALIFICATIONS.has(qualificationLevel)
    ? "psychiatrist"
    : "psychologist";
}

export function professionLabel(profession: Profession): string {
  return profession === "psychiatrist" ? "Psychiatrist" : "Psychologist";
}

// How a clinician is named across the product: "Maya Chen, PsyD". The
// degree says more than a "Dr." prefix and reads the same for everyone.
export function clinicianName(fullName: string | null | undefined, qualification?: string | null, prefix?: string | null): string {
  const name = String(fullName || "A colleague").replace(/^(dr\.?)\s+/i, "");
  if (qualification) return `${name}, ${qualification}`;
  return prefix ? `${prefix} ${name}` : name;
}

// "Clinical psychologist" / "Psychiatrist" for headings and cards.
export function roleLabel(qualification: string | null | undefined): string {
  return professionFor(qualification) === "psychiatrist" ? "Psychiatrist" : "Clinical psychologist";
}
