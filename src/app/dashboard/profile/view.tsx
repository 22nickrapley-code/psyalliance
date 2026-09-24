import { effectiveReferral } from "@/lib/availability";
import { saveProfile, uploadAvatar } from "./actions";
import { professionFor, professionLabel } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";
import BioImportBox from "./bio-import";
import { AvatarPicker } from "./avatar-picker";
import { HashOpener } from "./hash-opener";
import { PageHead, Banner, PersonAvatar, Status } from "../_components/ui";

// Profile (Product Spec v1): the facts every match is computed against.
// Profession, specialties ranked 1 to 5, populations and age bands,
// modalities, insurance, languages, session types, practice location,
// PSYPACT, photo and a short bio. A completeness bar and a preview of how
// colleagues see you sit alongside. Licences live in Credentials.

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
function Section({ title, help, children, id, done, open }: { title: string; help?: string; children: React.ReactNode; id?: string; done?: boolean; open?: boolean }) {
  return (
    <details className="card profile-section" id={id} open={open}>
      <summary>
        <span className="profile-section-title">{title}</span>
        {done === undefined ? <span className="micro-note">Optional</span> : done ? <Status>Done</Status> : <Status tone="warn">To do</Status>}
      </summary>
      {help && <p className="small" style={{ marginTop: 10 }}>{help}</p>}
      {children}
    </details>
  );
}

export function ProfileView({ sp, profile, lookups, selectedRows, licenceCount, avatarUrl, me }: { sp: { saved?: string; avatar_saved?: string; avatar_error?: string; error?: string }; profile: any; lookups: { id: number; category: string; value: string }[] | null; selectedRows: { lookup_value_id: number; rank: number | null }[] | null; licenceCount: number | null; avatarUrl: string | null; me: string }) {
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
    { label: "Licence in Credentials", done: (licenceCount || 0) > 0, href: "/dashboard/credentials" },
    { label: "Availability confirmed", done: !!profile?.availability_confirmed_at, href: "/dashboard/availability" },
  ];
  const basicsDone = !!(profile?.full_name && profile?.qualification_level && profile?.primary_state && profile?.primary_practice_city);
  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checks.length) * 100);

  const name = profile?.full_name || "Your name";
  const display = profile?.credential_prefix ? `${profile.credential_prefix} ${name}` : name;
  const where = [profile?.primary_practice_city, profile?.primary_state].filter(Boolean).join(", ");

  return (
    <>
      <PageHead
        eyebrow="Your profile"
        title="What colleagues match against."
        lead="Every referral and cover suggestion is computed from these facts. No patient information lives here."
        actions={<button type="submit" form="profile-form" className="btn">Save profile</button>}
      />
      <Banner
        error={sp.error || sp.avatar_error}
        ok={sp.saved ? "Profile saved." : sp.avatar_saved ? "Photo updated." : null}
      />
      <HashOpener />
      <div className="split">
        <div className="stack">
          <BioImportBox />

          <section className="card" id="photo">
            <div className="card-title"><h3>Photo</h3>{profile?.avatar_path ? <Status>Done</Status> : <Status tone="warn">To do</Status>}</div>
            <p className="small">A professional headshot. Only verified, signed-in members see it.</p>
            <div className="row wrap" style={{ gap: 16, alignItems: "center" }}>
              <PersonAvatar name={name} url={avatarUrl} size={72} />
              <AvatarPicker action={uploadAvatar} hasPhoto={!!avatarUrl} />
            </div>
          </section>

          <form action={saveProfile} id="profile-form" className="stack">
            <Section title="The basics" id="basics" done={basicsDone} open={!basicsDone}>
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
                  <small>Where you see patients in person. Add each licensed state in Credentials.</small>
                </label>
                <label className="field">
                  Practice website
                  <input id="practice_website" name="practice_website" placeholder="https://" defaultValue={profile?.practice_website || ""} />
                </label>
                <label className="field full">
                  Short professional bio
                  <textarea name="bio" rows={4} maxLength={700} defaultValue={profile?.bio || ""} placeholder="Who you work with and how, in two or three sentences." />
                  <small>Up to 700 characters. Colleagues see this on your profile.</small>
                </label>
              </div>
              <div className="stack" style={{ gap: 8, marginTop: 14 }}>
                <label className="checkline">
                  <input id="board_certified" type="checkbox" name="board_certified" defaultChecked={!!profile?.board_certified} />
                  Board certified
                </label>
                <label className="checkline">
                  <input id="psypact_participating" type="checkbox" name="psypact_participating" defaultChecked={!!profile?.psypact_participating} />
                  I hold PSYPACT authority to practise telepsychology across participating states (APIT)
                </label>
              </div>
            </Section>

            <Section
              title="Specialties"
              id="specialties"
              done={ranked.length >= 3}
              open={ranked.length < 3}
              help="Rank your top five. Rank 1 counts most in matching. Tick anything else you treat below."
            >
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
              <details style={{ marginTop: 14 }}>
                <summary className="small" style={{ cursor: "pointer" }}>Other specialties you treat ({pick("treatment_specialism").filter((lv) => typeof selected.get(lv.id) !== "number").length})</summary>
                <div style={{ marginTop: 10 }}>
                  <CheckGrid items={specs} selected={selected} />
                </div>
              </details>
            </Section>

            <Section title="Who you see" id="populations" done={pick("age_group_specialism").length > 0 && pick("session_type").length > 0} help="Age groups and session types are used in matching; populations are shown on your profile.">
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

            <Section title="Consult and supervision" help="Shown on your profile and used to suggest you in Consult.">
              <div className="stack" style={{ gap: 8 }}>
                <label className="checkline">
                  <input type="checkbox" name="open_to_group_consultation" defaultChecked={profile?.open_to_group_consultation ?? true} />
                  Open to joining consultation groups
                </label>
                <label className="checkline">
                  <input type="checkbox" name="open_to_give_supervision" defaultChecked={!!profile?.open_to_give_supervision} />
                  Open to providing supervision
                </label>
                <label className="checkline">
                  <input type="checkbox" name="open_to_receive_supervision" defaultChecked={!!profile?.open_to_receive_supervision} />
                  Looking for supervision
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

            <details className="card">
              <summary style={{ cursor: "pointer" }}>
                <strong>About you</strong> <span className="small">(optional self-disclosure, never used for matching)</span>
              </summary>
              <p className="small" style={{ marginTop: 10 }}>Some patients look for a clinician who shares part of their background. Leave any of this blank.</p>
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
            </details>

            <div className="save-bar">
              <span className="small">One save covers every section, including folded ones.</span>
              <button type="submit" className="btn">Save profile</button>
            </div>
          </form>
        </div>

        <aside className="stack">
          <section className="card tint">
            <div className="card-title">
              <h3>Profile {pct}% complete</h3>
              {pct === 100 ? <Status>Complete</Status> : <span className="micro-note">{checks.length - doneCount} to go</span>}
            </div>
            <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <span style={{ width: `${pct}%` }} />
            </div>
            <ul className="summary-list" style={{ marginTop: 10 }}>
              {checks.map((c) => (
                <li key={c.label}>
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
                <PersonAvatar name={name} url={avatarUrl} size={48} />
                <div style={{ minWidth: 0 }}>
                  <strong>{display}</strong>
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
            <p className="micro-note" style={{ margin: "10px 0 0" }}>Colleagues also see your reviewed licence states, availability dates and activity on PsyAlliance.</p>
          </section>
          <section className="card">
            <div className="eyebrow">Elsewhere</div>
            <ul className="summary-list">
              <li><span>Licences and renewals</span><strong><a href="/dashboard/credentials">Credentials</a></strong></li>
              <li><span>Referrals, cover, consult</span><strong><a href="/dashboard/availability">Availability</a></strong></li>
              <li><span>Who can see you</span><strong><a href="/dashboard/settings">Settings</a></strong></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
