import { createClient } from "@/lib/supabase/server";
import { saveProfile, submitCredentialVerification, saveAvailability, uploadAvatar, toggleOpenToField } from "./actions";
import { resolveAvatarUrl } from "@/lib/avatars";
import BioImportBox from "./bio-import";
import { ProfileView, type SpecialismValue } from "../profile-view";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CATEGORY_LABELS: Record<string, string> = {
  treatment_specialism: "Treatment specialisms (rank your top few, 1 = highest)",
  treatment_modality: "Treatment modalities (rank your top few, 1 = highest)",
  insurance: "Insurance accepted",
  language: "Languages spoken",
  session_type: "Session types offered",
  age_group_specialism: "Client age groups you work with",
  sexual_orientation_specialism: "Client populations you specialize with (sexual orientation)",
};

// Self-disclosed practitioner identity, shown separately from client-population
// specialisms above, entirely optional, used only to help clients find a
// good fit, never required and never shown as a search filter to anyone else
// without the practitioner choosing to display it.
const SELF_DISCLOSURE_CATEGORY_LABELS: Record<string, string> = {
  ethnicity: "Your ethnicity (optional, select any that apply)",
  gender_identity: "Your gender identity (optional, select any that apply)",
  sex: "Your sex (optional)",
};
const SINGLE_SELECT_CATEGORIES = new Set(["sex"]);

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; avatar_saved?: string; avatar_error?: string; error?: string; edit?: string }>;
}) {
  const { saved, avatar_saved, avatar_error, error, edit } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: lookups }, { data: selected }, { data: verifications }, { data: availability }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
      supabase.from("lookup_values").select("id, category, value").order("category").order("value"),
      supabase.from("profile_lookup_values").select("lookup_value_id, rank").eq("profile_id", user!.id),
      supabase
        .from("credential_verifications")
        .select("*")
        .eq("profile_id", user!.id)
        .order("created_at", { ascending: false }),
      supabase.from("profile_availability").select("day_of_week").eq("profile_id", user!.id),
    ]);

  const avatarUrl = await resolveAvatarUrl(supabase, profile?.avatar_path);
  const initials = (profile?.full_name || user!.email || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("") || "U";

  const availableDays = new Set((availability || []).map((a) => a.day_of_week));

  const selectedMap = new Map((selected || []).map((s) => [s.lookup_value_id, s.rank]));

  const byCategory: Record<string, { id: number; value: string }[]> = {};
  for (const lv of lookups || []) {
    byCategory[lv.category] = byCategory[lv.category] || [];
    byCategory[lv.category].push({ id: lv.id, value: lv.value });
  }

  const hasSavedProfile = !!profile?.full_name;
  const showEditForm = edit === "1" || !hasSavedProfile;

  const savedBanner = saved === "1" && (
    <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
      Profile saved.
    </div>
  );
  const avatarSavedBanner = avatar_saved === "1" && (
    <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
      Photo updated.
    </div>
  );
  const avatarErrorBanner = avatar_error && (
    <div className="card" style={{ borderColor: "#b3392c", background: "rgba(179,57,44,0.08)" }}>
      {avatar_error}
    </div>
  );
  const errorBanner = error && (
    <div className="card" style={{ borderColor: "#b3392c", background: "rgba(179,57,44,0.08)" }}>
      {error}
    </div>
  );

  const credentialVerificationCard = (
    <div className="card">
      <h2>Credential verification</h2>
      <p className="muted">
        Submit your license details for review. A human (Nick or Rena) checks this against your
        state board's lookup before your profile is marked verified and appears in the
        directory.
      </p>
      <table style={{ marginBottom: "1rem" }}>
        <thead>
          <tr>
            <th>Source</th>
            <th>State</th>
            <th>License #</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(verifications || []).map((v) => (
            <tr key={v.id}>
              <td>{v.source}</td>
              <td>{v.state || "-"}</td>
              <td>{v.license_number}</td>
              <td>{v.matched ? "Matched" : v.flagged_reason ? `Flagged: ${v.flagged_reason}` : "Awaiting review"}</td>
            </tr>
          ))}
          {(verifications || []).length === 0 && (
            <tr>
              <td colSpan={4} className="muted">No submissions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <form action={submitCredentialVerification} className="field-row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ maxWidth: 160 }}>
          <label htmlFor="source">Source</label>
          <select id="source" name="source" defaultValue="state_board">
            <option value="state_board">State board</option>
            <option value="asppb">ASPPB</option>
            <option value="npi_registry">NPI registry</option>
          </select>
        </div>
        <div className="field" style={{ maxWidth: 100 }}>
          <label htmlFor="ver_state">State</label>
          <input id="ver_state" name="state" type="text" maxLength={2} placeholder="TX" />
        </div>
        <div className="field">
          <label htmlFor="license_number">License number</label>
          <input id="license_number" name="license_number" type="text" required />
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <button type="submit">Submit for review</button>
        </div>
      </form>
    </div>
  );

  if (!showEditForm) {
    // Only the clinical categories shown on the polished profile view -
    // self-disclosure categories (ethnicity, gender identity, sex) are
    // deliberately left off, same whitelist as the /people/[id] view of
    // someone else's profile.
    const VISIBLE_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));
    const specialismsByCategory: Record<string, { value: string; rank: number | null }[]> = {};
    for (const [category, values] of Object.entries(byCategory)) {
      if (!VISIBLE_CATEGORIES.has(category)) continue;
      for (const v of values) {
        if (!selectedMap.has(v.id)) continue;
        specialismsByCategory[category] = specialismsByCategory[category] || [];
        specialismsByCategory[category].push({ value: v.value, rank: selectedMap.get(v.id) ?? null });
      }
    }

    return (
      <div>
        <h1>Your profile</h1>
        <p className="muted">
          This is what appears in the verified directory once your credentials are checked. No
          patient information lives here.
        </p>

        {savedBanner}
        {avatarSavedBanner}
        {avatarErrorBanner}
        {errorBanner}

        <ProfileView
          data={{
            id: user!.id,
            fullName: profile.full_name,
            credentialPrefix: profile.credential_prefix,
            qualificationLevel: profile.qualification_level,
            boardCertified: !!profile.board_certified,
            city: profile.primary_practice_city,
            state: profile.primary_state,
            acceptingReferrals: !!profile.accepting_referrals,
            psypactParticipating: !!profile.psypact_participating,
            avatarUrl,
            practiceWebsite: profile.practice_website,
            contactPhone: profile.contact_phone,
            contactEmail: profile.contact_email,
            openToGroupConsultation: !!profile.open_to_group_consultation,
            openToGiveSupervision: !!profile.open_to_give_supervision,
            openToReceiveSupervision: !!profile.open_to_receive_supervision,
            availableDays,
            specialismsByCategory,
          }}
          actions={<a href="/dashboard/profile?edit=1" className="btn secondary">Edit profile</a>}
          onToggleOpenTo={toggleOpenToField}
        />

        {credentialVerificationCard}
      </div>
    );
  }

  return (
    <div>
      <h1>Your profile</h1>
      <p className="muted">
        This is what appears in the verified directory once your credentials are checked. No
        patient information lives here.
      </p>

      {hasSavedProfile && (
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted">Editing your profile details.</span>
          <a href="/dashboard/profile" className="btn secondary">Cancel, view profile</a>
        </div>
      )}

      {savedBanner}
      {avatarSavedBanner}
      {avatarErrorBanner}
      {errorBanner}

      <div className="card">
        <h2>Professional photo</h2>
        <p className="muted">
          A headshot the way you'd expect on a public practice profile. Helps colleagues recognize
          you and puts a face to a referral or coverage request. Only visible to other verified,
          signed-in members, never public.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Your profile photo"
              width={84}
              height={84}
              style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto", border: "1px solid var(--border)" }}
            />
          ) : (
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                background: "var(--gold)",
                color: "#2a2313",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                fontWeight: 700,
                flex: "0 0 auto",
              }}
            >
              {initials}
            </div>
          )}
          <form action={uploadAvatar} encType="multipart/form-data" style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap" }}>
            <div className="field">
              <label htmlFor="avatar">{avatarUrl ? "Replace photo" : "Upload a photo"}</label>
              <input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required />
            </div>
            <button type="submit" className="secondary">Upload</button>
          </form>
        </div>
      </div>

      <form action={saveProfile} id="profile-form">
        <BioImportBox />

        <div className="card">
          <h2>Practice model</h2>
          <p className="muted">
            Psychologists and psychiatrists generally work one of two ways, sometimes both at once.
            Tell us which applies so your Caseload page can speak in the right terms.
          </p>
          <div className="checkbox-row">
            <input
              id="runs_private_practice"
              name="runs_private_practice"
              type="checkbox"
              defaultChecked={profile?.runs_private_practice ?? false}
            />
            <label htmlFor="runs_private_practice" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              I run my own private practice (I handle my own business, billing, and marketing)
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="employed_by_group_practice"
              name="employed_by_group_practice"
              type="checkbox"
              defaultChecked={profile?.employed_by_group_practice ?? false}
            />
            <label htmlFor="employed_by_group_practice" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              I'm employed by / contracted to a group practice or consultancy (they handle back
              office, billing, and marketing; I'm typically paid a percentage of the billed rate)
            </label>
          </div>
        </div>

        <div className="card">
          <h2>Credentials</h2>
          <div className="field-row">
            <div className="field">
              <label htmlFor="full_name">Full name</label>
              <input id="full_name" name="full_name" type="text" defaultValue={profile?.full_name || ""} required />
            </div>
            <div className="field" style={{ maxWidth: 140 }}>
              <label htmlFor="credential_prefix">Prefix</label>
              <input id="credential_prefix" name="credential_prefix" type="text" placeholder="Dr" defaultValue={profile?.credential_prefix || ""} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="qualification_level">Qualification</label>
              <select id="qualification_level" name="qualification_level" defaultValue={profile?.qualification_level || "PhD"}>
                <option value="PhD">PhD, Psychologist</option>
                <option value="PsyD">PsyD, Psychologist</option>
                <option value="EdD">EdD, Psychologist</option>
                <option value="MD">MD, Psychiatrist</option>
                <option value="DO">DO, Psychiatrist</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="states_qualified">States licensed (comma-separated, e.g. TX, CA)</label>
              <input
                id="states_qualified"
                name="states_qualified"
                type="text"
                defaultValue={(profile?.states_qualified || []).join(", ")}
              />
            </div>
          </div>
          <div className="checkbox-row">
            <input id="board_certified" name="board_certified" type="checkbox" defaultChecked={profile?.board_certified} />
            <label htmlFor="board_certified" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              Board certified
            </label>
          </div>
          <div className="checkbox-row">
            <input id="accepting_referrals" name="accepting_referrals" type="checkbox" defaultChecked={profile?.accepting_referrals ?? true} />
            <label htmlFor="accepting_referrals" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              Currently accepting referrals
            </label>
          </div>
          <div className="field">
            <label htmlFor="primary_practice_city">Primary practice city</label>
            <input id="primary_practice_city" name="primary_practice_city" type="text" defaultValue={profile?.primary_practice_city || ""} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="practice_website">Practice website</label>
              <input id="practice_website" name="practice_website" type="text" placeholder="https://…" defaultValue={profile?.practice_website || ""} />
            </div>
            <div className="field">
              <label htmlFor="contact_phone">Contact phone</label>
              <input id="contact_phone" name="contact_phone" type="text" defaultValue={profile?.contact_phone || ""} />
            </div>
            <div className="field">
              <label htmlFor="contact_email">Contact email</label>
              <input id="contact_email" name="contact_email" type="email" defaultValue={profile?.contact_email || ""} />
            </div>
          </div>
          <div className="checkbox-row">
            <input id="open_to_group_consultation" name="open_to_group_consultation" type="checkbox" defaultChecked={profile?.open_to_group_consultation ?? true} />
            <label htmlFor="open_to_group_consultation" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              Open to Partner group consultation
            </label>
          </div>
          <div className="checkbox-row">
            <input id="open_to_give_supervision" name="open_to_give_supervision" type="checkbox" defaultChecked={profile?.open_to_give_supervision ?? false} />
            <label htmlFor="open_to_give_supervision" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              Open to provide private supervision
            </label>
          </div>
          <div className="checkbox-row">
            <input id="open_to_receive_supervision" name="open_to_receive_supervision" type="checkbox" defaultChecked={profile?.open_to_receive_supervision ?? false} />
            <label htmlFor="open_to_receive_supervision" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              Open to receive private supervision
            </label>
          </div>
          <div className="checkbox-row">
            <input id="psypact_participating" name="psypact_participating" type="checkbox" defaultChecked={profile?.psypact_participating ?? false} />
            <label htmlFor="psypact_participating" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              I hold PSYPACT Authority to Practice Interjurisdictional Telepsychology (APIT)
            </label>
          </div>
          <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: 0 }}>
            Shown as a badge to colleagues so they know you may be able to see their clients by
            telehealth across state lines. Always confirm current participating states and your own
            scope of practice at{" "}
            <a href="https://psypact.org" target="_blank" rel="noreferrer">psypact.org</a>. This
            platform doesn't track which states are in the compact, since that list changes over
            time.
          </p>
        </div>

        {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
          <div className="card" key={category}>
            <h2>{label}</h2>
            <div className="checkbox-grid">
              {(byCategory[category] || []).map((lv) => {
                const isRanked = category === "treatment_specialism" || category === "treatment_modality";
                const rank = selectedMap.get(lv.id);
                return (
                  <label key={lv.id}>
                    <input id={`lv_${lv.id}`} type="checkbox" name={`lv_${lv.id}`} defaultChecked={selectedMap.has(lv.id)} />
                    {lv.value}
                    {isRanked && (
                      <input
                        id={`rank_${lv.id}`}
                        type="number"
                        name={`rank_${lv.id}`}
                        min={1}
                        max={5}
                        defaultValue={rank ?? ""}
                        placeholder="rank"
                        style={{ width: 68, flex: "0 0 auto", marginLeft: "auto", padding: "0.15rem 0.4rem" }}
                      />
                    )}
                  </label>
                );
              })}
              {(byCategory[category] || []).length === 0 && (
                <p className="muted">No values seeded yet for this category.</p>
              )}
            </div>
          </div>
        ))}

        <div className="card">
          <h2>About you (optional)</h2>
          <p className="muted">
            Purely a self-disclosure: some clients look for a provider who shares part of their own
            background. Leave any of this blank if you'd rather not say.
          </p>
          <div className="field" style={{ maxWidth: 200, marginBottom: "1.25rem" }}>
            <label htmlFor="pronoun">Pronoun (optional)</label>
            <input id="pronoun" name="pronoun" type="text" placeholder="e.g. she/her" defaultValue={profile?.pronoun || ""} />
          </div>
          {Object.entries(SELF_DISCLOSURE_CATEGORY_LABELS).map(([category, label]) => (
            <div key={category} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>{label}</h3>
              <div className="checkbox-grid">
                {(byCategory[category] || []).map((lv) => (
                  <label key={lv.id}>
                    <input
                      type={SINGLE_SELECT_CATEGORIES.has(category) ? "radio" : "checkbox"}
                      name={SINGLE_SELECT_CATEGORIES.has(category) ? `single_${category}` : `lv_${lv.id}`}
                      value={SINGLE_SELECT_CATEGORIES.has(category) ? lv.id : undefined}
                      defaultChecked={selectedMap.has(lv.id)}
                    />
                    {lv.value}
                  </label>
                ))}
                {(byCategory[category] || []).length === 0 && (
                  <p className="muted">No values seeded yet for this category.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </form>

      <div className="card">
        <h2>Weekly availability</h2>
        <p className="muted">
          Which days do you generally take new sessions or consultations? Visible to other verified
          colleagues considering a referral or coverage request, not a booking calendar, just a
          general signal.
        </p>
        <form action={saveAvailability}>
          <div className="checkbox-row" style={{ flexWrap: "wrap" }}>
            {DAY_LABELS.map((label, i) => (
              <label key={i} style={{ minWidth: 70 }}>
                <input type="checkbox" name="availability_day" value={i} defaultChecked={availableDays.has(i)} />
                {label}
              </label>
            ))}
          </div>
          <button type="submit" className="secondary" style={{ marginTop: "0.75rem" }}>
            Save availability
          </button>
        </form>
      </div>

      {credentialVerificationCard}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
        <button type="submit" form="profile-form">Save profile</button>
      </div>
    </div>
  );
}
