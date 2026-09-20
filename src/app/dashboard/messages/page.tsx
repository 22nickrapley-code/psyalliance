import { createClient } from "@/lib/supabase/server";
import { startConversation, setConversationReadState, setNotificationReadState } from "./actions";
import { professionFor } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";

// Same initials logic used in the sidebar/Overview avatar chips, kept local
// here since it's tiny and this page has its own avatar list (other
// conversation participants + the "PA" notification badge) rather than the
// signed-in user's own name.
function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

type Tier = "partner" | "bench" | "recommended" | "none";

type Contact = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string | null;
  primary_state: string | null;
  specialisms: Set<string>;
};

type PartnerGroupInfo = {
  id: string;
  full_name: string;
  open_to_group_consultation: boolean;
};

function TierTag({ tier }: { tier: Tier }) {
  if (tier === "none") return null;
  const label = tier === "partner" ? "Partner" : tier === "bench" ? "Bench" : "Recommended";
  return <span className={`tag tier-${tier}`} style={{ marginLeft: "0.3rem" }}>{label}</span>;
}

const TIER_SORT_ORDER: Record<Tier, number> = { partner: 0, bench: 1, recommended: 2, none: 3 };

export default async function MessagesPage(
  props: {
    searchParams: Promise<{ q?: string; degree?: string; state?: string; specialism?: string; profession?: string; sort?: string; box?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [
    { data: myParticipantRows },
    { data: directoryRows },
    { data: connections },
    { data: myLookups },
    { data: blocklist },
    { data: allSpecialisms },
    { data: notifications },
  ] = await Promise.all([
    supabase.from("conversation_participants").select("conversation_id, last_read_at").eq("profile_id", myself),
    supabase
      .from("public_directory")
      .select("id, full_name, credential_prefix, qualification_level, primary_state, open_to_group_consultation, category, value"),
    supabase
      .from("connections")
      .select("*")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`)
      .eq("status", "accepted"),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values(category, value)")
      .eq("profile_id", myself),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
    supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
    supabase
      .from("system_notifications")
      .select("id, title, body, created_at, read_at")
      .eq("profile_id", myself)
      .order("created_at", { ascending: false }),
  ]);

  const conversationIds = (myParticipantRows || []).map((r) => r.conversation_id);
  const lastReadByConversation = new Map((myParticipantRows || []).map((r) => [r.conversation_id, r.last_read_at]));

  const [{ data: conversations }, { data: allParticipants }, { data: recentMessages }] = await Promise.all([
    conversationIds.length
      ? supabase
          .from("conversations")
          .select("id, title, last_message_at, created_by")
          .in("id", conversationIds)
          .order("last_message_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    conversationIds.length
      ? supabase
          .from("conversation_participants")
          .select("conversation_id, profile_id, profile:profile_id(full_name, credential_prefix)")
          .in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] as any[] }),
    conversationIds.length
      ? supabase
          .from("conversation_messages")
          .select("conversation_id, body, author_id, created_at")
          .in("conversation_id", conversationIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const otherParticipantsByConversation = new Map<number, { id: string; name: string }[]>();
  for (const p of allParticipants || []) {
    if (p.profile_id === myself) continue;
    const list = otherParticipantsByConversation.get(p.conversation_id) || [];
    list.push({ id: p.profile_id, name: (p.profile as any)?.full_name || "Unknown" });
    otherParticipantsByConversation.set(p.conversation_id, list);
  }

  const latestMessageByConversation = new Map<number, any>();
  for (const m of recentMessages || []) {
    if (!latestMessageByConversation.has(m.conversation_id)) {
      latestMessageByConversation.set(m.conversation_id, m);
    }
  }

  // Same connection-tier machinery as the Network page, reused here so the
  // inbox's contact picker can be filtered Partner | Bench | Recommended |
  // ALL exactly per the spec.
  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  const mySpecialisms = new Set(
    (myLookups || [])
      .filter((l: any) => l.lookup_values?.category === "treatment_specialism")
      .map((l: any) => l.lookup_values.value)
  );

  const contacts = new Map<string, Contact>();
  const groupConsultationById = new Map<string, PartnerGroupInfo>();
  for (const row of directoryRows || []) {
    if (row.id === myself || blockedIds.has(row.id)) continue;
    if (!contacts.has(row.id)) {
      contacts.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        credential_prefix: row.credential_prefix,
        qualification_level: (row as any).qualification_level,
        primary_state: (row as any).primary_state,
        specialisms: new Set(),
      });
      groupConsultationById.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        open_to_group_consultation: (row as any).open_to_group_consultation ?? true,
      });
    }
    if (row.category === "treatment_specialism") {
      contacts.get(row.id)!.specialisms.add(row.value);
    }
  }

  const tierByContact = new Map<string, "partner" | "bench">();
  for (const c of connections || []) {
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    tierByContact.set(otherId, c.tier);
  }

  // Partner group consultation: per the spec notes, someone who's opted out
  // of Partner group consultation on their profile should never be swept
  // into one, and the initiator should be told who was left out and why -
  // rather than silently including or silently dropping them with no
  // explanation.
  const partnerIds = Array.from(tierByContact.entries())
    .filter(([, tier]) => tier === "partner")
    .map(([id]) => id)
    .filter((id) => !blockedIds.has(id));
  const eligiblePartners = partnerIds
    .map((id) => groupConsultationById.get(id))
    .filter((p): p is PartnerGroupInfo => !!p && p.open_to_group_consultation);
  const excludedPartners = partnerIds
    .map((id) => groupConsultationById.get(id))
    .filter((p): p is PartnerGroupInfo => !!p && !p.open_to_group_consultation);

  function degreeOf(contact: Contact): Tier {
    const tier = tierByContact.get(contact.id);
    if (tier) return tier;
    if ([...contact.specialisms].some((s) => mySpecialisms.has(s))) return "recommended";
    return "none";
  }

  const q = (searchParams?.q || "").trim().toLowerCase();
  const degreeFilter = searchParams?.degree || "all";
  const stateFilter = (searchParams?.state || "").trim().toUpperCase();
  const specialismFilter = searchParams?.specialism || "";
  const professionFilter = searchParams?.profession || "";
  const sortBy = searchParams?.sort || "alpha";

  // Inbox/Sent toggle, same shape as any email client: Sent is threads you
  // started, Inbox is everything else you're a participant in. Default view
  // is Inbox, matching what people expect to land on first.
  const box = searchParams?.box === "sent" ? "sent" : "inbox";
  const inboxConversations = (conversations || []).filter((c: any) => c.created_by !== myself);
  const sentConversations = (conversations || []).filter((c: any) => c.created_by === myself);

  // The inbox mixes two kinds of rows: real conversations with other
  // members, and company/admin notices (system_notifications) - e.g. "You're
  // approved!" when an admin verifies someone. Sent only ever shows
  // conversations you started; a notice was never "sent" by you, so it has
  // no place there. Merged and re-sorted by date so a fresh notice surfaces
  // at the top of the inbox exactly like a fresh message would, instead of
  // being tacked on at the end.
  type InboxRow =
    | { kind: "conversation"; sortDate: string; data: any }
    | { kind: "notification"; sortDate: string; data: any };

  const inboxRows: InboxRow[] = [
    ...inboxConversations.map((c: any) => ({ kind: "conversation" as const, sortDate: c.last_message_at || "", data: c })),
    ...(notifications || []).map((n: any) => ({ kind: "notification" as const, sortDate: n.created_at, data: n })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());

  const sentRows: InboxRow[] = sentConversations.map((c: any) => ({
    kind: "conversation" as const,
    sortDate: c.last_message_at || "",
    data: c,
  }));

  const boxRows = box === "sent" ? sentRows : inboxRows;
  const unreadNotificationCount = (notifications || []).filter((n: any) => !n.read_at).length;

  const filteredContacts = Array.from(contacts.values())
    .filter((c) => !q || c.full_name.toLowerCase().includes(q))
    .filter((c) => degreeFilter === "all" || degreeOf(c) === degreeFilter)
    .filter((c) => !stateFilter || c.primary_state === stateFilter)
    .filter((c) => !specialismFilter || c.specialisms.has(specialismFilter))
    .filter((c) => !professionFilter || professionFor(c.qualification_level) === professionFilter)
    .sort((a, b) => {
      if (sortBy === "connection") {
        const diff = TIER_SORT_ORDER[degreeOf(a)] - TIER_SORT_ORDER[degreeOf(b)];
        if (diff !== 0) return diff;
        return a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === "state") {
        const diff = (a.primary_state || "zz").localeCompare(b.primary_state || "zz");
        if (diff !== 0) return diff;
        return a.full_name.localeCompare(b.full_name);
      }
      return a.full_name.localeCompare(b.full_name);
    });

  return (
    <div>
      <h1>Messages</h1>
      <p className="muted">
        Private, threaded conversations with your verified colleagues, separate from Town Hall's
        open specialism channels.
      </p>

      {searchParams?.error && <div className="error-banner">{searchParams.error}</div>}

      <div className="card">
        <div className="widget-header">
          <h2>Your conversations</h2>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <a
              href="/dashboard/messages?box=inbox"
              className={`btn ${box === "inbox" ? "" : "secondary"}`}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
            >
              Inbox ({inboxRows.length})
            </a>
            <a
              href="/dashboard/messages?box=sent"
              className={`btn ${box === "sent" ? "" : "secondary"}`}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
            >
              Sent ({sentRows.length})
            </a>
          </div>
        </div>
        {boxRows.map((row) => {
          if (row.kind === "notification") {
            const n = row.data;
            const unread = !n.read_at;
            return (
              <div key={`n-${n.id}`} style={{ display: "flex", alignItems: "stretch", gap: "0.5rem", marginBottom: "0.3rem" }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.7rem",
                    padding: "0.75rem 0.85rem",
                    borderRadius: "var(--radius)",
                    borderLeft: "3px solid var(--gold)",
                    background: "var(--gold-soft)",
                  }}
                >
                  <div className="msg-avatar system">PA</div>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: "var(--text)" }}>{n.title}</strong>
                    <span className="tag gold" style={{ marginLeft: "0.5rem" }}>PsyAlliance Team</span>
                    {unread && <span className="tag" style={{ marginLeft: "0.3rem" }}>Unread</span>}
                    <br />
                    <span className="muted" style={{ fontWeight: unread ? 600 : 400 }}>{n.body}</span>
                  </span>
                  <span className="muted" style={{ whiteSpace: "nowrap", marginLeft: "1rem" }}>
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
                <form action={setNotificationReadState} style={{ display: "flex", alignItems: "center" }}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="state" value={unread ? "read" : "unread"} />
                  <button
                    type="submit"
                    className="btn secondary"
                    style={{ whiteSpace: "nowrap", fontSize: "0.78rem", padding: "0.4rem 0.65rem" }}
                  >
                    {unread ? "Mark read" : "Mark unread"}
                  </button>
                </form>
              </div>
            );
          }

          const c = row.data;
          const others = otherParticipantsByConversation.get(c.id) || [];
          const label = c.title || others.map((o) => o.name).join(", ") || "Conversation";
          const avatarLabel = others.length === 1 ? initialsOf(others[0].name) : others.length > 1 ? String(others.length) : "?";
          const latest = latestMessageByConversation.get(c.id);
          const lastRead = lastReadByConversation.get(c.id);
          const unread = !!latest && (!lastRead || new Date(latest.created_at) > new Date(lastRead));
          const needsReply = unread && latest.author_id !== myself;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "stretch", gap: "0.5rem", marginBottom: "0.3rem" }}>
              <a
                href={`/dashboard/messages/${c.id}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.7rem",
                  justifyContent: "space-between",
                  padding: "0.75rem 0.85rem",
                  borderRadius: "var(--radius)",
                  borderLeft: needsReply ? "3px solid var(--tier-recommended)" : "3px solid transparent",
                  background: needsReply ? "var(--tier-recommended-soft)" : "transparent",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.7rem", minWidth: 0, flex: 1 }}>
                  <div className="msg-avatar">{avatarLabel}</div>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ color: "var(--text)" }}>{label}</strong>
                    {needsReply && (
                      <span className="tag tier-recommended" style={{ marginLeft: "0.5rem" }}>Needs your reply</span>
                    )}
                    {unread && !needsReply && (
                      <span className="tag" style={{ marginLeft: "0.5rem" }}>Unread</span>
                    )}
                    <br />
                    <span className="muted" style={{ fontWeight: unread ? 600 : 400 }}>
                      {latest ? (latest.body as string).slice(0, 90) : "No messages yet"}
                    </span>
                  </span>
                </span>
                <span className="muted" style={{ whiteSpace: "nowrap", marginLeft: "1rem" }}>
                  {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : ""}
                </span>
              </a>
              {latest && (
                <form action={setConversationReadState} style={{ display: "flex", alignItems: "center" }}>
                  <input type="hidden" name="conversation_id" value={c.id} />
                  <input type="hidden" name="state" value={unread ? "read" : "unread"} />
                  <button
                    type="submit"
                    className="btn secondary"
                    style={{ whiteSpace: "nowrap", fontSize: "0.78rem", padding: "0.4rem 0.65rem" }}
                  >
                    {unread ? "Mark read" : "Mark unread"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {boxRows.length === 0 && (
          <p className="muted">
            {box === "sent" ? "You haven't started any conversations yet." : "Nothing in your inbox yet."}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Send a New Message</h2>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div className="field">
            <label htmlFor="q">Search colleagues</label>
            <input id="q" name="q" type="text" defaultValue={searchParams?.q || ""} placeholder="Search by name" />
          </div>
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
          <div className="field">
            <label htmlFor="profession">Profession</label>
            <select id="profession" name="profession" defaultValue={professionFilter}>
              <option value="">Any</option>
              <option value="psychologist">Psychologist</option>
              <option value="psychiatrist">Psychiatrist</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="degree">Connection</label>
            <select id="degree" name="degree" defaultValue={degreeFilter}>
              <option value="all">ALL</option>
              <option value="partner">Partner</option>
              <option value="bench">Bench</option>
              <option value="recommended">Recommended</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sort">Sort by</label>
            <select id="sort" name="sort" defaultValue={sortBy}>
              <option value="alpha">Alphabetical</option>
              <option value="connection">Connection status</option>
              <option value="state">State</option>
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Filter</button>
          </div>
          {(q || stateFilter || specialismFilter || professionFilter || degreeFilter !== "all" || sortBy !== "alpha") && (
            <div className="field" style={{ flex: "0 0 auto" }}>
              <a href="/dashboard/messages" className="btn secondary" style={{ display: "inline-block" }}>Clear</a>
            </div>
          )}
        </form>

        <form action={startConversation}>
          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ margin: 0 }}>Recipients</label>
              <label style={{ margin: 0, fontWeight: 400, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <input id="select-all-recipients" type="checkbox" />
                Select all ({filteredContacts.length})
              </label>
            </div>
            <div className="checkbox-grid" style={{ maxHeight: 220, overflowY: "auto", marginTop: "0.4rem" }}>
              {filteredContacts.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" name="participant_ids" value={c.id} className="recipient-checkbox" />
                  {c.credential_prefix ? `${c.credential_prefix} ` : ""}
                  {c.full_name}
                  {c.primary_state ? ` (${c.primary_state})` : ""}
                  <TierTag tier={degreeOf(c)} />
                </label>
              ))}
              {filteredContacts.length === 0 && <p className="muted">No colleagues match that search.</p>}
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="title">Conversation title (optional)</label>
              <input id="title" name="title" type="text" placeholder="e.g. Austin psychiatrist referral" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="body">Message</label>
            <textarea id="body" name="body" rows={3} placeholder="Does anyone know a good psychiatrist in Austin I can refer a client to?" />
          </div>
          <button type="submit">Send message</button>
        </form>
        {/* Plain DOM toggle for "select all" - this is a server component page,
            so a tiny inline script (rather than client-side React state) is
            the lightest way to wire up the one checkbox-groups-checkboxes
            interaction without converting the whole form to a client
            component. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var selectAll = document.getElementById('select-all-recipients');
                if (!selectAll) return;
                selectAll.addEventListener('change', function () {
                  document.querySelectorAll('.recipient-checkbox').forEach(function (el) {
                    el.checked = selectAll.checked;
                  });
                });
              })();
            `,
          }}
        />
      </div>

      {partnerIds.length > 0 && (
        <div className="card">
          <h2>Start Partner group consultation</h2>
          <p className="muted">
            Starts one conversation with all your Partners who are open to group consultation.
          </p>
          {excludedPartners.length > 0 && (
            <div className="message-banner">
              {excludedPartners.length} colleague{excludedPartners.length === 1 ? "" : "s"} not
              included because they've opted out of Partner group consultation:{" "}
              {excludedPartners.map((p) => p.full_name).join(", ")}.
            </div>
          )}
          {eligiblePartners.length > 0 ? (
            <form action={startConversation}>
              {eligiblePartners.map((p) => (
                <input key={p.id} type="hidden" name="participant_ids" value={p.id} />
              ))}
              <input type="hidden" name="title" value="Partner group consultation" />
              <p className="muted">
                Including: {eligiblePartners.map((p) => p.full_name).join(", ")}
              </p>
              <div className="field">
                <label htmlFor="group_body">Message</label>
                <textarea id="group_body" name="body" rows={2} placeholder="Kicking off a group consultation about…" />
              </div>
              <button type="submit" className="secondary">Start group consultation</button>
            </form>
          ) : (
            <p className="muted">None of your Partners are currently open to group consultation.</p>
          )}
        </div>
      )}
    </div>
  );
}
