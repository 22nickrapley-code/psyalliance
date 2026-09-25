import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { PageHead, Status, Banner } from "../_components/ui";
import { removeOrphanedFilesAction } from "./storage-actions";

// Admin overview. Counts come from admin_network_metrics(), which never
// includes demo accounts, the demo view or operator (admin-only) logins,
// and separates registered, verified, eligible and available supply.

type Metrics = Record<string, any>;

const AREAS: [string, string, string, string][] = [
  ["/dashboard/admin/invitations", "✉", "Invitations", "Requests to join and cohort invitations."],
  ["/dashboard/admin/verifications", "✓", "Verification", "Licences and credentials to review."],
  ["/dashboard/admin/members", "◎", "Members", "Search, suspend, promote."],
  ["/dashboard/admin/library", "▤", "Library governance", "Reviewers and publishing."],
  ["/dashboard/admin/moderation", "⚑", "Moderation", "Reports and redaction."],
  ["/dashboard/admin/network-health", "↗", "Network health", "Supply and response by state."],
  ["/dashboard/admin/insurance-requests", "+", "Insurance requests", "Plans members asked us to add."],
];

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "-";
}

export default async function AdminOverviewPage(props: { searchParams: Promise<{ storage_removed?: string; storage_error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);

  const [{ data: metricsRaw }, { data: emailRows }, { count: openReports }, { count: libraryHidden }, { count: joinRequests }] = await Promise.all([
    supabase.rpc("admin_network_metrics"),
    supabase.rpc("admin_email_health"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("owner_scope", "world").in("review_status", ["in_review", "needs_review"]),
    supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const { data: orphanRows } = await supabase.rpc("admin_orphaned_files");
  const orphans = (orphanRows as { size_bytes: number }[]) || [];
  const orphanMb = orphans.reduce((a, f) => a + Number(f.size_bytes || 0), 0) / 1024 / 1024;
  const m: Metrics = (metricsRaw as Metrics) || {};
  const email = Array.isArray(emailRows) ? emailRows[0] : null;
  const n = (k: string) => Number(m[k] || 0);

  const needs: [string, number, string][] = [
    ["Requests to join", joinRequests || 0, "/dashboard/admin/invitations"],
    ["Licences to review", n("licences_awaiting_review"), "/dashboard/admin/verifications"],
    ["Members awaiting a decision", n("pending") + n("flagged"), "/dashboard/admin/verifications"],
    ["Verified without a reviewed licence", n("verified_without_licence"), "/dashboard/admin/verifications#unlicensed"],
    ["Open reports", openReports || 0, "/dashboard/admin/moderation"],
    ["Library resources hidden for review", libraryHidden || 0, "/dashboard/admin/library"],
  ];
  const states = Object.entries((m.eligible_by_state as Record<string, number>) || {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHead eyebrow="Admin" title="Running the network" lead="Real members only. Demo accounts and admin-only logins are never counted." />
      <Banner error={sp.storage_error} ok={sp.storage_removed ? `Removed ${sp.storage_removed} orphaned file${sp.storage_removed === "1" ? "" : "s"}.` : undefined} />
      {orphans.length > 0 && (
        <section className="card tint" style={{ marginBottom: 20 }}>
          <div className="card-title"><h3>Storage clean-up</h3><Status tone="warn">{orphans.length} files</Status></div>
          <p className="small">
            {orphans.length} file{orphans.length === 1 ? "" : "s"} ({orphanMb.toFixed(1)} MB) belong to accounts that no longer exist: photos and uploads nobody can reach. Removing them deletes the files themselves.
          </p>
          <form action={removeOrphanedFilesAction}>
            <button type="submit" className="btn secondary small-btn">Remove orphaned files</button>
          </form>
        </section>
      )}

      <div className="split" style={{ marginBottom: 20 }}>
        <section className="card">
          <div className="card-title"><h3>Needs you</h3></div>
          {needs.map(([label, count, href]) => (
            <a key={label} href={href} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
              <span><strong>{label}</strong></span>
              {count > 0 ? <Status tone="warn">{count}</Status> : <Status tone="neutral">0</Status>}
            </a>
          ))}
        </section>
        <section className="card tint">
          <div className="card-title">
            <h3>Email</h3>
            {email?.configured ? <Status>On</Status> : <Status tone="warn">Off</Status>}
          </div>
          {email ? (
            <>
              <p className="small">
                {email.configured ? "Sending through the configured provider." : "Not switched on. Add the provider key to Supabase Vault as email_api_key. Queued emails lapse after 3 days."}
              </p>
              <ul className="summary-list">
                <li><span>Sent, last 7 days</span><b>{email.sent_7d}</b></li>
                <li><span>Failed, last 7 days</span><b>{email.failed_7d}</b></li>
                <li><span>Waiting</span><b>{email.pending}</b></li>
              </ul>
              {email.last_error ? <p className="micro-note">Last error: {email.last_error}</p> : null}
            </>
          ) : (
            <p className="small">Email status unavailable.</p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><h3>Supply</h3><span className="micro-note">Each step is a subset of the one before</span></div>
        <div className="three-grid admin-funnel">
          {[
            ["Registered", n("registered"), "Clinician accounts"],
            ["Verified", n("verified"), "Identity and degree signed off"],
            ["Eligible", n("eligible"), "Verified, active, reviewed in-date licence"],
            ["Available", n("available"), "Eligible, open to referrals or cover, confirmed in 30 days"],
          ].map(([label, value, note]) => (
            <div key={String(label)} className="quiet-panel">
              <div className="eyebrow">{label}</div>
              <div className="metric" style={{ margin: "8px 0" }}>{value}</div>
              <p className="micro-note" style={{ margin: 0 }}>{note}</p>
            </div>
          ))}
        </div>
        <div className="divider" style={{ margin: "18px 0 12px" }} />
        <div className="eyebrow">Eligible members by licensed state</div>
        {states.length ? (
          <div className="chip-row" style={{ marginTop: 8 }}>
            {states.map(([st, c]) => (
              <span key={st} className="chip">{st} &middot; {c}</span>
            ))}
          </div>
        ) : (
          <p className="small" style={{ marginTop: 6 }}>No eligible members yet. The founding cohort is still forming.</p>
        )}
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><h3>Last 30 days</h3><span className="micro-note">From real requests and replies</span></div>
        <ul className="summary-list">
          <li><span>Referrals sent</span><b>{n("referrals_30d")}</b></li>
          <li><span>Referrals with a reply</span><b>{n("referrals_answered_30d")} ({pct(n("referrals_answered_30d"), n("referrals_30d"))})</b></li>
          <li><span>Median time to first referral reply</span><b>{m.referral_median_hours_to_reply != null ? `${m.referral_median_hours_to_reply} h` : "-"}</b></li>
          <li><span>Cover requests sent</span><b>{n("cover_requests_30d")}</b></li>
          <li><span>Cover requests answered / accepted</span><b>{n("cover_answered_30d")} / {n("cover_accepted_30d")}</b></li>
          <li><span>Median time to a cover reply</span><b>{m.cover_median_hours_to_reply != null ? `${m.cover_median_hours_to_reply} h` : "-"}</b></li>
          <li><span>Trusted-circle invitations accepted</span><b>{n("invitations_accepted_30d")} of {n("invitations_30d")} ({pct(n("invitations_accepted_30d"), n("invitations_30d"))})</b></li>
          <li><span>Consult questions answered</span><b>{n("consults_answered_30d")} of {n("consults_30d")}</b></li>
        </ul>
      </section>

      <section>
        <div className="section-heading"><h2>Admin areas</h2></div>
        <div className="tile-grid">
          {AREAS.map(([href, symbol, title, body]) => (
            <a key={href} className="task-tile" href={href}>
              <span className="symbol" aria-hidden="true">{symbol}</span>
              <b>{title}</b>
              <span>{body}</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
