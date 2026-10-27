import { shortDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { PageHead, Banner, Status, Empty } from "../../_components/ui";
import { createInvitationAction, declineJoinRequestAction, revokeInvitationAction } from "./actions";

export const metadata = { title: "Invitations" };

async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// Sign-up is open (0102), so invitations are optional: a personal link
// that fills in the person's name and email. Requests to join from before
// sign-up opened are still listed so nobody is lost.
export default async function InvitationsPage(props: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const site = await origin();
  const link = (token: string) => `${site}/auth/sign-up?invite=${token}`;

  const [{ data: requests }, { data: invitations }] = await Promise.all([
    supabase.from("join_requests").select("*").eq("status", "new").order("created_at", { ascending: true }),
    supabase.from("cohort_invitations").select("id, token, email, full_name, created_at, expires_at, redeemed_at, revoked_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const now = Date.now();
  const state = (i: any) =>
    i.redeemed_at ? (["Joined", ""] as const) : i.revoked_at ? (["Revoked", "neutral"] as const) : new Date(i.expires_at).getTime() < now ? (["Expired", "neutral"] as const) : (["Open", "warn"] as const);

  return (
    <>
      <PageHead eyebrow="Admin" title="Invitations" lead="Anyone eligible can create an account now. Use a personal link when you want to invite someone directly; it fills in their name and email." />
      <Banner error={sp.error} />
      {sp.created && (
        <section className="card tint" style={{ marginBottom: 20 }}>
          <div className="eyebrow">Invitation created</div>
          <p className="small">Send this link from your own email. It works once and expires in 30 days.</p>
          <input readOnly value={link(sp.created)} aria-label="Invitation link" style={{ width: "100%" }} />
        </section>
      )}

      <div className="split">
        <section className="card">
          <div className="card-title"><h3>Requests from before sign-up opened</h3><span className="micro-note">{(requests || []).length} new</span></div>
          {(requests || []).length === 0 ? (
            <Empty symbol={"✉"} title="No new requests." body="Send each of these people the sign-up link, or a personal invitation." />
          ) : (
            (requests || []).map((r: any) => (
              <div key={r.id} className="item">
                <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span>
                    <strong>{r.full_name}{r.qualification ? `, ${r.qualification}` : ""}</strong>
                    <p>{r.email}{r.licensed_states ? ` · ${r.licensed_states}` : ""} · {shortDate(r.created_at)}</p>
                    {r.practice_note && <p>{r.practice_note}</p>}
                  </span>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <form action={createInvitationAction} className="inline">
                    <input type="hidden" name="join_request_id" value={r.id} />
                    <input type="hidden" name="email" value={r.email} />
                    <input type="hidden" name="full_name" value={r.full_name} />
                    <button type="submit" className="btn small-btn">Invite</button>
                  </form>
                  <form action={declineJoinRequestAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn ghost small-btn">Not now</button>
                  </form>
                </div>
              </div>
            ))
          )}
        </section>

        <aside className="stack">
          <section className="card">
            <div className="card-title"><h3>Invite someone directly</h3></div>
            <form action={createInvitationAction} className="fields">
              <label className="field">Name<input name="full_name" /></label>
              <label className="field">Email <span className="micro-note">(the account must use this address)</span><input name="email" type="email" /></label>
              <label className="field">Note to self<input name="note" placeholder="e.g. NY, trauma, met at conference" /></label>
              <button type="submit" className="btn secondary small-btn" style={{ alignSelf: "flex-start" }}>Create invitation</button>
            </form>
          </section>
          <section className="card">
            <div className="card-title"><h3>Recent invitations</h3></div>
            {(invitations || []).length === 0 && <p className="small">None yet.</p>}
            {(invitations || []).map((i: any) => {
              const [label, tone] = state(i);
              return (
                <div key={i.id} className="item row between" style={{ gap: 10 }}>
                  <span>
                    <strong>{i.full_name || i.email || "Unnamed"}</strong>
                    <p>{i.email || "any email"} · {shortDate(i.created_at)}</p>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <Status tone={tone}>{label}</Status>
                    {label === "Open" && (
                      <form action={revokeInvitationAction} className="inline">
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="plain-button small">Revoke</button>
                      </form>
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        </aside>
      </div>
    </>
  );
}
