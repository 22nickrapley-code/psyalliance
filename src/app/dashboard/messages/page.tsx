import { createClient } from "@/lib/supabase/server";
import { startConversation, setNotificationReadState } from "./actions";
import { acknowledgeProviderReferral, declineProviderReferral } from "../referrals/actions";
import { loadConversations } from "./data";
import { ConversationList, MessagesShell } from "./views";
import { Banner, Empty } from "../_components/ui";

// Messages (Product Spec v1): the direct inbox for professional
// conversation. Threads that started from a referral, cover request or
// consult carry that context. Admin notices and physician-portal referrals
// sit below the conversation list.
export default async function MessagesPage(props: { searchParams: Promise<{ error?: string; compose?: string; to?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [items, { data: conns }, { data: saved }, { data: notices }, { data: providerReferrals }] = await Promise.all([
    loadConversations(supabase, myself),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, requester:requester_id(full_name, credential_prefix), addressee:addressee_id(full_name, credential_prefix)")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("saved_clinicians").select("clinician_id, clinician:clinician_id(full_name, credential_prefix)").eq("profile_id", myself),
    supabase.from("system_notifications").select("id, title, body, created_at, read_at").eq("profile_id", myself).order("created_at", { ascending: false }).limit(10),
    supabase
      .from("provider_referrals")
      .select("id, status, created_at, reason, referring_providers(full_name, practice_name)")
      .eq("target_profile_id", myself)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "Colleague");
  const contacts = new Map<string, string>();
  for (const c of conns || []) {
    const mine = c.requester_id === myself;
    contacts.set(mine ? c.addressee_id : c.requester_id, nameOf(mine ? (c as any).addressee : (c as any).requester));
  }
  for (const s of saved || []) if (!contacts.has(s.clinician_id)) contacts.set(s.clinician_id, nameOf((s as any).clinician));
  const unreadNotices = (notices || []).filter((n: any) => !n.read_at);

  return (
    <MessagesShell list={<ConversationList items={items} />}>
      <Banner error={sp.error} />
      {items.length === 0 && contacts.size === 0 ? (
        <Empty
          symbol={"✉"}
          title="No conversations yet."
          body="Messages start from a colleague's profile, a referral reply or a cover request, and stay attached to what they're about. Start by finding someone in Network."
          action={<a className="btn secondary small-btn" href="/dashboard/network">Find a colleague</a>}
        />
      ) : (
      <section className="card">
        <div className="eyebrow">New message</div>
        <h3>Write to a colleague</h3>
        {contacts.size === 0 ? (
          <p className="small">Message anyone from their profile in Network. Trusted colleagues and saved clinicians appear here for quick access.</p>
        ) : (
          <form action={startConversation}>
            <label className="field">
              To
              <select name="participant_ids" required defaultValue={sp.to || ""}>
                <option value="">Choose a colleague</option>
                {Array.from(contacts.entries()).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              Message
              <textarea name="body" required maxLength={4000} placeholder="Write a professional message. No patient-identifying details." />
            </label>
            <div className="row between" style={{ marginTop: 10 }}>
              <span className="micro-note">For a case question with several colleagues, use Consult.</span>
              <button type="submit" className="btn small-btn">Send</button>
            </div>
          </form>
        )}
      </section>
      )}



      {(providerReferrals || []).length > 0 && (
        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><h3>Physician referrals</h3></div>
          {(providerReferrals || []).map((r: any) => (
            <div key={r.id} className="item">
              <strong>{r.referring_providers?.full_name || "A physician"}{r.referring_providers?.practice_name ? ` · ${r.referring_providers.practice_name}` : ""}</strong>
              <p>{r.reason || "Referral"} &middot; {new Date(r.created_at).toLocaleDateString()} &middot; {r.status}</p>
              {r.status === "sent" && (
                <div className="row" style={{ marginTop: 6 }}>
                  <form action={acknowledgeProviderReferral} className="inline"><input type="hidden" name="id" value={r.id} /><button type="submit" className="btn small-btn">Acknowledge</button></form>
                  <form action={declineProviderReferral} className="inline"><input type="hidden" name="id" value={r.id} /><button type="submit" className="btn ghost small-btn">Decline</button></form>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {(notices || []).length > 0 && (
        <details className="card" style={{ marginTop: 14 }} open={unreadNotices.length > 0}>
          <summary><strong>Notices from PsyAlliance</strong>{unreadNotices.length ? ` · ${unreadNotices.length} new` : ""}</summary>
          {(notices || []).map((n: any) => (
            <div key={n.id} className="item">
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              {!n.read_at && (
                <form action={setNotificationReadState}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="state" value="read" />
                  <input type="hidden" name="redirect_to" value="/dashboard/messages" />
                  <button type="submit" className="plain-button small">Mark read</button>
                </form>
              )}
            </div>
          ))}
        </details>
      )}
    </MessagesShell>
  );
}
