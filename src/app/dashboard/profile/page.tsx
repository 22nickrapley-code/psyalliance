import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  treatment_specialism: "Treatment specialisms (rank your top few, 1 = highest)",
  treatment_modality: "Treatment modalities (rank your top few, 1 = highest)",
  insurance: "Insurance accepted",
  language: "Languages spoken",
  session_type: "Session types offered",
};

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: lookups }, { data: selected }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
    supabase.from("lookup_values").select("id, category, value").order("category").order("value"),
    supabase.from("profile_lookup_values").select("lookup_value_id, rank").eq("profile_id", user!.id),
  ]);

  const selectedMap = new Map((selected || []).map((s) => [s.lookup_value_id, s.rank]));

  const byCategory: Record<string, { id: number; value: string }[]> = {};
  for (const lv of lookups || []) {
    byCategory[lv.category] = byCategory[lv.category] || [];
    byCategory[lv.category].push({ id: lv.id, value: lv.value });
  }

  return (
    <div>
      <h1>Your profile</h1>
      <p className="muted">
        This is what appears in the verified directory once your credentials are checked. No
        patient information lives here.
      </p>

      <form action={saveProfile}>
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
                <option value="PhD">PhD</option>
                <option value="PsyD">PsyD</option>
                <option value="EdD">EdD</option>
                <option value="MD">MD</option>
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
                    <input type="checkbox" name={`lv_${lv.id}`} defaultChecked={selectedMap.has(lv.id)} />
                    {lv.value}
                    {isRanked && (
                      <input
                        type="number"
                        name={`rank_${lv.id}`}
                        min={1}
                        max={5}
                        defaultValue={rank ?? ""}
                        placeholder="rank"
                        style={{ width: 52, marginLeft: "auto", padding: "0.15rem 0.3rem" }}
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

        <button type="submit">Save profile</button>
      </form>
    </div>
  );
}
