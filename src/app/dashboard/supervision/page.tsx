import { createClient } from "@/lib/supabase/server";
import { startConversation } from "../messages/actions";
import { resolveAvatarUrls } from "@/lib/avatars";
import UsStateDatalist from "@/components/us-state-datalist";
import SupervisionBrowser, { type SupervisionPerson } from "./supervision-browser";

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

  function toSupervisionPerson(p: Person): SupervisionPerson {
    return {
      id: p.id,
      fullName: p.full_name,
      credentialPrefix: p.credential_prefix,
      qualificationLevel: p.qualification_level,
      city: p.primary_practice_city,
      state: p.primary_state,
      specialisms: [...p.specialisms],
      avatarUrl: avatarUrlByPath.get(p.avatar_path || "") || null,
    };
  }
  const supervisorRows = supervisors.map(toSupervisionPerson);
  const superviseeRows = supervisees.map(toSupervisionPerson);

  return (
    <div>
      <h1>Supervision</h1>
      <p className="muted">
        Connect with colleagues open to giving or receiving private clinical supervision,
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
            <input id="state" name="state" type="text" maxLength={24} defaultValue={searchParams?.state || ""} placeholder="TX or Texas" list="us-states" autoComplete="off" />
            <UsStateDatalist />
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
        <SupervisionBrowser
          supervisors={supervisorRows}
          supervisees={superviseeRows}
          startConversation={startConversation}
        />
      </div>
    </div>
  );
}
