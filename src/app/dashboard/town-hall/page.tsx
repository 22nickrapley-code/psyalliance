import { createClient } from "@/lib/supabase/server";
import {
  joinChannel,
  leaveChannel,
  requestNewChannel,
  postMessage,
  reactToMessage,
  editMessage,
  deleteMessage,
  getChannelSnapshot,
} from "./actions";
import { buildTierMap } from "@/lib/tiers";
import ChannelBrowser, { type ChannelPill } from "./channel-browser";
import Link from "next/link";

export default async function TownHallIndexPage(
  props: {
    searchParams: Promise<{ q?: string; error?: string; channel_requested?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const q = (searchParams?.q || "").trim();
  const { data: searchResults } = q
    ? await supabase
        .from("town_hall_messages")
        .select("id, body, created_at, channel_id, author:author_id(full_name), channel:channel_id(name)")
        .ilike("body", `%${q}%`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: null };

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

  const [{ data: channels }, { data: memberships }, { data: connections }] = await Promise.all([
    supabase.from("town_hall_channels").select("*").order("is_general", { ascending: false }).order("name"),
    supabase.from("town_hall_memberships").select("channel_id, last_read_at").eq("profile_id", myself),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier, status")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`)
      .eq("status", "accepted"),
  ]);

  const memberChannelIds = new Set((memberships || []).map((m) => m.channel_id));
  const lastReadByChannel = new Map((memberships || []).map((m) => [m.channel_id, m.last_read_at]));
  const general = (channels || []).filter((c) => c.is_general);
  const specialismChannels = (channels || []).filter((c) => !c.is_general);
  const myChannels = (channels || []).filter((c) => memberChannelIds.has(c.id));

  const tierMap = buildTierMap(connections, myself);
  const tierByAuthorId: Record<string, "partner" | "trusted_colleague" | "bench" | "recommended" | "none"> = Object.fromEntries(tierMap);

  // Unread badges: for each channel the user belongs to, count messages from
  // OTHER authors posted since that membership's last_read_at (set whenever
  // the user opens the channel inline via getChannelSnapshot, or leaves the
  // dedicated page). One query for all member channels, counted client-side.
  const { data: unreadCandidates } = memberChannelIds.size
    ? await supabase
        .from("town_hall_messages")
        .select("channel_id, created_at, author_id")
        .in("channel_id", Array.from(memberChannelIds))
        .is("deleted_at", null)
        .neq("author_id", myself)
    : { data: [] as { channel_id: number; created_at: string; author_id: string }[] };

  const unreadByChannel = new Map<number, number>();
  for (const msg of unreadCandidates || []) {
    const lastRead = lastReadByChannel.get(msg.channel_id);
    if (!lastRead || new Date(msg.created_at) > new Date(lastRead)) {
      unreadByChannel.set(msg.channel_id, (unreadByChannel.get(msg.channel_id) || 0) + 1);
    }
  }

  // "Has any conversation at all" is a separate signal from unread: a
  // channel someone posted in a year ago, that the viewer has already
  // read, should still look different from one nobody has ever posted in.
  // Across every channel (not just ones the viewer belongs to), so General
  // and specialism channels get the same signal before joining.
  const { data: allMessages } = await supabase
    .from("town_hall_messages")
    .select("channel_id")
    .is("deleted_at", null);
  const channelsWithMessages = new Set((allMessages || []).map((m) => m.channel_id));

  const yourChannelPills: ChannelPill[] = myChannels.map((c) => ({
    id: c.id,
    name: c.name,
    joined: true,
    unread: unreadByChannel.get(c.id) || 0,
    hasMessages: channelsWithMessages.has(c.id),
  }));
  const generalChannelPills: ChannelPill[] = general.map((c) => ({
    id: c.id,
    name: c.name,
    joined: memberChannelIds.has(c.id),
    unread: unreadByChannel.get(c.id) || 0,
    hasMessages: channelsWithMessages.has(c.id),
  }));
  const specialismChannelPills: ChannelPill[] = specialismChannels.map((c) => ({
    id: c.id,
    name: c.name,
    joined: memberChannelIds.has(c.id),
    unread: unreadByChannel.get(c.id) || 0,
    hasMessages: channelsWithMessages.has(c.id),
  }));

  return (
    <div>
      <h1>Town Hall</h1>
      <p className="muted">
        Open community discussion for verified psychologists, organized by specialism, plus a few
        general channels. You're auto-joined to channels matching your own specialisms; join or
        leave any others freely.
      </p>

      {searchParams?.error && <div className="error-banner">{searchParams.error}</div>}
      {searchParams?.channel_requested === "1" && (
        <div className="message-banner">
          Request sent to an admin for review. You'll get a message once it's decided.
        </div>
      )}

      <div className="card">
        {myChannels.length === 0 && (
          <p className="muted">
            You're not in any channels yet. Set your specialisms on your{" "}
            <Link href="/dashboard/profile">profile</Link> to auto-join, or join one below.
          </p>
        )}
        <ChannelBrowser
          yourChannels={yourChannelPills}
          generalChannels={generalChannelPills}
          specialismChannels={specialismChannelPills}
          tierByAuthorId={tierByAuthorId}
          myself={myself}
          getChannelSnapshot={getChannelSnapshot}
          joinChannel={joinChannel}
          leaveChannel={leaveChannel}
          postMessage={postMessage}
          reactToMessage={reactToMessage}
          editMessage={editMessage}
          deleteMessage={deleteMessage}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Search Town Hall</h3>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="q">Search conversations</label>
            <input id="q" name="q" type="text" defaultValue={q} placeholder="e.g. depression, EMDR, telehealth in Texas…" />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Search</button>
          </div>
        </form>
        {q && (
          <div style={{ marginTop: "1rem" }}>
            {(searchResults || []).map((m: any) => (
              <div key={m.id} style={{ padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
                <a href={`/dashboard/town-hall/${m.channel_id}`}>
                  <span className="tag">{m.channel?.name}</span>
                </a>{" "}
                <strong>{m.author?.full_name || "Colleague"}</strong>
                <span className="muted">, {new Date(m.created_at).toLocaleDateString()}</span>
                <p style={{ margin: "0.25rem 0 0" }}>{m.body}</p>
              </div>
            ))}
            {(searchResults || []).length === 0 && (
              <p className="muted">No Town Hall messages match "{q}".</p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Request a new channel</h2>
        <p className="muted">
          Don't see a channel you need? Ask for one - an admin reviews every request before it's
          created, and you'll get a message once it's decided.
        </p>
        <form action={requestNewChannel} className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="channel_name">Channel name</label>
            <input id="channel_name" name="channel_name" type="text" maxLength={80} placeholder="e.g. Perinatal Mental Health" required />
          </div>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="reason">Why (optional)</label>
            <input id="reason" name="reason" type="text" maxLength={200} placeholder="Briefly, what would this cover?" />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Request channel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
