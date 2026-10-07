// The continuity plan (a professional will): what a named colleague needs
// to know and do if the member can't practice, suddenly or for a while.
// APA Ethics Code 3.12 (Interruption of Psychological Services) and 10.09
// (Interruption of Therapy) expect psychologists to plan for this.
//
// Answers say where things are and what should happen. They never hold
// client details or passwords: access details stay with a person the
// member names (an attorney, a sealed envelope, a password manager's
// emergency access).

export type Field = {
  key: string;
  label: string;
  hint?: string;
  kind?: "text" | "long";
  placeholder?: string;
  preset?: string;
};

export type Section = {
  key: string;
  title: string;
  why: string;
  fields: Field[];
  // The answers that make this section "done".
  required: string[];
};

export const CONTINUITY_SECTIONS: Section[] = [
  {
    key: "practice",
    title: "Your practice",
    why: "So your backup can say who you are and where you practice, and find your license and insurance details quickly.",
    required: ["practice_name", "practice_contact"],
    fields: [
      { key: "practice_name", label: "Practice name", placeholder: "e.g. Rivers Psychology, PLLC" },
      { key: "practice_address", label: "Office address", placeholder: "Street, city, state, or 'Telehealth only'" },
      { key: "practice_contact", label: "Practice phone and email clients use", placeholder: "e.g. (718) 555-0142, hello@riverspsych.com" },
      { key: "licenses", label: "License numbers", hint: "State and number for each license.", placeholder: "e.g. NY 012345, NJ 35SI00987600" },
      { key: "malpractice", label: "Professional liability insurer", hint: "Insurer, policy number and claims phone.", placeholder: "e.g. The Trust, policy ..., claims (800) ..." },
    ],
  },
  {
    key: "records",
    title: "Records and access",
    why: "Your backup needs to reach your schedule and client list to contact people, and your records to keep them safe. Write where things are, not the passwords.",
    required: ["records_system", "access_kept_with"],
    fields: [
      { key: "records_system", label: "Where client records are kept", placeholder: "e.g. SimplePractice; paper files in the locked cabinet at the office" },
      { key: "schedule_location", label: "Where your schedule and client contact list are", placeholder: "e.g. SimplePractice calendar; contact list exported monthly to ..." },
      { key: "access_kept_with", label: "Who holds the access details", hint: "Never write passwords here. Name the person or place that holds them.", placeholder: "e.g. Sealed envelope with my attorney; 1Password emergency kit with my spouse" },
      { key: "billing_system", label: "Billing and payments", placeholder: "e.g. Claims through SimplePractice; card payments via Stripe" },
      { key: "retention", label: "How long records must be kept", hint: "Check your state's rule and add it here.", kind: "long", preset: "Keep records for the period my state requires (and longer for minors), stored securely, then destroyed securely. The custodian named below holds them in the meantime." },
      { key: "custodian", label: "Records custodian", hint: "Usually your backup; sometimes a records service.", placeholder: "e.g. My backup, then a records storage service if needed" },
    ],
  },
  {
    key: "first_steps",
    title: "What should happen first",
    why: "The first 48 hours matter most to clients. Your instructions save your backup from guessing.",
    required: ["notify_clients"],
    fields: [
      { key: "notify_clients", label: "Telling current clients", kind: "long", preset: "Contact every current client within 48 hours, by phone first, then in writing. Cancel upcoming sessions. Offer a short call with my backup and, for anyone who needs it, two or three referrals that fit their needs, insurance and location." },
      { key: "client_message", label: "What clients are told", kind: "long", preset: "Your clinician is unable to continue seeing clients at the moment. I'm a colleague helping to make sure your care continues. I'd like to talk with you about your options, including a referral to another clinician if that's right for you. Your records are confidential and held securely." },
      { key: "high_risk", label: "Clients who need contact first", hint: "Describe how to find them, not who they are.", placeholder: "e.g. Clients flagged 'priority' in my EHR" },
      { key: "voicemail", label: "Voicemail and email auto-reply", kind: "long", preset: "You've reached the practice. Dr. [name] is not available. If this is an emergency, call or text 988 or go to your nearest emergency room. For appointments or records, please leave a message and a colleague will return your call within one business day." },
      { key: "notify_others", label: "Who else to tell", kind: "long", preset: "Insurance panels I'm credentialed with, my professional liability insurer, my licensing board if required, and any supervisees or trainees." },
      { key: "finances", label: "Billing, refunds and the office", placeholder: "e.g. Finish open claims, refund prepaid sessions, who to call about the lease" },
    ],
  },
  {
    key: "people",
    title: "People to contact",
    why: "Your backup handles the practice; these people handle the rest and can help them.",
    required: ["attorney_or_family"],
    fields: [
      { key: "attorney_or_family", label: "Family member or personal contact", placeholder: "Name, relationship, phone" },
      { key: "attorney", label: "Attorney", placeholder: "Name, firm, phone" },
      { key: "accountant", label: "Accountant or bookkeeper", placeholder: "Name, phone" },
      { key: "other", label: "Anyone else", kind: "long", placeholder: "e.g. Office manager, practice partners, landlord" },
    ],
  },
  {
    key: "terms",
    title: "Your backup's authority",
    why: "Spell out what your backup may do and how their time is paid, so nobody has to ask in a crisis.",
    required: ["authority"],
    fields: [
      { key: "authority", label: "What your backup may do", kind: "long", preset: "Access my schedule, client contact information and records to notify clients, arrange continuity of care, respond to records requests and arrange secure storage or transfer of records, consistent with applicable law." },
      { key: "compensation", label: "How their time is paid", placeholder: "e.g. Their usual hourly rate, paid from the practice account by ..." },
      { key: "when", label: "When this plan applies", kind: "long", preset: "If I'm unable to practice or can't be reached for more than 72 hours without notice, or if a family member or my attorney asks my backup to act." },
    ],
  },
];

export type ContinuityAnswers = Record<string, string>;

export function sectionDone(section: Section, a: ContinuityAnswers) {
  return section.required.every((k) => (a[k] || "").trim().length > 0);
}

export function planProgress(a: ContinuityAnswers, hasBackup: boolean) {
  const steps = CONTINUITY_SECTIONS.length + 1;
  const done = CONTINUITY_SECTIONS.filter((s) => sectionDone(s, a)).length + (hasBackup ? 1 : 0);
  return { done, steps, pct: Math.round((done / steps) * 100) };
}

export const BACKUP_STATUS: Record<string, { label: string; tone: "" | "warn" | "danger" | "neutral" }> = {
  none: { label: "Not named", tone: "neutral" },
  invited: { label: "Asked, waiting for a reply", tone: "warn" },
  accepted: { label: "Agreed", tone: "" },
  declined: { label: "Can't do it", tone: "danger" },
};
