import { createClient } from "@/lib/supabase/server";
import { startConversation } from "../messages/actions";
import { resolveAvatarUrls } from "@/lib/avatars";
import Avatar from "../avatar";

type Person = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string;
  primary_practice_city: string | null;
  primary_state: string | null;
  avatar_path: string | null;
  specialisms: Set<string>;
};

export default async function SupervisionPage(
  props: {
    searchParams: Promise<{ state?: string; specialism?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: directoryRows }, { data: myProfile }, { data: blocklist }, { data: allSpecialisms }] =
    await Promise.all([
      supabase
        .from("public_directory")
        .select(
          "id, full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, avatar_path, open_to_give_supervision, open_to_receive_supervision, category, value"
        ),
      supabase
        .from("profiles")
        .select("open_to_give_supervision, open_to_receive_supervision")
        .eq("id", myself)
        .maybeSingle(),
      supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
      supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
    ]);

  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  const stateFilter = (searchParams?.state || "").trim().toUpperCase();
  const specialismFilter = searchParams?.specialism || "";

  function buildPeople(filterFlag: "open_to_give_supervision" | "open_to_receive_supervision"): Person[] {
    const people = new Map<string, Person>();
    for (const row of directoryRows || []) {
      if (row.id === myself || blockedIds.has(row.id)) continue;
      if (!(row as any)[filterFlag]) continue;
      if (!people.has(row.id)) {
        people.set(row.id, {
          id: row.id,
          full_name: row.full_name,
          credential_prefix: row.credential_prefix,
          qualification_level: row.qualification_level,
          primary_practice_city: row.primary_practice_city,
          primary_state: row.primary_state,
          avatar_path: row.avatar_path,
          specialisms: new Set(),
        });
      }
      if (row.category === "treatment_specialism") {
        people.get(row.id)!.specialisms.add(row.value);
      }
    }
    return Array.from(people.values())
      .filter((p) => !stateFilter || p.primary_state === stateFilter)
      .filter((p) => !specialismFilter || p.specialisms.has(specialismFilter))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  const supervisors = buildPeople("open_to_give_supervision");
  const supervisees = buildPeople("open_to_receive_supervision");
  const avatarUrlByPath = await resolveAvatarUrls(supabase, [...supervisors, ...supervisees].map((p) => p.avatar_path));

  return (
    <div>
      <h1>Supervision</h1>
      <p className="muted">
        Connect with colleagues open to giving or receiving private clinical supervision —
        separate from Town Hall's open Partner group consultation. Nothing here is booked or
        billed automatically; reaching out opens a direct message so you can work out the details
        yourselves.
      </p>

      {!myProfile?.open_to_give_supervision && !myProfile?.open_to_receive_supervision && (
        <div className="message-banner">
          You're not currently listed as open to give or receive supervision.{" "}
          <a href="/dashboard/profile">Update your profile</a> if you'd like to appear here.
        </div>
      )}

      <div className="card">
        <h2>Filter</h2>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ maxWidth: 100 }}>
            <label htmlFor="state">State</label>
            <input id="state" name="state" type="text" maxLength={2} defaultValue={searchParams?.state || ""} placeholder="TX" />
          </div>
          <div className="field">
            <label htmlFor="specialism">Specialism</label>
            <select id="specialism" name="specialism" defaultValue={specialismFilter}>
              <option value="">Any</option>
              {(allSpecialisms || []).map((s) => (
                <option key={s.value} value={s.value}>{s.value}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Filter</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Open to provide supervision ({supervisors.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Specialisms</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {supervisors.map((p) => (
              <tr key={p.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Avatar url={avatarUrlByPath.get(p.avatar_path || "") || null} name={p.full_name} size={24} />
                    {p.credential_prefix} {p.full_name} — {p.qualification_level}
                  </span>
                </td>
                <td>{p.primary_practice_city || "—"}{p.primary_state ? `, ${p.primary_state}` : ""}</td>
                <td>{[...p.specialisms].slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}</td>
                <td>
                  <form action={startConversation}>
                    <input type="hidden" name="participant_ids" value={p.id} />
                    <input type="hidden" name="title" value="Supervision request" />
                    <input
                      type="hidden"
                      name="body"
                      value={`Hi ${p.full_name}, I saw you're open to providing supervision — would you be able to take on a supervisee? Happy to share more about my background if useful.`}
                    />
                    <button type="submit" className="secondary">Request supervision</button>
                  </form>
                </td>
              </tr>
            ))}
            {supervisors.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No colleagues match — try widening your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Looking to receive supervision ({supervisees.length})</h2>
        <p className="muted">
          If you're an experienced clinician, these are colleagues who've marked themselves as
          seeking supervision — reach out if you have capacity.
        </p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Specialisms</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {supervisees.map((p) => (
              <tr key={p.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Avatar url={avatarUrlByPath.get(p.avatar_path || "") || null} name={p.full_name} size={24} />
                    {p.credential_prefix} {p.full_name} — {p.qualification_level}
                  </span>
                </td>
                <td>{p.primary_practice_city || "—"}{p.primary_state ? `, ${p.primary_state}` : ""}</td>
                <td>{[...p.specialisms].slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}</td>
                <td>
                  <form action={startConversation}>
                    <input type="hidden" name="participant_ids" value={p.id} />
                    <input type="hidden" name="title" value="Supervision offer" />
                    <input
                      type="hidden"
                      name="body"
                      value={`Hi ${p.full_name}, I saw you're looking for supervision — I have some capacity if you'd like to talk it through.`}
                    />
                    <button type="submit" className="secondary">Offer supervision</button>
                  </form>
                </td>
              </tr>
            ))}
            {supervisees.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No colleagues match — try widening your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
