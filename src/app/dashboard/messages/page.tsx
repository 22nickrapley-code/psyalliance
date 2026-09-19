import { createClient } from "@/lib/supabase/server";
import { startConversation } from "./actions";
import { professionFor } from "@/lib/profession";

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
    searchParams: Promise<{ q?: string; degree?: string; state?: string; specialism?: string; profession?: string; sort?: string }>;
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
        <form method="GET" className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div className="field">
            <label htmlFor="q">Search colleagues</label>
            <input id="q" name="q" type="text" defaultValue={searchParams?.q || ""} placeholder="Search by name" />
          </div>
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
          <button type="submit">Start conversation</button>
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

      <div className="card">
        <h2>Your conversations</h2>
        {(conversations || []).map((c) => {
          const others = otherParticipantsByConversation.get(c.id) || [];
          const label = c.title || others.map((o) => o.name).join(", ") || "Conversation";
          const latest = latestMessageByConversation.get(c.id);
          const lastRead = lastReadByConversation.get(c.id);
          const needsAttention = !!latest && latest.author_id !== myself && (!lastRead || new Date(latest.created_at) > new Date(lastRead));
          return (
            <a
              key={c.id}
              href={`/dashboard/messages/${c.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 0.85rem",
                marginBottom: "0.3rem",
                borderRadius: "var(--radius)",
                borderLeft: needsAttention ? "3px solid var(--tier-recommended)" : "3px solid transparent",
                background: needsAttention ? "var(--tier-recommended-soft)" : "transparent",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span>
                <strong style={{ color: "var(--text)" }}>{label}</strong>
                {needsAttention && (
                  <span className="tag tier-recommended" style={{ marginLeft: "0.5rem" }}>Needs your reply</span>
                )}
                <br />
                <span className="muted" style={{ fontWeight: needsAttention ? 600 : 400 }}>
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
          <p className="muted">No conversations yet, start one above.</p>
        )}
      </div>
    </div>
  );
}
