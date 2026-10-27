import type { ReactNode } from "react";
import { CredentialsView } from "../dashboard/credentials/view";
import { ProfileView } from "../dashboard/profile/view";
import type { ImportDemo } from "../dashboard/profile/bio-import";
import { PASTED_PROFILE } from "@/tour/sample-profile";

// The two pages the approved workspace design does not cover: the license
// check and profile editing. Demo steps that show them render the product's
// own pages here, with the same fictional person as the workspace demos
// (Rachel Davis, a clinical psychologist in Boston).

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const PROFILE_LOOKUPS = [
  ...["Anxiety/Panic Disorders", "Depression", "Life Transitions", "Trauma/PTSD", "Obsessive/Compulsive Disorder", "Grief/Loss", "Burnout", "Bipolar Disorder", "Couples"].map((value, i) => ({ id: 700 + i, category: "treatment_specialism", value })),
  ...["Cognitive Behavioral Therapy (CBT)", "Acceptance and Commitment Therapy (ACT)", "Mindfulness-Based", "Psychodynamic", "EMDR"].map((value, i) => ({ id: 720 + i, category: "treatment_modality", value })),
  ...["Children", "Adolescents", "Young Adults", "Adults", "Older Adults"].map((value, i) => ({ id: 740 + i, category: "age_group_specialism", value })),
  ...["Face to Face", "Virtual"].map((value, i) => ({ id: 760 + i, category: "session_type", value })),
  ...["Aetna", "Cigna", "Blue Cross Blue Shield of Massachusetts", "Self-pay (out of network)"].map((value, i) => ({ id: 780 + i, category: "insurance", value })),
  ...["English", "Spanish"].map((value, i) => ({ id: 800 + i, category: "language", value })),
];
// What the pasted profile ticks: six specialties (top three ranked), three
// approaches, two age groups, both session types, three insurers, English.
const SETUP_TICKS = [700, 701, 702, 703, 704, 705, 720, 721, 722, 741, 743, 760, 761, 780, 781, 783, 800];
const SETUP_RANKS: Record<number, number> = { 700: 1, 701: 2, 702: 3 };
const SETUP_ROWS = SETUP_TICKS.map((id) => ({ lookup_value_id: id, rank: SETUP_RANKS[id] ?? null }));
const SIGNUP = { full_name: "Rachel Davis", qualification_level: "PhD", primary_state: "MA", avatar_path: null };
const BIO =
  "I work with adults living with anxiety, low mood and big life transitions, using CBT, ACT and mindfulness-based approaches. In person in Boston and by telehealth across Massachusetts, New York and Vermont.";
const FILLED = { ...SIGNUP, credential_prefix: "Dr", primary_practice_city: "Boston", bio: BIO };
const APPLIED = ["Title", "Practice city", "Short bio", `${SETUP_TICKS.length} specialties, approaches and other details ticked`, "Your top 3 specialties ranked: check the order"];
const MARKS = ["credential_prefix", "primary_practice_city", "bio", ...SETUP_TICKS.map((id) => `lv_${id}`)];
const setup = (demo: ImportDemo, profile: Record<string, unknown>, rows: { lookup_value_id: number; rank: number | null }[]) => (
  <ProfileView sp={{}} profile={profile} lookups={PROFILE_LOOKUPS} selectedRows={rows} licenceCount={0} avatarUrl={null} me="rachel" importDemo={demo} />
);

export type LegacyPage = { render: () => ReactNode; active: string };

export const LEGACY_PAGES: Record<string, LegacyPage> = {
  "profile/paste": { active: "/dashboard/profile", render: () => setup({ text: PASTED_PROFILE }, SIGNUP, []) },
  "profile/filled": { active: "/dashboard/profile", render: () => setup({ text: PASTED_PROFILE, applied: APPLIED, marks: MARKS, ranks: 3 }, FILLED, SETUP_ROWS) },
  "profile/ranked": { active: "/dashboard/profile", render: () => setup({ text: PASTED_PROFILE, applied: APPLIED, marks: MARKS, ranks: 3 }, FILLED, SETUP_ROWS) },
  "profile/saved": {
    active: "/dashboard/profile",
    render: () => <ProfileView sp={{ saved: "1" }} profile={FILLED} lookups={PROFILE_LOOKUPS} selectedRows={SETUP_ROWS} licenceCount={0} avatarUrl={null} me="rachel" editing={false} />,
  },
  "verified/credentials": {
    active: "/dashboard/credentials",
    render: () => (
      <CredentialsView
        sp={{}}
        profile={{ verification_status: "verified", verified_at: daysAgo(30), account_status: "active", qualification_level: "PhD", npi_number: "1234567890", caqh_provider_id: null, caqh_last_attested_date: null, malpractice_carrier: null, malpractice_expires: null }}
        licenses={[
          { id: 1, state: "MA", license_number: "8841", license_type: "Licensed Psychologist", expiration_date: "2027-08-31", status: "active", reviewed_at: daysAgo(29) },
          { id: 2, state: "NY", license_number: "019283", license_type: "Licensed Psychologist", expiration_date: "2027-06-30", status: "active", reviewed_at: daysAgo(29) },
          { id: 3, state: "VT", license_number: "048-0012", license_type: "Licensed Psychologist", expiration_date: "2027-03-31", status: "active", reviewed_at: null },
        ]}
        ce={[]}
        panels={[]}
        npiChecks={[{ matched: true, flagged_reason: null, created_at: daysAgo(30) }]}
      />
    ),
  },
  "verified/profile": {
    active: "/dashboard/profile",
    render: () => (
      <ProfileView
        sp={{}}
        profile={{ ...FILLED, availability_confirmed_at: daysAgo(3) }}
        lookups={PROFILE_LOOKUPS}
        selectedRows={SETUP_ROWS}
        licenceCount={3}
        avatarUrl={null}
        me="rachel"
        editing={false}
        licenses={[{ state: "MA", reviewed: true }, { state: "NY", reviewed: true }, { state: "VT", reviewed: false }]}
      />
    ),
  },
};
