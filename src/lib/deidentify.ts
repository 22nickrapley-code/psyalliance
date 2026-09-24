// Server-side guard for free text that shouldn't carry patient
// identifiers. It blocks patterns that are unambiguous (contact details,
// full dates, record numbers, street addresses) and asks the member to
// rephrase. It CANNOT reliably detect names, so nothing public may claim
// that it does; the compose screens keep their guidance, and anything that
// slips through can be reported and redacted (migration 0084).
// Applied to: consult questions, context and replies; group posts;
// referral notes and replies; cover plan titles and request messages;
// direct messages.

const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, label: "an email address" },
  { re: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, label: "a phone number" },
  { re: /\b\d{1,2}[\/.-]\d{1,2}[\/.-](19|20)?\d{2}\b/, label: "a full date" },
  { re: /\b(19|20)\d{2}-\d{2}-\d{2}\b/, label: "a full date" },
  { re: /\b(d\.?o\.?b\.?|date of birth|born on)\b/i, label: "a date of birth" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, label: "a social security number" },
  { re: /\b(mrn|medical record|chart (no|number)|patient id)\b/i, label: "a record number" },
  { re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd)\b/i, label: "a street address" },
];

export function findIdentifiers(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const p of PATTERNS) if (p.re.test(text)) found.add(p.label);
  return Array.from(found);
}

export function identifierError(text: string | null | undefined): string | null {
  const found = findIdentifiers(text);
  if (found.length === 0) return null;
  return `Please remove ${found.join(" and ")}. PsyAlliance isn't built to hold patient-identifying details; share them through your own secure channel once a colleague agrees.`;
}
