import { createClient } from "@/lib/supabase/server";
import { joinChannel, leaveChannel } from "./actions";
import Link from "next/link";

export default async function TownHallIndexPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  // Auto-join channels matching this user's own treatment specialisms, if
  // they aren't already a member (of that channel, at all - manual leaves
  // are respected and won't be re-added since we only insert when no row
  // exists yet for that channel/profile pair).
  const { data: mySpecialismLookupIds } = await supabase
    .from("profile_lookup_values")
    .select("lookup_value_id, lookup_values!inner(category)")
    .eq("profile_id", myself)
    .eq("lookup_values.category", "treatment_specialism");

  const { data: matchingChannels } = await supabase
    .from("town_hall_channels")
    .select("id, lookup_value_id")
    .in("lookup_value_id", (mySpecialismLookupIds || []).map((s) => s.lookup_value_id));

  const { data: existingMemberships } = await supabase
    .from("town_hall_memberships")
    .select("channel_id")
    .eq("profile_id", myself);
  const alreadyMemberOf = new Set((existingMemberships || []).map((m) => m.channel_id));

  const toAutoJoin = (matchingChannels || []).filter((c) => !alreadyMemberOf.has(c.id));
  if (toAutoJoin.length > 0) {
    await supabase.from("town_hall_memberships").insert(
      toAutoJoin.map((c) => ({ channel_id: c.id, profile_id: myself, is_auto: true }))
    );
  }

  const [{ data: channels }, { data: memberships }] = await Promise.all([
    supabase.from("town_hall_channels").select("*").order("is_general", { ascending: false }).order("name"),
    supabase.from("town_hall_memberships").select("channel_id").eq("profile_id", myself),
  ]);

  const memberChannelIds = new Set((memberships || []).map((m) => m.channel_id));
  const general = (channels || []).filter((c) => c.is_general);
  const specialismChannels = (channels || []).filter((c) => !c.is_general);
  const myChannels = (channels || []).filter((c) => memberChannelIds.has(c.id));

  return (
    <div>
      <h1>Town Hall</h1>
      <p className="muted">
        Open community discussion for verified psychologists — organized by specialism, plus a few
        general channels. You're auto-joined to channels matching your own specialisms; join or
        leave any others freely.
      </p>

      <div className="card">
        <h2>Your channels ({myChannels.length})</h2>
        {myChannels.length === 0 && (
          <p className="muted">
            You're not in any channels yet. Set your specialisms on your{" "}
            <Link href="/dashboard/profile">profile</Link> to auto-join, or join one below.
          </p>
        )}
        <div className="checkbox-grid">
          {myChannels.map((c) => (
            <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
              <Link href={`/dashboard/town-hall/${c.id}`}>{c.name}</Link>
              <form action={leaveChannel}>
                <input type="hidden" name="channel_id" value={c.id} />
                <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                  Leave
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>General channels</h2>
        <div className="checkbox-grid">
          {general.map((c) => (
            <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
              <Link href={`/dashboard/town-hall/${c.id}`}>{c.name}</Link>
              {!memberChannelIds.has(c.id) && (
                <form action={joinChannel}>
                  <input type="hidden" name="channel_id" value={c.id} />
                  <button type="submit" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                    Join
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>All specialism channels ({specialismChannels.length})</h2>
        <div className="checkbox-grid">
          {specialismChannels.map((c) => (
            <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
              <Link href={`/dashboard/town-hall/${c.id}`}>{c.name}</Link>
              {!memberChannelIds.has(c.id) && (
                <form action={joinChannel}>
                  <input type="hidden" name="channel_id" value={c.id} />
                  <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                    Join
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
