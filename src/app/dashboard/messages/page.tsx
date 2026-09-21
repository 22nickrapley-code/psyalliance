import { createClient } from "@/lib/supabase/server";
import { startConversation, setConversationReadState, setNotificationReadState } from "./actions";
import { professionFor } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";
import ToggleBox from "@/components/toggle-box";
import RecipientPicker, { type PickerContact } from "@/components/recipient-picker";
import type { ReactNode } from "react";

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

// A colleague's name, colored/dotted by connection tier wherever it appears
// in the inbox - same visual language as Overview and Town Hall, so a
// partner reads blue, bench purple, recommended orange, everywhere at once.
function TierName({ id, name, tier }: { id: string; name: string; tier: Tier }) {
  if (tier === "none") {
    return <a href={`/dashboard/people/${id}`} className="person-link">{name}</a>;
  }
  return (
    <a href={`/dashboard/people/${id}`} className={`person-link tier-${tier}`}>
      <span className={`tier-dot tier-dot-${tier}`} />
      {name}
    </a>
  );
}

export default async function MessagesPage(
  props: {
    searchParams: Promise<{ error?: string }>;
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

  // Tier lookup for any participant id, including ones not in the full
  // colleague directory (e.g. someone blocked after a conversation already
  // existed) - falls back to "none" rather than throwing.
  function tierOf(id: string): Tier {
    const c = contacts.get(id);
    if (c) return degreeOf(c);
    return tierByContact.get(id) || "none";
  }

  // Inbox/Sent toggle, same shape as any email client: Sent is threads you
  // started, Inbox is everything else you're a participant in.
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

  // Renders one box's worth of rows (Inbox or Sent) - pulled out into its
  // own function so both tabs' markup can be pre-rendered server-side and
  // handed to ToggleBox, which swaps between them with zero refetch and zero
  // page reload (same pattern as the Overview "My Messages" box).
  function renderBoxRows(rows: InboxRow[], emptyText: string): ReactNode {
    return (
      <>
        {rows.map((row) => {
          if (row.kind === "notification") {
            const n = row.data;
            const unread = !n.read_at;
            return (
              <div key={`n-${n.id}`} className="inbox-row">
                <div
                  className="inbox-row-link"
                  style={{
                    borderLeft: "3px solid var(--gold)",
                    background: "var(--gold-soft)",
                  }}
                >
                  <span className="inbox-row-main">
                    <div className="msg-avatar system">PA</div>
                    <span className="inbox-row-text">
                      <strong>{n.title}</strong>
                      <span className="tag gold" style={{ marginLeft: "0.5rem" }}>PsyAlliance Team</span>
                      {unread && <span className="tag" style={{ marginLeft: "0.3rem" }}>Unread</span>}
                      <br />
                      <span className="muted inbox-preview" style={{ fontWeight: unread ? 600 : 400 }}>{n.body}</span>
                    </span>
                  </span>
                  <span className="muted inbox-row-date">
                    {new Date(n.created_at).toLocaleDateString()}{" "}
                    {new Date(n.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <form action={setNotificationReadState} className="inbox-row-actions">
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="state" value={unread ? "read" : "unread"} />
                  <button
                    type="submit"
                    className="btn secondary"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0.65rem" }}
                  >
                    {unread ? "Mark read" : "Mark unread"}
                  </button>
                </form>
              </div>
            );
          }

          const c = row.data;
          const others = otherParticipantsByConversation.get(c.id) || [];
          const nameLabel =
            others.length > 0
              ? others.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ", "}
                    <TierName id={o.id} name={o.name} tier={tierOf(o.id)} />
                  </span>
                ))
              : "Conversation";
          const singleTier = others.length === 1 ? tierOf(others[0].id) : "none";
          const avatarLabel = others.length === 1 ? initialsOf(others[0].name) : others.length > 1 ? String(others.length) : "?";
          const latest = latestMessageByConversation.get(c.id);
          const lastRead = lastReadByConversation.get(c.id);
          const unread = !!latest && (!lastRead || new Date(latest.created_at) > new Date(lastRead));
          const needsReply = unread && latest.author_id !== myself;
          return (
            <div key={c.id} className="inbox-row">
              <a
                href={`/dashboard/messages/${c.id}`}
                className="inbox-row-link"
                style={{
                  borderLeft: needsReply ? "3px solid var(--gold)" : "3px solid transparent",
                  background: needsReply ? "var(--gold-soft)" : "transparent",
                }}
              >
                <span className="inbox-row-main">
                  <div
                    className={`msg-avatar${singleTier === "partner" || singleTier === "bench" ? ` tier-ring-${singleTier}` : ""}`}
                  >
                    {avatarLabel}
                  </div>
                  <span className="inbox-row-text">
                    <strong>{c.title || nameLabel}</strong>
                    {needsReply && (
                      <span className="tag gold" style={{ marginLeft: "0.5rem" }}>Needs your reply</span>
                    )}
                    {unread && !needsReply && (
                      <span className="tag" style={{ marginLeft: "0.5rem" }}>Unread</span>
                    )}
                    <br />
                    <span className="muted inbox-preview" style={{ fontWeight: unread ? 600 : 400 }}>
                      {latest ? (latest.body as string).slice(0, 90) : "No messages yet"}
                    </span>
                  </span>
                </span>
                <span className="muted inbox-row-date">
                  {c.last_message_at
                    ? `${new Date(c.last_message_at).toLocaleDateString()} ${new Date(c.last_message_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : ""}
                </span>
              </a>
              {latest && (
                <form action={setConversationReadState} className="inbox-row-actions">
                  <input type="hidden" name="conversation_id" value={c.id} />
                  <input type="hidden" name="state" value={unread ? "read" : "unread"} />
                  <button
                    type="submit"
                    className="btn secondary"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0.65rem" }}
                  >
                    {unread ? "Mark read" : "Mark unread"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="muted">{emptyText}</p>}
      </>
    );
  }

  const unreadNotificationCount = (notifications || []).filter((n: any) => !n.read_at).length;

  // Full colleague list handed to the client-side RecipientPicker - every
  // filter/search/sort on it happens in local React state from here on, so
  // there's no server round-trip and no page reload when it changes.
  const pickerContacts: PickerContact[] = Array.from(contacts.values()).map((c) => ({
    id: c.id,
    name: c.full_name,
    credentialPrefix: c.credential_prefix,
    state: c.primary_state,
    profession: professionFor(c.qualification_level),
    specialisms: Array.from(c.specialisms),
    tier: degreeOf(c),
  }));
  const specialismOptions = (allSpecialisms || []).map((s) => s.value);

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
        </div>
        <ToggleBox
          defaultTab="inbox"
          tabs={[
            {
              key: "inbox",
              label: `Inbox (${inboxRows.length})`,
              content: renderBoxRows(inboxRows, "Nothing in your inbox yet."),
            },
            {
              key: "sent",
              label: `Sent (${sentRows.length})`,
              content: renderBoxRows(sentRows, "You haven't started any conversations yet."),
            },
          ]}
        />
      </div>

      <div className="card">
        <h2>Send a New Message</h2>
        <UsStateDatalist />
        <form action={startConversation}>
          <div className="field">
            <label style={{ margin: 0 }}>Recipients</label>
            <RecipientPicker contacts={pickerContacts} specialismOptions={specialismOptions} />
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
