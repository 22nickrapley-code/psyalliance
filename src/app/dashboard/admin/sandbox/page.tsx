import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { IS_DEMO_SITE } from "@/lib/env";
import { PageHead, Banner, Status } from "../../_components/ui";
import { CopyLink } from "../../_components/copy-link";
import { createSandboxPassAction, revokeSandboxPassAction, issueSandboxRequestAction, declineSandboxRequestAction } from "./actions";

async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

// Demo site only. Prospects ask for a sandbox from the tour; each request
// lands here and one click issues that person their own 7-day link. Every
// pass opens a fresh fictional practice; nothing is shared between
// prospects, and the guest account is deleted when the pass expires or is
// revoked.
export default async function SandboxPassesPage(props: { searchParams: Promise<{ error?: string; created?: string; for?: string }> }) {
  if (!IS_DEMO_SITE) notFound();
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const site = await origin();
  const [{ data: passes }, { data: requests }] = await Promise.all([
    supabase
      .from("sandbox_passes")
      .select("id, token, label, created_at, expires_at, revoked_at, claimed_at, claims")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sandbox_requests")
      .select("id, full_name, email, role, state, note, status, created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  const now = Date.now();
  const waiting = requests || [];

  return (
    <>
      <PageHead
        eyebrow="Demo admin"
        title="Sandbox passes"
        lead="Prospects ask for a sandbox from the tour. Issue each person their own link; it expires on its own and you can revoke it at any time."
      />
      <Banner error={sp.error} />
      {sp.created && (
        <section className="card tint issued-pass">
          <div className="eyebrow">Pass issued</div>
          <h3 className="serif-title" style={{ margin: "4px 0 6px" }}>
            {sp.for ? <>Send this link to {sp.for}</> : <>Send this link to the prospect</>}
          </h3>
          <p className="small">It&rsquo;s personal to them: please don&rsquo;t reuse it for anyone else. Opening it signs them in to a fresh fictional practice.</p>
          <CopyLink value={`${site}/sandbox/${sp.created}`} label="Sandbox link" />
          {sp.for && (
            <a
              className="text-arrow"
              style={{ marginTop: 10, display: "inline-block" }}
              href={`mailto:${sp.for}?subject=${encodeURIComponent("Your PsyAlliance sandbox")}&body=${encodeURIComponent(
                `Here is your personal PsyAlliance sandbox. It opens a fictional practice with invented colleagues, so you can try cover, referrals and consultation freely.\n\n${site}/sandbox/${sp.created}\n\nThe link is yours alone and works for 7 days. "Start the story again" at the top of the sandbox clears your fictional activity and returns everything to the beginning. Nothing you enter reaches the real network.`,
              )}`}
            >
              Draft the email &rarr;
            </a>
          )}
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <h3>Requests</h3>
          {waiting.length > 0 && <Status tone="warn">{waiting.length} waiting</Status>}
        </div>
        {waiting.length === 0 ? (
          <p className="small" style={{ margin: 0 }}>No one is waiting. New requests from the tour appear here.</p>
        ) : (
          waiting.map((r: any) => (
            <div key={r.id} className="item row between wrap" style={{ gap: 12 }}>
              <span style={{ minWidth: 0 }}>
                <strong>{r.full_name}</strong>
                <p>
                  {r.email}
                  {r.role ? ` · ${r.role}` : ""}
                  {r.state ? ` · ${r.state}` : ""} &middot; asked {day(r.created_at)}
                </p>
                {r.note && <p className="small" style={{ margin: "4px 0 0" }}>&ldquo;{r.note}&rdquo;</p>}
              </span>
              <span className="row" style={{ gap: 8 }}>
                <form action={issueSandboxRequestAction} className="inline">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="days" value="7" />
                  <button type="submit" className="btn small-btn">Issue 7-day pass</button>
                </form>
                <form action={declineSandboxRequestAction} className="inline">
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="plain-button small">Decline</button>
                </form>
              </span>
            </div>
          ))
        )}
      </section>

      <div className="split" style={{ marginTop: 20 }}>
        <section className="card">
          <div className="card-title"><h3>Passes</h3></div>
          {(passes || []).length === 0 && <p className="small">No passes yet.</p>}
          {(passes || []).map((p: any) => {
            const expired = new Date(p.expires_at).getTime() < now;
            const live = !p.revoked_at && !expired;
            const state = p.revoked_at ? "Revoked" : expired ? "Expired" : p.claimed_at ? "In use" : "Not opened";
            return (
              <div key={p.id} className="item" style={{ display: "grid", gap: 8 }}>
                <div className="row between wrap" style={{ gap: 12 }}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{p.label}</strong>
                    <p>
                      Until {day(p.expires_at)} &middot; opened {p.claims} time{p.claims === 1 ? "" : "s"}
                    </p>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <Status tone={state === "In use" ? "" : state === "Not opened" ? "warn" : "neutral"}>{state}</Status>
                    {live && (
                      <form action={revokeSandboxPassAction} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="plain-button small">Revoke</button>
                      </form>
                    )}
                  </span>
                </div>
                {live && (
                  <details className="pass-link">
                    <summary className="small">Show link</summary>
                    <CopyLink value={`${site}/sandbox/${p.token}`} label={`Sandbox link for ${p.label}`} />
                  </details>
                )}
              </div>
            );
          })}
        </section>
        <aside className="stack">
          <section className="card">
            <div className="card-title"><h3>Issue a pass directly</h3></div>
            <p className="small">For someone who asked you in person rather than through the tour.</p>
            <form action={createSandboxPassAction} className="fields">
              <label className="field">Who it&rsquo;s for<input name="label" required placeholder="e.g. Dr. Jane Smith, Boston" /></label>
              <label className="field">
                Days open
                <select name="days" defaultValue="7">
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>
              <button type="submit" className="btn small-btn" style={{ alignSelf: "flex-start" }}>Create pass</button>
            </form>
          </section>
          <section className="card tint">
            <div className="eyebrow">How passes work</div>
            <p className="small" style={{ marginBottom: 0 }}>
              One link per person, never shared. &ldquo;Start the story again&rdquo; in the sandbox clears that person&rsquo;s fictional activity and restores the opening story. Expired and revoked guests are deleted within the hour.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
