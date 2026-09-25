import { effectiveReferral, effectiveCover } from "@/lib/availability";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { clinicianName, roleLabel, professionFor } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";
import { ClinicianProfileView, type ClinicianProfile } from "./view";
import { PageHead, Empty } from "../../_components/ui";

// A colleague's profile (Product Spec v1, Network > Profiles). Top: who
// they are, verified facts on file, availability and your relationship.
// Below: their practice in labelled sections, then factual activity
// signals from real work on the platform (no testimonials or ratings).

const CATEGORY_LABEL: [string, string][] = [
  ["treatment_specialism", "Specialties"],
  ["age_group_specialism", "Populations"],
  ["treatment_modality", "Approaches"],
  ["insurance", "Insurance panels"],
  ["language", "Languages"],
  ["session_type", "Sessions"],
];

const AVAIL = {
  referral: { yes: "Accepting referrals", limited: "Selected referrals only", no: "Not accepting referrals" } as Record<string, string>,
  cover: { yes: "Available for cover", ask_me: "Cover: ask me", no: "Not available for cover" } as Record<string, string>,
  consult: { yes: "Open to consult", limited: "Consult: limited", no: "Not consulting now" } as Record<string, string>,
};

export default async function PersonPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await props.params;
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;
  if (id === myself) redirect("/dashboard/profile");

  const { data: extra } = await supabase
    .from("profiles")
    .select("bio, approx_spaces, availability_paused_until")
    .eq("id", id)
    .maybeSingle();
  const [{ data: rows }, { data: licenceRows }, { data: connection }, { data: savedRow }, { data: excludedRow }, { data: track }, { data: workedWithMe }] =
    await Promise.all([
      supabase.from("public_directory").select("*").eq("id", id),
      supabase.rpc("network_licence_states").eq("profile_id", id),
      supabase
        .from("connections")
        .select("*")
        .or(`and(requester_id.eq.${myself},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${myself})`)
        .maybeSingle(),
      supabase.from("saved_clinicians").select("id").eq("profile_id", myself).eq("clinician_id", id).maybeSingle(),
      supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself).eq("blocked_profile_id", id).maybeSingle(),
      supabase.rpc("member_track_record", { target: id }).maybeSingle<any>(),
      supabase.from("worked_with_before").select("interaction_count").eq("profile_id", myself).eq("colleague_id", id).maybeSingle(),
    ]);

  if (!rows || rows.length === 0) {
    return (
      <>
        <PageHead eyebrow="Network" title="Profile not available" />
        <Empty title="This colleague isn't listed." body="Only verified members with an active licence on record appear in the network." action={<a className="btn secondary" href="/dashboard/network">Back to Network</a>} />
      </>
    );
  }

  const p = rows[0];
  const name = clinicianName(p.full_name, p.qualification_level, p.credential_prefix);
  const avatarUrl = await resolveAvatarUrl(supabase, p.avatar_path);
  const licenceStates: string[] = (((licenceRows as any[]) || []).find((r) => r.profile_id === id)?.states as string[]) || [];
  const byCat = new Map<string, { v: string; rank: number | null }[]>();
  for (const r of rows) {
    if (!r.category) continue;
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push({ v: r.value, rank: r.rank });
  }
  const age = p.availability_confirmed_at ? Math.floor((Date.now() - new Date(p.availability_confirmed_at).getTime()) / 86_400_000) : null;
  const confirmed = age === null ? "Availability not confirmed" : age === 0 ? "Confirmed today" : `Confirmed ${age} day${age === 1 ? "" : "s"} ago`;

  const status =
    connection?.status === "accepted"
      ? "trusted"
      : connection?.status === "pending"
        ? connection.requester_id === myself
          ? "pending_out"
          : "pending_in"
        : null;
  const relationship =
    status === "trusted" ? "Trusted colleague" : workedWithMe ? "Worked with before" : savedRow ? "Saved" : status === "pending_out" ? "Invitation sent" : status === "pending_in" ? "Wants to connect" : "Verified network";

  // Counts only, from member_track_record (individual events are private).
  const worked = Number(track?.colleagues_worked_with || 0);
  const covers = Number(track?.covers_completed || 0);
  const medianHours = Number(track?.response_samples || 0) >= 3 && track?.median_response_hours != null ? Number(track.median_response_hours) : null;
  const replyLabel = medianHours === null ? null : medianHours < 6 ? "Typically replies within a few hours" : medianHours < 36 ? "Typically replies within a day" : "Typically replies within a few days";
  const signals = [
    worked ? `Worked with ${worked} member${worked === 1 ? "" : "s"}` : null,
    covers ? `Covered for colleagues ${covers} time${covers === 1 ? "" : "s"}` : null,
    replyLabel,
  ].filter(Boolean) as string[];

  const list = (cat: string) => (byCat.get(cat) || []).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((i) => i.v);
  const joinSome = (xs: string[], n: number) => (xs.length > n ? `${xs.slice(0, n).join(", ")} +${xs.length - n}` : xs.join(", "));
  const specialties = list("treatment_specialism");
  const referral = effectiveReferral(p.referral_availability, p.availability_confirmed_at, extra?.availability_paused_until);
  const today = new Date().toISOString().slice(0, 10);
  const glance: [string, string][] = [
    ["Primary service", professionFor(p.qualification_level) === "psychiatrist" ? "Psychiatry and medication management" : "Psychotherapy and assessment"],
    ["Focus", specialties.slice(0, 3).join(" · ") || "Not listed"],
    ...(list("age_group_specialism").length ? ([["Populations", list("age_group_specialism").join(", ")]] as [string, string][]) : []),
    ...(list("treatment_modality").length ? ([["Approaches", joinSome(list("treatment_modality"), 3)]] as [string, string][]) : []),
    ...(list("session_type").length ? ([["Sessions", list("session_type").join(", ")]] as [string, string][]) : []),
    ...(list("language").length ? ([["Languages", list("language").join(", ")]] as [string, string][]) : []),
    ["Insurance", joinSome(list("insurance"), 3) || "Out of network"],
  ];
  const view: ClinicianProfile = {
    id,
    name,
    firstName: String(p.full_name || "").replace(/^(dr\.?)\s+/i, "").split(/\s+/)[0] || "They",
    role: roleLabel(p.qualification_level),
    where: [p.primary_practice_city, p.primary_state].filter(Boolean).join(", "),
    avatarUrl,
    bio: extra?.bio || null,
    licenceStates: licenceStates.map((c) => US_STATES.find((s) => s.code === c)?.name || c),
    psypact: !!p.psypact_participating,
    boardCertified: !!p.board_certified,
    availabilityChip: referral.label,
    availabilityFresh: age !== null && age <= 30,
    glance,
    availability: [
      ["Referrals", referral.label],
      ["Cover", effectiveCover(p.coverage_availability, p.availability_confirmed_at, extra?.availability_paused_until).label],
      ["Consultation", AVAIL.consult[p.consultation_availability] || "Not set"],
      ["Supervision", p.open_to_give_supervision ? "Open to supervise" : p.open_to_receive_supervision ? "Seeking supervision" : "Not listed"],
      ...(typeof extra?.approx_spaces === "number" ? ([["Spaces for new patients", `About ${extra.approx_spaces}`]] as [string, string][]) : []),
      ...(extra?.availability_paused_until && extra.availability_paused_until >= today
        ? ([["Paused until", new Date(extra.availability_paused_until + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })]] as [string, string][])
        : []),
    ],
    confirmed,
    specialties,
    relationship,
    status: status as ClinicianProfile["status"],
    connectionId: connection?.id ?? null,
    saved: !!savedRow,
    excluded: !!excludedRow,
    collaborations: Number(workedWithMe?.interaction_count || 0),
    signals,
    primaryState: p.primary_state || null,
  };
  void AVAIL.referral;
  void AVAIL.cover;

  return <ClinicianProfileView p={view} error={error} />;
}
