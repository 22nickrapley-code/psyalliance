import { psypactEligible } from "@/lib/psypact";
import { APP_TIME_ZONE } from "@/lib/dates";
import { saveProfile, uploadAvatar } from "./actions";
import { clinicianName, roleLabel } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";
import { ProfileCards } from "./sections";
import { PracticeSetup } from "./practice-setup";
import { PageCardLink } from "../_components/page-card";
import BioImportBox, { AutofillMarks, type ImportDemo } from "./bio-import";
import { FirstVisit } from "../_components/first-visit";
import { TOUR_URL } from "@/lib/env";
import { AvatarPicker } from "./avatar-picker";
import { PageHead, Banner, PersonAvatar, Status } from "../_components/ui";
import { BackField } from "../_components/back-link";
import { DeleteAccount } from "./delete-account";
import { foundingLabel, type FoundingPlace } from "@/lib/founding";

// Profile (Product Spec v1): the facts every match is computed against.
// Profession, specialties ranked 1 to 5, populations and age bands,
// modalities, insurance, languages, session types, practice location,
// PSYPACT, photo and a short bio. A completeness bar and a preview of how
// colleagues see you sit alongside. Licenses live in Credentials.

type LV = { id: number; value: string };

const SELF_DISCLOSURE: [string, string][] = [
  ["ethnicity", "Your ethnicity"],
  ["gender_identity", "Your gender identity"],
  ["sex", "Your sex"],
];

function CheckGrid({ items, selected }: { items: LV[]; selected: Map<number, number | null> }) {
  return (
    <div className="check-grid">
      {items.map((lv) => (
        <label key={lv.id}>
          <input id={`lv_${lv.id}`} type="checkbox" name={`lv_${lv.id}`} defaultChecked={selected.has(lv.id)} />
          {lv.value}
        </label>
      ))}
    </div>
  );
}

// A section of the profile as a card (Nick, 1 Nov): opened by its pencil, saved with the one form.
function Card({ sec, title, help, children }: { sec: string; title: string; help?: string; children: React.ReactNode }) {
  return (
    <dialog id={`dlg-${sec}`} className="pf-card" data-sec={sec} aria-labelledby={`dlg-${sec}-t`}>
      <div className="pf-card-head">
        <div>
          <p className="eyebrow">Your profile</p>
          <h2 id={`dlg-${sec}-t`}>{title}</h2>
          {help && <p className="pf-card-help">{help}</p>}
        </div>
        <button type="button" className="pf-card-x" data-cancel="" aria-label={`Close ${title} without saving`}>
          &times;
        </button>
      </div>
      <div className="pf-card-body">{children}</div>
      <div className="pf-card-foot">
        <button type="button" className="btn secondary" data-cancel="">
          Cancel
        </button>
        <button type="submit" className="btn">
          Save
        </button>
      </div>
    </dialog>
  );
}

const Pencil = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </svg>
);
function Edit({ sec, label }: { sec: string; label: string }) {
  return (
    <button type="button" className="pf-edit" data-edit={sec} aria-label={`Edit ${label}`} title={`Edit ${label}`}>
      <Pencil />
    </button>
  );
}

export function ProfileView({
  sp,
  profile,
  lookups,
  selectedRows,
  licenceCount,
  avatarUrl,
  me,
  editing = true,
  licenses = [],
  ledger = [],
  back,
  importDemo,
  founding = null,
}: {
  // The member's founding place, if they hold one (migration 0112).
  founding?: FoundingPlace | null;
  // Demo screens only: the Quick start part-way through.
  importDemo?: ImportDemo;
  ledger?: string[];
  back?: string | null;
  sp: { saved?: string; availability_saved?: string; avatar_saved?: string; avatar_error?: string; error?: string; photo?: string };
  profile: any;
  lookups: { id: number; category: string; value: string }[] | null;
  selectedRows: { lookup_value_id: number; rank: number | null }[] | null;
  licenceCount: number | null;
  avatarUrl: string | null;
  me: string;
  editing?: boolean;
  licenses?: { state: string; reviewed: boolean }[];
}) {
  const selected = new Map<number, number | null>((selectedRows || []).map((s) => [s.lookup_value_id, s.rank]));
  const by: Record<string, LV[]> = {};
  for (const lv of lookups || []) (by[lv.category] ||= []).push({ id: lv.id, value: lv.value });
  const pick = (cat: string) => (by[cat] || []).filter((lv) => selected.has(lv.id));

  const specs = by.treatment_specialism || [];
  const ranked = specs
    .filter((lv) => typeof selected.get(lv.id) === "number")
    .sort((a, b) => (selected.get(a.id) as number) - (selected.get(b.id) as number));
  const rankAt = (n: number) => ranked.find((lv) => selected.get(lv.id) === n)?.id ?? "";

  // Completeness: what the matching engine and colleagues actually use.
  const checks: { label: string; done: boolean; href: string }[] = [
    { label: "Photo", done: !!profile?.avatar_path, href: "#photo" },
    { label: "Name and qualification", done: !!(profile?.full_name && profile?.qualification_level), href: "#basics" },
    { label: "Practice location", done: !!(profile?.primary_practice_city && profile?.primary_state), href: "#basics" },
    { label: "Short bio", done: !!profile?.bio, href: "#about" },
    { label: "Top specialties ranked", done: ranked.length >= 3, href: "#specialties" },
    { label: "Age groups", done: pick("age_group_specialism").length > 0, href: "#populations" },
    { label: "Modalities", done: pick("treatment_modality").length > 0, href: "#modalities" },
    { label: "Insurance", done: pick("insurance").length > 0, href: "#insurance" },
    { label: "Languages", done: pick("language").length > 0, href: "#languages" },
    { label: "Session types", done: pick("session_type").length > 0, href: "#populations" },
    { label: "License in Credentials", done: (licenceCount || 0) > 0, href: "card:/dashboard/credentials" },
    { label: "Availability confirmed", done: !!profile?.availability_confirmed_at, href: "card:/dashboard?availability=1" },
  ];
  // What's left comes first, in its own colour.
  checks.sort((a, b) => Number(a.done) - Number(b.done));
  const basicsDone = !!(profile?.full_name && profile?.qualification_level && profile?.primary_state && profile?.primary_practice_city);
  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checks.length) * 100);
  // Two named measures: what must be in place for colleagues to match and find you, and the optional detail that makes a profile richer.
  const ESSENTIAL = ["Name and qualification", "Practice location", "License in Credentials", "Availability confirmed"];
  const essential = checks.filter((c) => ESSENTIAL.includes(c.label));
  const optional = checks.filter((c) => !ESSENTIAL.includes(c.label));
  const essDone = essential.filter((c) => c.done).length;
  const optDone = optional.filter((c) => c.done).length;

  const name = profile?.full_name || "Your name";
  const display = clinicianName(name, profile?.qualification_level, profile?.credential_prefix);
  // "Austin, TX" with state TX shows once, not as "Austin, TX, TX" (Nick, 4 Nov).
  const cityOnly = String(profile?.primary_practice_city || "").replace(new RegExp(`,\\s*${profile?.primary_state || "@@"}$`, "i"), "").trim();
  const where = [cityOnly, profile?.primary_state].filter(Boolean).join(", ");
  const stateName = (c: string) => US_STATES.find((x) => x.code === c)?.name || c;
  const reviewed = licenses.filter((l) => l.reviewed);
  const joinSome = (xs: string[], n: number) => (xs.length > n ? `${xs.slice(0, n).join(", ")} +${xs.length - n}` : xs.join(", "));
  const list = (cat: string) => pick(cat).map((l) => l.value);
  const sexPick = (by.sex || []).find((lv) => selected.has(lv.id))?.value;
  const selfBits = [profile?.pronoun, ...list("ethnicity"), ...list("gender_identity"), sexPick].filter(Boolean) as string[];
  // The profile as colleagues see it, one row per section, each with its pencil (labels bold, values plain).
  const rows: { sec: string; label: string; value: string; todo?: boolean; note?: string }[] = [
    { sec: "specialties", label: "Practice focus", value: ranked.slice(0, 5).map((l) => l.value).join(" · "), todo: ranked.length < 3 },
    { sec: "populations", label: "Clients and sessions", value: [list("age_group_specialism").join(", "), list("session_type").join(", ")].filter(Boolean).join(" · ") },
    { sec: "modalities", label: "Approaches", value: joinSome(list("treatment_modality"), 4) },
    { sec: "insurance", label: "Insurance", value: joinSome(list("insurance"), 4) || "" , note: "Self-pay only if left empty" },
    { sec: "languages", label: "Languages", value: list("language").join(", ") },
    { sec: "consult-pref", label: "Consultation groups", value: (profile?.open_to_group_consultation ?? true) ? "Open to joining" : "Not joining groups at the moment" },
    { sec: "contact", label: "Contact details", value: [profile?.contact_phone, profile?.contact_email].filter(Boolean).join(" · "), note: "Private: only you and PsyAlliance admins" },
    { sec: "self", label: "About you", value: selfBits.join(" · "), note: "Optional, never used for matching" },
  ];
  const jurisdiction = licenses.length ? licenses.map((l) => stateName(l.state)).join(", ") + (profile?.psypact_participating ? " · PSYPACT" : "") : "";
  const since = profile?.founding_member_since || profile?.created_at;

  return (
    <>
      {pct < 70 && !importDemo && <FirstVisit id="profile" what="Profile set-up" title="Setting up your profile?" length="1-minute" exampleHref={`${TOUR_URL}/profile`} />}
      <PageHead eyebrow="Your account" title="Your profile" lead="What colleagues see about your practice. Use the pencils to change any part; PsyAlliance also uses it to suggest you for the right referrals and cover." />
      <Banner
        error={sp.error || sp.avatar_error}
        ok={sp.availability_saved ? "Availability saved and confirmed as of today." : sp.saved ? (sp.photo === "imported" ? "Profile saved, with the photo from your imported profile." : "Profile saved.") : sp.avatar_saved ? "Photo updated." : null}
      />
      <BioImportBox prominent={pct < 70 || !!importDemo} mode={pct < 70 ? "setup" : "update"} demo={importDemo} />
      <ProfileCards />

      <div className="pf-layout">
        <form action={saveProfile} id="profile-form" className="pf-main">
          <BackField back={back} />
          {importDemo?.marks && <AutofillMarks ids={importDemo.marks} ranks={importDemo.ranks} />}

          <section className="card pf-head" data-block="basics" aria-label="Your profile">
            <div className="pf-head-row">
              <span className="pf-avatar" data-self-avatar="" data-size="96">
                <PersonAvatar name={name} url={avatarUrl} size={96} rel="you" />
                <button type="button" className="pf-photo-edit" data-edit="photo" aria-label="Change your photo" title="Change your photo">
                  <Pencil />
                </button>
              </span>
              <div className="pf-head-text">
                <h2 className="pf-name" data-self-name="">{display}</h2>
                <p className="pf-role">{roleLabel(profile?.qualification_level)}<span data-preview="where" data-from="basics">{where ? ` · ${where}` : ""}</span></p>
                <div className="profile-chips">
                  {reviewed.length > 0 ? <Status>Professional evidence reviewed</Status> : licenses.length ? <Status tone="warn">License awaiting review</Status> : <Status tone="warn">Add your license</Status>}
                  {founding && <span className="founding-badge">Founding member &middot; {foundingLabel(founding)}</span>}
                  {profile?.board_certified && <span className="chip">Board certified</span>}
                </div>
                {(jurisdiction || since) && (
                  <p className="pf-meta">
                    {jurisdiction && <><b>Licensed in</b> {jurisdiction}</>}
                    {jurisdiction && since ? " · " : ""}
                    {since && <><b>Member since</b> {new Date(since).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: APP_TIME_ZONE })}</>}
                  </p>
                )}
              </div>
              <Edit sec="basics" label="name, qualification and practice" />
            </div>
            <div className="pf-about" data-block="about">
              <div className="pf-about-head">
                <h3>About</h3>
                <Edit sec="about" label="your bio" />
              </div>
              <div data-preview="about">{profile?.bio ? <p>{profile.bio}</p> : <p className="pf-empty">Add two or three sentences about who you work with and how.</p>}</div>
            </div>
            {ledger && ledger.length > 0 && (
              <div className="home-ledger profile-ledger">
                <span className="home-ledger-label">This year on PsyAlliance</span>
                <ul>{ledger.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            )}
          </section>

          <section className="card pf-block" aria-labelledby="pf-practice-title">
            <h2 id="pf-practice-title" className="pf-block-title">Your practice</h2>
            <ul className="pf-rows">
              {rows.map((r) => (
                <li key={r.sec} className={`pf-row${r.todo || !r.value ? " is-empty" : ""}`} data-block={r.sec}>
                  <div className="pf-row-text">
                    <b>{r.label}</b>
                    <span data-preview={r.sec}>{r.value || (r.note && r.sec !== "insurance" ? r.note : r.sec === "insurance" ? "Self-pay only" : "Not added yet")}</span>
                    {r.value && r.note && r.sec !== "insurance" && <small>{r.note}</small>}
                  </div>
                  <Edit sec={r.sec} label={r.label} />
                </li>
              ))}
            </ul>
          </section>

          <PracticeSetup />

          <Card sec="basics" title="Name, qualification and practice" help="Your name, qualification and where you practice. These decide who you can be matched with.">
            <div className="fields">
              <label className="field">
                Full name
                <input id="full_name" name="full_name" defaultValue={profile?.full_name || ""} />
              </label>
              <label className="field">
                Title
                <input id="credential_prefix" name="credential_prefix" placeholder="Dr" defaultValue={profile?.credential_prefix || ""} />
              </label>
              <label className="field">
                Qualification
                <select id="qualification_level" name="qualification_level" defaultValue={profile?.qualification_level || ""}>
                  <option value="" disabled>Choose your degree</option>
                  <option value="PhD">PhD, psychologist</option>
                  <option value="PsyD">PsyD, psychologist</option>
                  <option value="EdD">EdD, psychologist</option>
                  <option value="MD">MD, psychiatrist</option>
                  <option value="DO">DO, psychiatrist</option>
                </select>
              </label>
              <label className="field">
                Practice city
                <input id="primary_practice_city" name="primary_practice_city" defaultValue={profile?.primary_practice_city || ""} />
              </label>
              <label className="field">
                Practice state
                <select id="primary_state" name="primary_state" defaultValue={profile?.primary_state || ""}>
                  <option value="">Choose a state</option>
                  {US_STATES.map((x) => (
                    <option key={x.code} value={x.code}>{x.name}</option>
                  ))}
                </select>
                <small>Where you see clients in person. Add each licensed state in Credentials.</small>
              </label>
              <label className="field">
                Practice website
                <input id="practice_website" name="practice_website" placeholder="https://" defaultValue={profile?.practice_website || ""} />
              </label>
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 14 }}>
              <label className="checkline">
                <input id="board_certified" type="checkbox" name="board_certified" defaultChecked={!!profile?.board_certified} />
                Board certified
              </label>
              {psypactEligible(profile?.primary_state, profile?.qualification_level) ? (
                <label className="checkline">
                  <input id="psypact_participating" type="checkbox" name="psypact_participating" defaultChecked={!!profile?.psypact_participating} />
                  I hold PSYPACT authority to practice telepsychology in other member states (APIT)
                </label>
              ) : (
                <p className="micro-note" style={{ margin: 0 }}>
                  PSYPACT applies to psychologists whose home state is a member state. {profile?.primary_state ? `${profile.primary_state} isn't a member state, so colleagues match you only where you hold a license.` : "Add your primary state to see whether it applies to you."}
                </p>
              )}
            </div>
          </Card>

          <Card sec="about" title="About" help="Colleagues see this on your profile. Up to 700 characters.">
            <label className="field full">
              Short professional bio
              <textarea id="bio" name="bio" rows={6} maxLength={700} defaultValue={profile?.bio || ""} placeholder="Who you work with and how, in two or three sentences." />
            </label>
          </Card>

          <Card sec="specialties" title="Practice focus" help="Tick every area you work with, then rank your top five. Rank 1 counts most in matching.">
            <p className="label-line">Your top five, in order</p>
            <p id="rank-confirm" className="notice-line" hidden>
              We ranked these from your profile. Is this the right order? Change any you&rsquo;d put differently, then save.
            </p>
            <div className="rank-list">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n}>
                  <span className="round-number">{n}</span>
                  <select name={`spec_rank_${n}`} defaultValue={String(rankAt(n))} aria-label={`Specialty rank ${n}`}>
                    <option value="">{n <= 3 ? "Choose a specialty" : "Optional"}</option>
                    {specs.map((lv) => (
                      <option key={lv.id} value={lv.id}>{lv.value}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="label-line" style={{ marginTop: 18 }}>All areas you cover</p>
            <CheckGrid items={specs} selected={selected} />
          </Card>

          <Card sec="populations" title="Clients and sessions" help="Age groups and session types are used in matching; populations are shown on your profile.">
            <p className="label-line">Age groups</p>
            <CheckGrid items={by.age_group_specialism || []} selected={selected} />
            <p className="label-line" style={{ marginTop: 14 }}>Session types</p>
            <CheckGrid items={by.session_type || []} selected={selected} />
            <p className="label-line" style={{ marginTop: 14 }}>Populations</p>
            <CheckGrid items={by.sexual_orientation_specialism || []} selected={selected} />
          </Card>

          <Card sec="modalities" title="Approaches">
            <CheckGrid items={by.treatment_modality || []} selected={selected} />
          </Card>

          <Card sec="insurance" title="Insurance" help="Panels you're in network with. Leave all unticked if you're self-pay only.">
            <CheckGrid items={by.insurance || []} selected={selected} />
          </Card>

          <Card sec="languages" title="Languages" help="Languages you can offer therapy in.">
            <CheckGrid items={by.language || []} selected={selected} />
          </Card>

          <Card sec="consult-pref" title="Consultation groups" help="Shown on your profile and used to suggest you in Consult.">
            <label className="checkline">
              <input type="checkbox" name="open_to_group_consultation" defaultChecked={profile?.open_to_group_consultation ?? true} />
              Open to joining consultation groups
            </label>
          </Card>

          <Card sec="contact" title="Contact details" help="Private: only you and PsyAlliance admins see these. Colleagues reach you through messages.">
            <div className="fields">
              <label className="field">
                Phone
                <input id="contact_phone" name="contact_phone" defaultValue={profile?.contact_phone || ""} />
              </label>
              <label className="field">
                Email
                <input id="contact_email" name="contact_email" type="email" defaultValue={profile?.contact_email || ""} />
              </label>
            </div>
          </Card>

          <Card sec="self" title="About you" help="Optional self-disclosure, never used for matching. Some clients look for a clinician who shares part of their background. Leave any of this blank.">
            <label className="field" style={{ maxWidth: 240 }}>
              Pronouns
              <input id="pronoun" name="pronoun" placeholder="e.g. she/her" defaultValue={profile?.pronoun || ""} />
            </label>
            {SELF_DISCLOSURE.map(([cat, label]) => (
              <div key={cat} style={{ marginTop: 14 }}>
                <p className="label-line">{label}</p>
                <div className="check-grid">
                  {(by[cat] || []).map((lv) =>
                    cat === "sex" ? (
                      <label key={lv.id}>
                        <input type="radio" name="single_sex" value={lv.id} defaultChecked={selected.has(lv.id)} />
                        {lv.value}
                      </label>
                    ) : (
                      <label key={lv.id}>
                        <input type="checkbox" name={`lv_${lv.id}`} defaultChecked={selected.has(lv.id)} />
                        {lv.value}
                      </label>
                    ),
                  )}
                </div>
              </div>
            ))}
          </Card>
        </form>

        {/* The photo has its own upload form, so its card sits outside the profile form. */}
        <dialog id="dlg-photo" className="pf-card" data-sec="photo" aria-labelledby="dlg-photo-t">
          <div className="pf-card-head">
            <div>
              <p className="eyebrow">Your profile</p>
              <h2 id="dlg-photo-t">Photo</h2>
              <p className="pf-card-help">A professional headshot. Only verified, signed-in members see it.</p>
            </div>
            <button type="button" className="pf-card-x" data-cancel="" aria-label="Close photo">&times;</button>
          </div>
          <div className="pf-card-body">
            <div className="row wrap" style={{ gap: 16, alignItems: "center" }}>
              <PersonAvatar name={name} url={avatarUrl} size={72} rel="you" />
              <AvatarPicker action={uploadAvatar} hasPhoto={!!avatarUrl} />
            </div>
          </div>
        </dialog>

        <aside className="pf-aside">
          <section className="card pf-strength" aria-labelledby="pf-strength-title">
            <h2 id="pf-strength-title" className="pf-block-title">Profile strength</h2>
            <div className="meter" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={checks.length} aria-label="Profile strength">
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="pf-strength-line">
              <b>{essDone === essential.length ? "Ready for colleagues to find you." : `${essential.length - essDone} essential${essential.length - essDone === 1 ? "" : "s"} to go.`}</b> {doneCount} of {checks.length} parts added.
            </p>
            {checks.some((c) => !c.done) ? (
              <ul className="pf-todo">
                {checks.filter((c) => !c.done).map((c) => (
                  <li key={c.label} className={ESSENTIAL.includes(c.label) ? "is-essential" : ""}>
                    <span>{c.label}{ESSENTIAL.includes(c.label) && <small>Essential</small>}</span>
                    {c.href.startsWith("#") ? (
                      <button type="button" className="text-link" data-edit={c.href.slice(1)}>Add</button>
                    ) : c.href.startsWith("card:") ? (
                      <PageCardLink href={c.href.slice(5)} title={c.label.startsWith("License") ? "Credentials" : "Availability"} className="text-link">Add</PageCardLink>
                    ) : (
                      <a className="text-link" href={c.href}>Add</a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">Everything is in place. Keep your availability current.</p>
            )}
          </section>
          <section className="card pf-account">
            <h2 className="pf-block-title">Your account</h2>
            <p className="small">Sign-in, privacy, data export and notifications are in Settings &amp; preview controls, bottom left.</p>
            <DeleteAccount />
          </section>
        </aside>
      </div>
    </>
  );
}
