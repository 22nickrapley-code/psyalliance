import { shortDate } from "@/lib/dates";
import { ColleaguePicker } from "../_components/colleague-picker";
import { loadColleagueSuggestions } from "@/lib/colleague-suggestions";
import { createClient } from "@/lib/supabase/server";
import { startConversation } from "./actions";
import { NotificationsPanel, countNewNotifications } from "../notifications/panel";
import { acknowledgeProviderReferral, declineProviderReferral } from "../referrals/actions";
import { loadConversations } from "./data";
import { ConversationList, MessagesShell } from "./views";
import { ThreadPanel } from "./thread";
import { Banner, Empty } from "../_components/ui";

export const metadata = { title: "Messages" };

// Messages (Product Spec v1): the direct inbox for professional
// conversation. Threads that started from a referral, cover request or
// consult carry that context. Physician-portal referrals sit below.
// Notifications have their own tab (?tab=notifications), which the bell
// opens too.
const composingFirst = (sp: { compose?: string; to?: string; error?: string }, n: number) => !!sp.compose || !!sp.to || !!sp.error || n === 0;

export default async function MessagesPage(props: { searchParams: Promise<{ error?: string; compose?: string; to?: string; list?: string; tab?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  if (sp.tab === "notifications") {
    return (
      <MessagesShell list={null} tab="notifications" newNotifications={await countNewNotifications(supabase, myself)}>
        <NotificationsPanel supabase={supabase} myself={myself} />
      </MessagesShell>
    );
  }

  const [items, newNotifications, { data: providerReferrals }] = await Promise.all([
    loadConversations(supabase, myself),
    countNewNotifications(supabase, myself),
    supabase
      .from("provider_referrals")
      .select("id, status, created_at, reason, referring_providers(full_name, practice_name)")
      .eq("target_profile_id", myself)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const suggestions = composingFirst(sp, items.length) ? await loadColleagueSuggestions(supabase, myself, sp.to || null) : [];

  // Messages opens on the latest conversation; "New" opens the composer.
  const composing = !!sp.compose || !!sp.to || !!sp.error || items.length === 0;
  const openId = composing ? null : items[0].id;
  if (openId) {
    await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", openId).eq("profile_id", myself);
    items[0] = { ...items[0], unread: false };
  }

  return (
    <MessagesShell
      list={<ConversationList items={items} activeId={openId ?? undefined} composing={composing} />}
      view={composing ? "compose" : "index"}
      newNotifications={newNotifications}
    >
      <Banner error={sp.error} />
      {openId ? (
        <div className="index-thread">
          <ThreadPanel id={openId} myself={myself} />
        </div>
      ) : items.length === 0 && suggestions.length === 0 ? (
        <Empty
          symbol={"✉"}
          title="No conversations yet."
          body="Messages start from a colleague's profile, a referral reply or a cover request, and stay attached to what they're about. Start by finding someone in Clinicians."
          action={<a className="btn secondary small-btn" href="/dashboard/clinicians">Find a colleague</a>}
        />
      ) : (
      <section className="card compose-card">
        <div className="eyebrow">New message</div>
        <h2 className="serif-title" style={{ fontSize: 26, margin: "6px 0 14px" }}>Write to a colleague</h2>
        <form action={startConversation} data-deidentify="">
          <ColleaguePicker suggestions={suggestions} name="participant_ids" mode="single" initial={sp.to ? [sp.to] : []} />
          <label className="field grow" style={{ marginTop: 18 }}>
            Message
            <textarea name="body" required maxLength={4000} placeholder="Write a professional message. No client-identifying details." />
          </label>
          <div className="row between">
            <span className="micro-note">For a client question with several colleagues, use <a href="/dashboard/consult/new">Ask colleagues</a>.</span>
            <button type="submit" className="btn lg">Send</button>
          </div>
        </form>
      </section>
      )}



      {(providerReferrals || []).length > 0 && (
        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><h3>Physician referrals</h3></div>
          {(providerReferrals || []).map((r: any) => (
            <div key={r.id} className="item">
              <strong>{r.referring_providers?.full_name || "A physician"}{r.referring_providers?.practice_name ? ` · ${r.referring_providers.practice_name}` : ""}</strong>
              <p>{r.reason || "Referral"} &middot; {shortDate(r.created_at)} &middot; {r.status}</p>
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


    </MessagesShell>
  );
}
