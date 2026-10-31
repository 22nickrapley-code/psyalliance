import { psypactEligible } from "@/lib/psypact";
import { APP_TIME_ZONE } from "@/lib/dates";
import { effectiveReferral } from "@/lib/availability";
import { saveProfile, uploadAvatar } from "./actions";
import { professionFor, professionLabel, clinicianName, roleLabel } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";
import { ProfileSectionNav, type NavSection } from "./sections";
import BioImportBox, { AutofillMarks, type ImportDemo } from "./bio-import";
import { FirstVisit } from "../_components/first-visit";
import { TOUR_URL } from "@/lib/env";
import { AvatarPicker } from "./avatar-picker";
import { HashOpener } from "./hash-opener";
import { PageHead, Banner, PersonAvatar, Status } from "../_components/ui";
import { ProfileTabs } from "../_components/profile-tabs";
import { BackLink, BackField } from "../_components/back-link";
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

// Each part of the editor folds away and says whether it's done, so the
// long form reads as a short checklist. Everything is one form: nothing is
// lost by folding a section, and one Save covers them all.
// 1.0: one section at a time (the menu on the left switches between them); every field stays in the one form, so one Save covers all.
function Section({ title, help, children, id, done }: { title: string; help?: string; children: React.ReactNode; id?: string; done?: boolean; open?: boolean }) {
  return (
    <section className="card profile-section" id={id} data-sec={id}>
      <div className="profile-section-head">
        <h2 className="profile-section-title">{title}</h2>
        {done === undefined ? <span className="micro-note">Optional</span> : done ? <Status>Done</Status> : <Status tone="warn">To do</Status>}
      </div>
      {help && <p className="small profile-section-help">{help}</p>}
      {children}
    </section>
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
    { label: "Short bio", done: !!profile?.bio, href: "#basics" },
    { label: "Top specialties ranked", done: ranked.length >= 3, href: "#specialties" },
    { label: "Age groups", done: pick("age_group_specialism").length > 0, href: "#populations" },
    { label: "Modalities", done: pick("treatment_modality").length > 0, href: "#modalities" },
    { label: "Insurance", done: pick("insurance").length > 0, href: "#insurance" },
    { label: "Languages", done: pick("language").length > 0, href: "#languages" },
    { label: "Session types", done: pick("session_type").length > 0, href: "#populations" },
    { label: "License in Credentials", done: (licenceCount || 0) > 0, href: "/dashboard/credentials?back=%2Fdashboard%2Fprofile" },
    { label: "Availability confirmed", done: !!profile?.availability_confirmed_at, href: "/dashboard/availability?back=%2Fdashboard%2Fprofile" },
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
  // The section menu (1.0): each section with its state, in the order of the form.
  const doneOf = (label: string) => checks.find((c) => c.label === label)?.done;
  const NAV: NavSection[] = [
    { id: "basics", title: "Basics", state: basicsDone ? "done" : "todo" },
    { id: "photo", title: "Photo", state: profile?.avatar_path ? "done" : "todo" },
    { id: "specialties", title: "Specialties", state: doneOf("Top specialties ranked") ? "done" : "todo" },
    { id: "populations", title: "Clients and sessions", state: pick("age_group_specialism").length > 0 && pick("session_type").length > 0 ? "done" : "todo" },
    { id: "modalities", title: "Modalities", state: doneOf("Modalities") ? "done" : "todo" },
    { id: "insurance", title: "Insurance", state: doneOf("Insurance") ? "done" : "todo" },
    { id: "languages", title: "Languages", state: doneOf("Languages") ? "done" : "todo" },
    { id: "consult-pref", title: "Consult", state: "optional" },
    { id: "contact", title: "Contact details", state: "optional" },
    { id: "about", title: "About you", state: "optional" },
  ];

  const name = profile?.full_name || "Your name";
  const display = clinicianName(name, profile?.qualification_level, profile?.credential_prefix);
  const where = [profile?.primary_practice_city, profile?.primary_state].filter(Boolean).join(", ");

  if (!editing) {
    const stateName = (c: string) => US_STATES.find((s) => s.code === c)?.name || c;
    const reviewed = licenses.filter((l) => l.reviewed);
    const joinSome = (xs: string[], n: number) => (xs.length > n ? `${xs.slice(0, n).join(", ")} +${xs.length - n}` : xs.join(", "));
    const glance: [string, string][] = [
      ["Practice focus", ranked.slice(0, 3).map((l) => l.value).join(" · ") || "Not set"],
      ["Approaches", joinSome(pick("treatment_modality").map((l) => l.value), 3) || "Not set"],
      ["Age groups", pick("age_group_specialism").map((l) => l.value).join(", ") || "Not set"],
      ["Sessions", pick("session_type").map((l) => l.value).join(", ") || "Not set"],
      ["Languages", pick("language").map((l) => l.value).join(", ") || "Not set"],
      ["Insurance", joinSome(pick("insurance").map((l) => l.value), 3) || "Self-pay only"],
      ["Jurisdiction", licenses.length ? licenses.map((l) => stateName(l.state)).join(", ") + (profile?.psypact_participating ? " · PSYPACT" : "") : "No license on file"],
      ...(profile?.founding_member_since || profile?.created_at
        ? ([["Member since", new Date(profile.founding_member_since || profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: APP_TIME_ZONE })]] as [string, string][])
        : []),
    ];
    return (
      <>
        <BackLink back={back} />
        <ProfileTabs active="profile" back={back} />
        <PageHead
          eyebrow="Your account"
          title="Your profile"
          lead="What colleagues see about your practice. PsyAlliance also uses it to suggest you for the right referrals and cover."
          actions={<a className="btn lg" href="/dashboard/profile?edit=1">Edit profile</a>}
        />
        <Banner ok={sp.availability_saved ? "Availability saved and confirmed as of today. This is what colleagues now see." : sp.saved ? (sp.photo === "imported" ? "Profile saved, with the photo from your imported profile." : "Profile saved.") : sp.avatar_saved ? "Photo updated." : null} />
        <div className="split">
          <section className="card roomy">
            <div className="row" style={{ gap: 18, alignItems: "center" }}>
              <PersonAvatar name={name} url={avatarUrl} size={76} rel="you" />
              <div style={{ minWidth: 0 }}>
                <h2 className="serif-title" style={{ fontSize: 32, margin: 0 }}>{display}</h2>
                <p style={{ margin: "4px 0 10px", fontSize: 15 }}>{roleLabel(profile?.qualification_level)}{where ? ` · ${where}` : ""}</p>
                <div className="profile-chips">
                  {reviewed.length > 0 ? <Status>Professional evidence reviewed</Status> : licenses.length ? <Status tone="warn">License awaiting review</Status> : <Status tone="warn">Add your license</Status>}
                  {founding && <span className="founding-badge">Founding member &middot; {foundingLabel(founding)}</span>}
                </div>
              </div>
            </div>
            {profile?.bio && <p className="lead-text" style={{ marginTop: 20 }}>{profile.bio}</p>}
            {ledger && ledger.length > 0 && (
              <div className="home-ledger profile-ledger">
                <span className="home-ledger-label">This year on PsyAlliance</span>
                <ul>{ledger.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            )}
            <ul className="glance" style={{ marginTop: 16, borderTop: "1px solid #e3e9e2" }}>
              {glance.map(([k, v]) => (
                <li key={k}><span>{k}</span><strong>{v}</strong></li>
              ))}
            </ul>
          </section>
          <aside className="stack">
            <section className="card tint roomy">
              <div className="eyebrow" data-measure="essential">Essential setup: {essDone} of {essential.length} done</div>
              <h2 className="serif-title" style={{ fontSize: 26 }}>{essDone === essential.length ? "Ready for colleagues to find you." : "A few essentials left."}</h2>
              <ul className="summary-list completeness" style={{ marginTop: 10 }}>
                {essential.map((c) => (
                  <li key={c.label} className={c.done ? "is-done" : "is-todo"}>
                    <span>{c.done ? "✓ " : ""}{c.label}</span>
                    <strong>{c.done ? "Done" : <a href={c.href.startsWith("#") ? `/dashboard/profile?edit=1${c.href}` : c.href}>Add</a>}</strong>
                  </li>
                ))}
              </ul>
              <div className="eyebrow" data-measure="optional" style={{ marginTop: 16 }}>Optional detail: {optDone} of {optional.length} added</div>
              <div className="meter" role="progressbar" aria-valuenow={optDone} aria-valuemin={0} aria-valuemax={optional.length} aria-label="Optional profile detail">
                <span style={{ width: `${Math.round((optDone / optional.length) * 100)}%` }} />
              </div>
              <p className="small" style={{ margin: "8px 0 0" }}>Optional detail, such as a photo or a bio, helps colleagues know you. It is not needed to use PsyAlliance.</p>
              {optDone < optional.length ? (
                <ul className="summary-list completeness" style={{ marginTop: 8 }}>
                  {optional.filter((c) => !c.done).map((c) => (
                    <li key={c.label} className="is-todo"><span>{c.label}</span><strong><a href={c.href.startsWith("#") ? `/dashboard/profile?edit=1${c.href}` : c.href}>Add</a></strong></li>
                  ))}
                </ul>
              ) : null}
            </section>
            <section className="card roomy">
              <h2 className="serif-title" style={{ fontSize: 24, marginTop: 0 }}>Your account</h2>
              <div className="control-stack">
                <a className="btn secondary block" href="/dashboard/settings">Privacy and settings</a>
              </div>
              <DeleteAccount />
            </section>
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink back={back} />
      <ProfileTabs active="profile" back={back} />
      {pct < 70 && !importDemo && (
        <FirstVisit id="profile" what="Profile set-up" title="Setting up your profile?" length="1-minute" exampleHref={`${TOUR_URL}/profile`} />
      )}
      <PageHead
        eyebrow="Your profile"
        title="Edit your profile"
        lead="Every referral and cover suggestion is computed from these facts. No client information lives here."
        actions={
          <>
            <a className="btn secondary" href={back || "/dashboard/profile"}>Cancel</a>
            <button type="submit" form="profile-form" className="btn">Save profile</button>
          </>
        }
      />
      <Banner
        error={sp.error || sp.avatar_error}
        ok={sp.availability_saved ? "Availability saved and confirmed as of today. This is what colleagues now see." : sp.saved ? "Profile saved." : sp.avatar_saved ? "Photo updated." : null}
      />
      <HashOpener />
      <BioImportBox prominent={pct < 70 || !!importDemo} demo={importDemo} />
      <div className="profile-edit" data-profile-edit>
        <ProfileSectionNav sections={NAV} />
        <div className="stack profile-main">
          <section className="card profile-section" id="photo" data-sec="photo">
            <div className="card-title"><h2 className="profile-section-title">Photo</h2>{profile?.avatar_path ? <Status>Done</Status> : <Status tone="warn">To do</Status>}</div>
            <p className="small">A professional headshot. Only verified, signed-in members see it.</p>
            <div className="row wrap" style={{ gap: 16, alignItems: "center" }}>
              <span data-self-avatar="" data-size="72"><PersonAvatar name={name} url={avatarUrl} size={72} rel="you" /></span>
              <AvatarPicker action={uploadAvatar} hasPhoto={!!avatarUrl} />
            </div>
          </section>

          <form action={saveProfile} id="profile-form" className="stack">
            <BackField back={back} />
            {importDemo?.marks && <AutofillMarks ids={importDemo.marks} ranks={importDemo.ranks} />}
            <Section title="Basics" id="basics" done={basicsDone} help="Your name, qualification and where you practice. These decide who you can be matched with.">
              <div className="fields">
                <label className="field">
                  Full name
                  <input id="full_name" name="full_name" defaultValue={profile?.full_name || ""} required />
                </label>
                <label className="field">
                  Title
                  <input id="credential_prefix" name="credential_prefix" placeholder="Dr" defaultValue={profile?.credential_prefix || ""} />
                </label>
                <label className="field">
                  Qualification
                  <select id="qualification_level" name="qualification_level" defaultValue={profile?.qualification_level || ""} required>
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
                  <select id="primary_state" name="primary_state" defaultValue={profile?.primary_state || ""} required>
                    <option value="">Choose a state</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                  <small>Where you see clients in person. Add each licensed state in Credentials.</small>
                </label>
                <label className="field">
                  Practice website
                  <input id="practice_website" name="practice_website" placeholder="https://" defaultValue={profile?.practice_website || ""} />
                </label>
                <label className="field full">
                  Short professional bio
                  <textarea id="bio" name="bio" rows={4} maxLength={700} defaultValue={profile?.bio || ""} placeholder="Who you work with and how, in two or three sentences." />
                  <small>Up to 700 characters. Colleagues see this on your profile.</small>
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
            </Section>

            <Section
              title="Specialties"
              id="specialties"
              done={ranked.length >= 3}
              open={ranked.length < 3}
              help="Tick every area you work with. Then rank your top five beneath: rank 1 counts most in matching."
            >
              <p className="label-line">Areas you cover</p>
              <CheckGrid items={specs} selected={selected} />
              <p className="label-line" style={{ marginTop: 18 }}>Your top five, in order</p>
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
            </Section>

            <Section title="Clients and sessions" id="populations" done={pick("age_group_specialism").length > 0 && pick("session_type").length > 0} help="Age groups and session types are used in matching; populations are shown on your profile.">
              <p className="label-line">Age groups</p>
              <CheckGrid items={by.age_group_specialism || []} selected={selected} />
              <p className="label-line" style={{ marginTop: 14 }}>Session types</p>
              <CheckGrid items={by.session_type || []} selected={selected} />
              <p className="label-line" style={{ marginTop: 14 }}>Populations</p>
              <CheckGrid items={by.sexual_orientation_specialism || []} selected={selected} />
            </Section>

            <Section title="Modalities" id="modalities" done={pick("treatment_modality").length > 0}>
              <details open={pick("treatment_modality").length === 0}>
                <summary className="small" style={{ cursor: "pointer" }}>{pick("treatment_modality").length ? <>{pick("treatment_modality").map((l) => l.value).slice(0, 6).join(", ") + (pick("treatment_modality").length > 6 ? "..." : "")}<span className="change">Change</span></> : "Choose modalities"}</summary>
                <div style={{ marginTop: 10 }}>
                  <CheckGrid items={by.treatment_modality || []} selected={selected} />
                </div>
              </details>
            </Section>

            <Section title="Insurance" id="insurance" done={pick("insurance").length > 0} help="Panels you're in network with. Leave all unticked if you're self-pay only.">
              <details open={pick("insurance").length === 0}>
                <summary className="small" style={{ cursor: "pointer" }}>{pick("insurance").length ? <>{pick("insurance").map((l) => l.value).slice(0, 6).join(", ") + (pick("insurance").length > 6 ? "..." : "")}<span className="change">Change</span></> : "Choose insurance"}</summary>
                <div style={{ marginTop: 10 }}>
                  <CheckGrid items={by.insurance || []} selected={selected} />
                </div>
              </details>
            </Section>

            <Section title="Languages" id="languages" done={pick("language").length > 0} help="Languages you can offer therapy in.">
              <details open={pick("language").length === 0}>
                <summary className="small" style={{ cursor: "pointer" }}>{pick("language").length ? <>{pick("language").map((l) => l.value).join(", ")}<span className="change">Change</span></> : "Choose languages"}</summary>
                <div style={{ marginTop: 10 }}>
                  <CheckGrid items={by.language || []} selected={selected} />
                </div>
              </details>
            </Section>

            <Section title="Consult" id="consult-pref" help="Shown on your profile and used to suggest you in Consult.">
              <div className="stack" style={{ gap: 8 }}>
                <label className="checkline">
                  <input type="checkbox" name="open_to_group_consultation" defaultChecked={profile?.open_to_group_consultation ?? true} />
                  Open to joining consultation groups
                </label>
              </div>
            </Section>

            <Section title="Contact details" id="contact" help="Private: only you and PsyAlliance admins see these. Colleagues reach you through messages.">
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
            </Section>

            <section className="card profile-section" id="about" data-sec="about">
              <div className="profile-section-head"><h2 className="profile-section-title">About you</h2><span className="micro-note">Optional</span></div>
              <p className="small profile-section-help">Optional self-disclosure, never used for matching.</p>
              <p className="small" style={{ marginTop: 10 }}>Some clients look for a clinician who shares part of their background. Leave any of this blank.</p>
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
                      )
                    )}
                  </div>
                </div>
              ))}
            </section>

            <div className="save-bar">
              <span className="small">One save covers every section. If you leave with changes, we ask first.</span>
              <button type="submit" className="btn">Save profile</button>
            </div>
          </form>
        </div>

        <aside className="stack profile-aside">
          <section className="card tint">
            <div className="card-title">
              <h3>Setup and profile</h3>
              <span className="micro-note">{essential.length - essDone} essential to go</span>
            </div>
            <div className="eyebrow" data-measure="essential">Essential setup: {essDone} of {essential.length} done</div>
            <ul className="summary-list completeness" style={{ marginTop: 8 }}>
              {essential.map((c) => (
                <li key={c.label} className={c.done ? "is-done" : "is-todo"}>
                  <span>{c.done ? "✓ " : ""}{c.label}</span>
                  <strong>{c.done ? "Done" : <a href={c.href}>Add</a>}</strong>
                </li>
              ))}
            </ul>
            <div className="eyebrow" data-measure="optional" style={{ marginTop: 14 }}>Optional detail: {optDone} of {optional.length} added</div>
            <div className="meter" role="progressbar" aria-valuenow={optDone} aria-valuemin={0} aria-valuemax={optional.length} aria-label="Optional profile detail">
              <span style={{ width: `${Math.round((optDone / optional.length) * 100)}%` }} />
            </div>
            <ul className="summary-list completeness" style={{ marginTop: 8 }}>
              {optional.map((c) => (
                <li key={c.label} className={c.done ? "is-done" : "is-todo"}>
                  <span>{c.done ? "✓ " : ""}{c.label}</span>
                  <strong>{c.done ? "Done" : <a href={c.href}>Add</a>}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <div className="eyebrow">How colleagues see you</div>
            <div className="preview-frame" style={{ marginTop: 10 }}>
              <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span data-self-avatar="" data-size="48"><PersonAvatar name={name} url={avatarUrl} size={48} rel="you" /></span>
                <div style={{ minWidth: 0 }}>
                  <strong data-self-name="">{display}</strong>
                  <p className="small" style={{ margin: "2px 0 0" }}>
                    {professionLabel(professionFor(profile?.qualification_level))}
                    {where ? ` · ${where}` : ""}
                  </p>
                </div>
              </div>
              <ul className="reasons" style={{ marginTop: 10 }}>
                <li>{effectiveReferral(profile?.referral_availability, profile?.availability_confirmed_at, profile?.availability_paused_until).label}</li>
                {ranked.slice(0, 3).map((lv) => <li key={lv.id}>{lv.value}</li>)}
                {profile?.psypact_participating && <li>PSYPACT</li>}
              </ul>
              {profile?.bio && <p className="small" style={{ margin: "10px 0 0" }}>{profile.bio.length > 180 ? profile.bio.slice(0, 180) + "..." : profile.bio}</p>}
            </div>
            <p className="micro-note" style={{ margin: "10px 0 0" }}>Colleagues also see your reviewed license states, availability dates and activity on PsyAlliance.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
