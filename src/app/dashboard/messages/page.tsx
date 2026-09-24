import { createClient } from "@/lib/supabase/server";
import { startConversation, setConversationReadState, setNotificationReadState } from "./actions";
import {
  acceptResponse,
  acknowledgeProviderReferral,
  declineProviderReferral,
} from "../referrals/actions";
import { professionFor } from "@/lib/profession";
import { resolveAvatarUrls } from "@/lib/avatars";
import Avatar from "../avatar";
import UsStateDatalist from "@/components/us-state-datalist";
import ToggleBox from "@/components/toggle-box";
import RecipientPicker, { type PickerContact } from "@/components/recipient-picker";
import type { ReactNode } from "react";

type Tier = "partner" | "trusted_colleague" | "bench" | "recommended" | "none";

type Contact = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string | null;
  primary_state: string | null;
  avatar_path: string | null;
  specialisms: Set<string>;
};

type PartnerGroupInfo = {
  id: string;
  full_name: string;
  open_to_group_consultation: boolean;
};

// A colleague's name, pill-colored by connection tier wherever it appears
// in the inbox - same visual language as Overview and Town Hall, so a
// partner reads blue, bench purple, recommended orange, everywhere at once.
function TierName({ id, name, tier }: { id: string; name: string; tier: Tier }) {
  if (tier === "none") {
    return <a href={`/dashboard/people/${id}`} className="person-link">{name}</a>;
  }
  return (
    <a href={`/dashboard/people/${id}`} className={`person-link tier-${tier}`}>
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
    { data: providerReferrals },
    { data: myOpenRequests },
  ] = await Promise.all([
    supabase.from("conversation_participants").select("conversation_id, last_read_at").eq("profile_id", myself),
    supabase
      .from("public_directory")
      .select("id, full_name, credential_prefix, qualification_level, primary_state, avatar_path, open_to_group_consultation, category, value"),
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
    // Referral notices, part 1: structured referrals sent in through the
    // GP/physician portal, addressed to me specifically.
    supabase
      .from("provider_referrals")
      .select("*, referring_providers(full_name, practice_name, phone, email)")
      .eq("target_profile_id", myself)
      .order("created_at", { ascending: false }),
    // Referral notices, part 2: colleagues offering to help on a bulletin-
    // board request I posted myself (the "who responded" half of Referrals,
    // now living here alongside every other kind of incoming mail).
    supabase
      .from("referral_requests")
      .select("*, lookup_values(value), referral_responses(*, profiles:responding_profile_id(full_name))")
      .eq("requesting_profile_id", myself)
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
          .select("conversation_id, profile_id, profile:profile_id(full_name, credential_prefix, avatar_path)")
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

  const otherParticipantsByConversation = new Map<number, { id: string; name: string; avatarPath: string | null }[]>();
  for (const p of allParticipants || []) {
    if (p.profile_id === myself) continue;
    const list = otherParticipantsByConversation.get(p.conversation_id) || [];
    list.push({ id: p.profile_id, name: (p.profile as any)?.full_name || "Unknown", avatarPath: (p.profile as any)?.avatar_path || null });
    otherParticipantsByConversation.set(p.conversation_id, list);
  }

  const avatarUrlByPath = await resolveAvatarUrls(supabase, [
    ...(directoryRows || []).map((r: any) => r.avatar_path),
    ...Array.from(otherParticipantsByConversation.values()).flatMap((list) => list.map((p) => p.avatarPath)),
  ]);

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
        avatar_path: (row as any).avatar_path || null,
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

  const tierByContact = new Map<string, "partner" | "trusted_colleague" | "bench">();
  for (const c of connections || []) {
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    tierByContact.set(otherId, c.tier);
  }

  // Trusted Colleague group consultation: per the spec notes, someone who's
  // opted out of group consultation on their profile should never be swept
  // into one, and the initiator should be told who was left out and why -
  // rather than silently including or silently dropping them with no
  // explanation.
  const partnerIds = Array.from(tierByContact.entries())
    .filter(([, tier]) => tier === "partner" || tier === "trusted_colleague")
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
                      <span className="inbox-row-line1">
                        <strong>{n.title}</strong>
                        <span className="tag gold" style={{ marginLeft: "0.5rem" }}>PsyAlliance Team</span>
                        {unread && <span className="tag" style={{ marginLeft: "0.3rem" }}>Unread</span>}
                      </span>
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
          const singleAvatarUrl = others.length === 1 ? avatarUrlByPath.get(others[0].avatarPath || "") || null : null;
          const groupLabel = others.length > 1 ? String(others.length) : "?";
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
                  {others.length === 1 ? (
                    <Avatar url={singleAvatarUrl} name={others[0].name} size={38} ring={singleTier} />
                  ) : (
                    <div className="msg-avatar">{groupLabel}</div>
                  )}
                  <span className="inbox-row-text">
                    <span className="inbox-row-line1">
                      <strong>{nameLabel}</strong>
                      {c.title && <span className="muted"> · {c.title}</span>}
                      {needsReply && (
                        <span className="tag gold" style={{ marginLeft: "0.5rem" }}>Needs your reply</span>
                      )}
                      {unread && !needsReply && (
                        <span className="tag" style={{ marginLeft: "0.5rem" }}>Unread</span>
                      )}
                    </span>
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

  // Referral notices: everyone's incoming "mail/requests" that isn't a
  // regular conversation - structured referrals from physicians, and
  // colleagues offering to help on a bulletin-board request I posted -
  // merged into one list and sorted by date, same shape as inboxRows above.
  // The pending count (not yet acted on) is what drives the tab badge and
  // feeds the sidebar nav's unified Messages count.
  const pendingProviderReferrals = (providerReferrals || []).filter((r: any) => r.status === "sent");
  const peerOffers = (myOpenRequests || [])
    .flatMap((r: any) => (r.referral_responses || []).map((resp: any) => ({ ...resp, request: r })));
  const pendingPeerOffers = peerOffers.filter((o: any) => o.status === "offered");
  const noticesPendingCount = pendingProviderReferrals.length + pendingPeerOffers.length;

  function renderNoticeRows() {
    const hasAny = (providerReferrals || []).length > 0 || peerOffers.length > 0;
    return (
      <>
        {(providerReferrals || []).map((r: any) => (
          <div key={`pr-${r.id}`} className="provider-referral-row">
            <div>
              <strong>{r.referring_providers?.full_name || "A physician"}</strong>
              {r.referring_providers?.practice_name ? `, ${r.referring_providers.practice_name}` : ""}{" "}
              <span className={`tag${r.urgency === "urgent" ? " danger" : ""}`}>{r.urgency}</span>
              <span className="tag">{r.status}</span>
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                {r.patient_initials ? `Patient ${r.patient_initials}` : "Patient"}
                {r.patient_age_range ? `, ${r.patient_age_range}` : ""} · {r.reason}
              </p>
              <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>
                Contact: {r.contact_details}
                {r.referring_providers?.phone ? ` · ${r.referring_providers.phone}` : ""}
                {r.referring_providers?.email ? ` · ${r.referring_providers.email}` : ""}
              </p>
              {r.status_note && <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>Your note: "{r.status_note}"</p>}
            </div>
            {r.status === "sent" && (
              <div className="provider-referral-actions">
                <form action={acknowledgeProviderReferral}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>
                    Acknowledge
                  </button>
                </form>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)" }}>Decline</summary>
                  <form action={declineProviderReferral} style={{ marginTop: "0.4rem" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <input name="status_note" type="text" placeholder="Optional note for their office" style={{ fontSize: "0.8rem" }} />
                    <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem", marginTop: "0.3rem" }}>
                      Confirm decline
                    </button>
                  </form>
                </details>
              </div>
            )}
          </div>
        ))}
        {peerOffers.map((o: any) => (
          <div key={`po-${o.id}`} className="person-row">
            <span className="person-row-info">
              <a href={`/dashboard/people/${o.responding_profile_id}`} className="person-link">
                {o.profiles?.full_name}
              </a>{" "}
              offered to help with your {o.request.lookup_values?.value || "referral"} request
              {o.request.state ? ` in ${o.request.state}` : ""}, {o.status}
              {o.message ? `: "${o.message}"` : ""}
            </span>
            <span className="person-row-actions">
              <form action={startConversation}>
                <input type="hidden" name="participant_ids" value={o.responding_profile_id} />
                <input type="hidden" name="title" value={`Re: ${o.request.lookup_values?.value || "referral"} request`} />
                <input type="hidden" name="body" value={`Hi ${o.profiles?.full_name || ""}, thanks for offering to help, could we discuss further?`} />
                <button type="submit" className="secondary">Discuss</button>
              </form>
              {o.status === "offered" && o.request.status === "open" && (
                <form action={acceptResponse}>
                  <input type="hidden" name="response_id" value={o.id} />
                  <input type="hidden" name="referral_request_id" value={o.request.id} />
                  <button type="submit">Accept</button>
                </form>
              )}
            </span>
          </div>
        ))}
        {!hasAny && (
          <p className="muted">
            Nothing here yet. Physician referrals and offers on your posted{" "}
            <a href="/dashboard/refer">referral requests</a> will show up here.
          </p>
        )}
      </>
    );
  }

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
    avatarUrl: avatarUrlByPath.get(c.avatar_path || "") || null,
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
          <h2>Your inbox</h2>
        </div>
        <ToggleBox
          defaultTab={noticesPendingCount > 0 ? "notices" : "inbox"}
          tabs={[
            {
              key: "inbox",
              label: `Inbox (${inboxRows.length})`,
              content: renderBoxRows(inboxRows, "Nothing in your inbox yet."),
            },
            {
              key: "notices",
              label: `Referral notices (${noticesPendingCount})`,
              content: renderNoticeRows(),
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
          <h2>Start Trusted Colleague group consultation</h2>
          <p className="muted">
            Starts one conversation with all your Trusted Colleagues who are open to group consultation.
          </p>
          {excludedPartners.length > 0 && (
            <div className="message-banner">
              {excludedPartners.length} colleague{excludedPartners.length === 1 ? "" : "s"} not
              included because they've opted out of group consultation:{" "}
              {excludedPartners.map((p) => p.full_name).join(", ")}.
            </div>
          )}
          {eligiblePartners.length > 0 ? (
            <form action={startConversation}>
              {eligiblePartners.map((p) => (
                <input key={p.id} type="hidden" name="participant_ids" value={p.id} />
              ))}
              <input type="hidden" name="title" value="Trusted Colleague group consultation" />
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
            <p className="muted">None of your Trusted Colleagues are currently open to group consultation.</p>
          )}
        </div>
      )}
    </div>
  );
}
