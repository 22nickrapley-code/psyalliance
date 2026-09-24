import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { IS_DEMO_SITE } from "@/lib/env";
import { PageHead, Banner, Status } from "../../_components/ui";
import { createSandboxPassAction, revokeSandboxPassAction } from "./actions";

async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// Demo site only: personal sandbox passes for prospects. Each pass opens a
// fresh fictional practice; nothing is shared between prospects, and the
// guest account is deleted when the pass expires or is revoked.
export default async function SandboxPassesPage(props: { searchParams: Promise<{ error?: string; created?: string }> }) {
  if (!IS_DEMO_SITE) notFound();
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const site = await origin();
  const { data: passes } = await supabase
    .from("sandbox_passes")
    .select("id, token, label, created_at, expires_at, revoked_at, claimed_at, claims")
    .order("created_at", { ascending: false })
    .limit(100);
  const now = Date.now();

  return (
    <>
      <PageHead eyebrow="Demo admin" title="Sandbox passes" lead="One pass per prospect. Each opens a fresh fictional practice and expires on its own." />
      <Banner error={sp.error} />
      {sp.created && (
        <section className="card tint" style={{ marginBottom: 20 }}>
          <div className="eyebrow">Pass created</div>
          <p className="small">Send this link to the prospect. Opening it again resets their sandbox.</p>
          <input readOnly value={`${site}/sandbox/${sp.created}`} aria-label="Sandbox link" style={{ width: "100%" }} />
        </section>
      )}
      <div className="split">
        <section className="card">
          <div className="card-title"><h3>Passes</h3></div>
          {(passes || []).length === 0 && <p className="small">No passes yet.</p>}
          {(passes || []).map((p: any) => {
            const expired = new Date(p.expires_at).getTime() < now;
            const state = p.revoked_at ? "Revoked" : expired ? "Expired" : p.claimed_at ? "In use" : "Not opened";
            return (
              <div key={p.id} className="item row between" style={{ gap: 12 }}>
                <span>
                  <strong>{p.label}</strong>
                  <p>
                    Until {new Date(p.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} &middot; opened {p.claims} time{p.claims === 1 ? "" : "s"}
                  </p>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Status tone={state === "In use" ? "" : state === "Not opened" ? "warn" : "neutral"}>{state}</Status>
                  {!p.revoked_at && !expired && (
                    <form action={revokeSandboxPassAction} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="plain-button small">Revoke</button>
                    </form>
                  )}
                </span>
              </div>
            );
          })}
        </section>
        <aside className="stack">
          <section className="card">
            <div className="card-title"><h3>New pass</h3></div>
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
            <div className="eyebrow">Reset</div>
            <p className="small" style={{ marginBottom: 0 }}>Guests can start the story again from the banner. Expired and revoked guests are deleted within the hour.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
