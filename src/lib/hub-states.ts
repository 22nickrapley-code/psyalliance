import { planProgress } from "@/lib/continuity";

// The four parts of Profile, coloured by how complete they are (Nick,
// 18 Oct), using the rules PsyAlliance already applies elsewhere:
//   Profile       green: photo, bio, 3+ specialties, location, insurance
//                 amber: some of those; red: name only
//   Availability  green: confirmed in the last 30 days; amber: 31 to 90;
//                 red: over 90 (matching stops trusting it) or never
//   Credentials   green: a reviewed license, none expiring within 60 days
//                 amber: awaiting review, or expiring within 60 days
//                 red: none, or none active
//   Continuity    green: essentials done; amber: started; red: not started

export type HubTone = "green" | "amber" | "red";
export type HubKey = "profile" | "availability" | "credentials" | "continuity";
export type HubStates = Record<HubKey, { tone: HubTone; note: string }>;

const DAY = 86_400_000;

export function computeHubStates(input: {
  profile: { full_name?: string | null; qualification_level?: string | null; avatar_path?: string | null; bio?: string | null; primary_practice_city?: string | null; primary_state?: string | null; availability_confirmed_at?: string | null } | null;
  specialties: number;
  insurance: number;
  licences: { status?: string | null; expiration_date?: string | null; reviewed_at?: string | null }[];
  plan: { answers?: Record<string, string> | null; backup_profile_id?: string | null } | null;
}): HubStates {
  const p = input.profile || {};
  // Same four essentials the Profile page counts, so the tab and the page always agree.
  const parts = [!!(p.full_name && p.qualification_level), !!(p.primary_practice_city && p.primary_state), input.licences.length > 0, !!p.availability_confirmed_at];
  const have = parts.filter(Boolean).length;
  const profile: HubStates["profile"] =
    have === parts.length ? { tone: "green", note: "Essentials done" } : have === 0 ? { tone: "red", note: "Not started" } : { tone: "amber", note: `${have} of ${parts.length} essentials done` };

  const age = p.availability_confirmed_at ? Math.floor((Date.now() - new Date(p.availability_confirmed_at).getTime()) / DAY) : null;
  const availability: HubStates["availability"] =
    age === null
      ? { tone: "red", note: "Not set" }
      : age <= 30
        ? { tone: "green", note: age === 0 ? "Confirmed today" : `Confirmed ${age} day${age === 1 ? "" : "s"} ago` }
        : age <= 90
          ? { tone: "amber", note: `Confirmed ${age} days ago` }
          : { tone: "red", note: "Out of date" };

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10);
  const active = input.licences.filter((l) => l.status === "active" && (!l.expiration_date || l.expiration_date >= today));
  const reviewed = active.filter((l) => !!l.reviewed_at);
  const expiring = active.some((l) => l.expiration_date && l.expiration_date <= soon);
  const waiting = active.some((l) => !l.reviewed_at);
  const credentials: HubStates["credentials"] =
    active.length === 0
      ? { tone: "red", note: input.licences.length ? "No current license" : "No license yet" }
      : expiring
        ? { tone: "amber", note: "A license expires soon" }
        : waiting || reviewed.length === 0
          ? { tone: "amber", note: "Awaiting review" }
          : { tone: "green", note: "Up to date" };

  const answers = (input.plan?.answers || {}) as Record<string, string>;
  const started = !!input.plan && (Object.values(answers).some((v) => String(v || "").trim()) || !!input.plan.backup_profile_id);
  const prog = planProgress(answers as any, !!input.plan?.backup_profile_id || !!(answers.backup_outside || "").trim());
  const continuity: HubStates["continuity"] = !started
    ? { tone: "red", note: "Not set" }
    : prog.done >= prog.steps
      ? { tone: "green", note: "Essentials done" }
      : { tone: "amber", note: `${prog.done} of ${prog.steps} parts done` };
  return { profile, availability, credentials, continuity };
}
