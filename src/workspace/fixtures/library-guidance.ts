// Library overviews (Nick, 1 Nov): every resource has a PDF, and its overview says what it is, what is inside and,
// under "Before you use it", how to use it and its state-use or legal limits. Information only.
import guides from "./guides.json";

const NOT_ADVICE = "This is an educational template, not legal or clinical advice.";

// Before you use it, for each Library template. A database note (customization_warning) is used instead when one is set.
export const TEMPLATE_BEFORE: Record<string, string> = {
  "PA-01": "Each colleague must be licensed in the state where each client is located at the time of contact. Check that your informed consent tells clients about cover, and ask your malpractice carrier whether it needs a copy. Sign it pair by pair.",
  "PA-02": "Start four to six weeks before leave. Patient letters must be adapted to your state's notice expectations and your own consent. Share clinical information through your own secure systems, on a minimum-necessary basis.",
  "PA-03": "Records custody and retention periods are set by state law, and some boards have specific professional-will rules. Keep credentials in a password manager with emergency access, never in the document. Consider review by a healthcare attorney.",
  "PA-04": "A consultation group is not formal supervision where your license requires it, and consultation does not transfer clinical responsibility. Agree de-identification rules before the first case.",
  "PA-05": "Remove every detail that could identify the client alone or in combination, including rare presentations, employers and places. Presenting a case does not transfer clinical responsibility.",
  "PA-06": "Supervision requirements (hours, ratios, who may supervise, what counts) differ by state board and license type. Check your board's current rules before signing, and keep the log as your board requires.",
  "PA-07": "Termination and transfer must follow your ethics code and state law, including reasonable notice and referrals. A release of information is needed before sharing records. Never accept or pay for referrals.",
  "PA-08": "Agree in writing who is responsible for what, including risk, medication and crisis contact. Confirm both clinicians are licensed where the client is located and that the client has consented to the communication.",
  "PA-09": "Consent must reflect your state's law, your fees and your own practice policies, including limits of confidentiality and mandated reporting. Review it with a healthcare attorney before first use; this version is for adults.",
  "PA-10": "You must be licensed (or practicing under PSYPACT authority) in the state where the client is located during each session. Check each state's telehealth and emergency-planning rules, and record the client's location at every session.",
  "PA-11": "Use an AI tool only with a signed business associate agreement and the client's informed consent. State laws on recording consent differ, and some require all parties to agree. You remain responsible for every note.",
  "PA-12": "Documentation standards differ by state, payer and setting. Adapt the templates to your EHR and your payers' medical-necessity rules, and keep notes factual and minimum necessary.",
  "PA-13": "Use alongside your clinical training and judgment, not instead of it. Follow your state's duty-to-warn and duty-to-protect law, and keep crisis numbers (988 and 911) current in every plan.",
  "PA-14": "Controlled-substance telehealth prescribing rules (DEA and state) change often; confirm the current rules before every new prescription. Registration is required in each state where you prescribe.",
  "PA-15": "The No Surprises Act requires a Good Faith Estimate for self-pay and out-of-network clients. State rules on fees, cancellation charges and collections differ; check yours before adopting the policy.",
  "PA-16": "Employment versus contractor status is decided by federal and state law, not by the agreement's title. Non-compete and non-solicitation terms are restricted or banned in some states. Have an attorney review before signing.",
  "PA-17": "Your Notice of Privacy Practices must match how your practice actually handles information and be updated when it changes. Some records (substance-use under 42 CFR Part 2, psychotherapy notes) need specific authorizations.",
  "PA-18": "HIPAA requires a documented risk analysis, reviewed regularly. Breach notification deadlines are federal and, in many states, shorter. Involve your IT provider and keep the analysis in your own secure files.",
  "PA-19": "Renewal cycles, CE requirements and deadlines differ by state and license type; confirm each date with your board. Set reminders well before each deadline.",
  "PA-20": "A subpoena is not a court order; do not release records on a subpoena alone without client authorization or legal advice. Rules differ by state. Contact your malpractice carrier's risk line before responding.",
};

type Guide = { id: number; code: string; slug: string; what: string; sections: [string, string[]][]; before: string };

export const GUIDE_INFO: Record<number, { pdf: string; inside: string; before: string }> = Object.fromEntries(
  (guides as unknown as Guide[]).map((g) => [g.id, {
    pdf: `/library/guides/${g.code}_${g.slug}.pdf`,
    inside: `${g.what} It covers: ${g.sections.map(([h]) => h.toLowerCase()).join("; ")}.`,
    before: g.before,
  }]),
);

export function templateBefore(code: string, warning?: string): string {
  return (warning && warning.trim()) || `${TEMPLATE_BEFORE[code] || "Adapt it to your state and your practice before use."} ${NOT_ADVICE}`;
}

// The six guides as the screens read them: a PDF each, and an overview of what is inside and what to check first.
export function withGuides<T extends { id: number; type?: string }>(resources: T[]): T[] {
  return resources.map((r) => {
    const g = GUIDE_INFO[r.id];
    if (r.type === "PDF template") {
      const code = `PA-${String(r.id - 100).padStart(2, "0")}`;
      const inside = ((r as any).sections || []).find((x: [string, string]) => /inside/i.test(x[0]))?.[1] || (r as any).description || "";
      return { ...r, sections: [["What’s inside", inside], ["Before you use it", templateBefore(code)]] } as T;
    }
    if (!g) return r;
    return { ...r, pdf: g.pdf, sections: [["What’s inside", g.inside], ["Before you use it", g.before]] } as T;
  });
}
