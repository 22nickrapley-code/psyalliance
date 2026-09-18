import { createClient } from "@/lib/supabase/server";
import { startConversation } from "./actions";

type Contact = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  specialisms: Set<string>;
};

type PartnerGroupInfo = {
  id: string;
  full_name: string;
  open_to_group_consultation: boolean;
};

export default async function MessagesPage(
  props: {
    searchParams: Promise<{ q?: string; degree?: string }>;
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
  ] = await Promise.all([
    supabase.from("conversation_participants").select("conversation_id, last_read_at").eq("profile_id", myself),
    supabase.from("public_directory").select("id, full_name, credential_prefix, open_to_group_consultation, category, value"),
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
  ]);

  const conversationIds = (myParticipantRows || []).map((r) => r.conversation_id);
  const lastReadByConversation = new Map((myParticipantRows || []).map((r) => [r.conversation_id, r.last_read_at]));

  const [{ data: conversations }, { data: allParticipants }, { data: recentMessages }] = await Promise.all([
    conversationIds.length
      ? supabase
          .from("conversations")
          .select("id, title, last_message_at")
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

  function degreeOf(contact: Contact): "partner" | "bench" | "recommended" | "none" {
    const tier = tierByContact.get(contact.id);
    if (tier) return tier;
    if ([...contact.specialisms].some((s) => mySpecialisms.has(s))) return "recommended";
    return "none";
  }

  const q = (searchParams?.q || "").trim().toLowerCase();
  const degreeFilter = searchParams?.degree || "all";

  const filteredContacts = Array.from(contacts.values())
    .filter((c) => !q || c.full_name.toLowerCase().includes(q))
    .filter((c) => degreeFilter === "all" || degreeOf(c) === degreeFilter)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div>
      <h1>Messages</h1>
      <p className="muted">
        Private, threaded conversations with your verified colleagues — separate from Town Hall's
        open specialism channels.
      </p>

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

      <div className="card">
        <h2>Start new conversation</h2>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end", marginBottom: "1rem" }}>
          <div className="field">
            <label htmlFor="q">Search colleagues</label>
            <input id="q" name="q" type="text" defaultValue={searchParams?.q || ""} placeholder="Search by name" />
          </div>
          <div className="field">
            <label htmlFor="degree">Filter</label>
            <select id="degree" name="degree" defaultValue={degreeFilter}>
              <option value="all">ALL</option>
              <option value="partner">Partner</option>
              <option value="bench">Bench</option>
              <option value="recommended">Recommended</option>
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Filter</button>
          </div>
        </form>

        <form action={startConversation}>
          <div className="field">
            <label>Recipients</label>
            <div className="checkbox-grid" style={{ maxHeight: 220, overflowY: "auto" }}>
              {filteredContacts.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" name="participant_ids" value={c.id} />
                  {c.credential_prefix ? `${c.credential_prefix} ` : ""}
                  {c.full_name}
                  {tierByContact.get(c.id) && (
                    <span className="tag" style={{ marginLeft: "0.3rem" }}>{tierByContact.get(c.id)}</span>
                  )}
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
          <button type="submit">Start conversation</button>
        </form>
      </div>

      <div className="card">
        <h2>Your conversations</h2>
        {(conversations || []).map((c) => {
          const others = otherParticipantsByConversation.get(c.id) || [];
          const label = c.title || others.map((o) => o.name).join(", ") || "Conversation";
          const latest = latestMessageByConversation.get(c.id);
          const lastRead = lastReadByConversation.get(c.id);
          const unread = latest && (!lastRead || new Date(latest.created_at) > new Date(lastRead));
          return (
            <a
              key={c.id}
              href={`/dashboard/messages/${c.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 0",
                borderBottom: "1px solid var(--border)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span>
                <strong style={{ color: "var(--text)" }}>{label}</strong>
                {unread && <span className="tag gold" style={{ marginLeft: "0.5rem" }}>New</span>}
                <br />
                <span className="muted">
                  {latest ? (latest.body as string).slice(0, 90) : "No messages yet"}
                </span>
              </span>
              <span className="muted" style={{ whiteSpace: "nowrap", marginLeft: "1rem" }}>
                {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : ""}
              </span>
            </a>
          );
        })}
        {(conversations || []).length === 0 && (
          <p className="muted">No conversations yet — start one above.</p>
        )}
      </div>
    </div>
  );
}
