import { createClient } from "@/lib/supabase/server";

const STALE_AFTER = 30 * 24 * 60 * 60 * 1000;

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unconfirmed";
  return value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default async function DashboardHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const memberId = user!.id;

  // Bounded queries keep the first signed-in screen responsive even when
  // the network grows. The directory and ranking live on the Network page.
  const [
    { data: profile },
    { count: connectionCount },
    { count: coverageCount },
    { count: providerCount },
    { data: recentResources },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name,verification_status,availability_confirmed_at,coverage_availability,referral_availability,consultation_availability").eq("id", memberId).maybeSingle(),
    supabase.from("connections").select("id", { count: "exact", head: true }).eq("addressee_id", memberId).eq("status", "pending"),
    supabase.from("coverage_requests").select("id", { count: "exact", head: true }).eq("requested_profile_id", memberId).eq("status", "sent"),
    supabase.from("provider_referrals").select("id", { count: "exact", head: true }).eq("target_profile_id", memberId).eq("status", "sent"),
    supabase.from("documents").select("id,title,version,review_date").eq("owner_scope", "world").eq("review_status", "published").order("publish_date", { ascending: false }).limit(2),
  ]);

  const stale = !profile?.availability_confirmed_at ||
    Date.now() - new Date(profile.availability_confirmed_at).getTime() > STALE_AFTER;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const attention = [
    { count: coverageCount || 0, label: "Coverage requests", detail: "Colleagues waiting for your response", href: "/dashboard/requests?tab=coverage" },
    { count: providerCount || 0, label: "Physician referrals", detail: "New referrals awaiting your decision", href: "/dashboard/messages" },
    { count: connectionCount || 0, label: "Connection invitations", detail: "Build your trusted network", href: "/dashboard/network" },
  ];

  return <div className="home-page">
    <div className="home-heading"><div><span className="section-kicker">Your professional home</span>
      <h1>Good to see you, {firstName}.</h1>
      <p>Make the next useful move for your practice and your colleagues.</p></div>
      <span className="home-credential-status">{profile?.verification_status === "verified" ? "✓ Credential reviewed" : "Credential review pending"}</span>
    </div>

    <section className="home-section" aria-labelledby="home-attention-title">
      <div className="home-section-heading"><div><span className="section-kicker">01 / In focus</span><h2 id="home-attention-title">What needs your attention</h2></div>
        <a href="/dashboard/notifications">All notifications →</a></div>
      <div className="home-attention-grid">{attention.map((item) => <a className="home-attention-card" href={item.href} key={item.label}>
        <span className="home-attention-count">{item.count}</span><h3>{item.label}</h3><p>{item.detail}</p><span className="home-arrow" aria-hidden="true">↗</span>
      </a>)}</div>
      {stale && <a className="home-availability-alert" href="/dashboard/availability"><span><strong>Confirm your availability</strong><br />Colleagues need a current answer before contacting you for coverage, referrals or consultation.</span><span aria-hidden="true">Update now →</span></a>}
    </section>

    <section className="home-section" aria-labelledby="home-work-title"><div className="home-section-heading"><div><span className="section-kicker">02 / Work together</span><h2 id="home-work-title">What would you like to do?</h2></div></div>
      <div className="home-action-grid">
        <a href="/dashboard/requests?tab=coverage" className="home-action-card"><span className="home-action-icon">↗</span><h3>Arrange coverage</h3><p>Plan for leave or ask a colleague to step in.</p><span>Start a plan →</span></a>
        <a href="/dashboard/requests?tab=referrals" className="home-action-card"><span className="home-action-icon">◎</span><h3>Find a referral</h3><p>Reach the right clinician with a de-identified request.</p><span>Create a request →</span></a>
        <a href="/dashboard/consult" className="home-action-card"><span className="home-action-icon">✳</span><h3>Ask your peers</h3><p>Open a focused consultation with colleagues.</p><span>Ask a question →</span></a>
        <a href="/dashboard/network" className="home-action-card"><span className="home-action-icon">◇</span><h3>Grow your network</h3><p>Find psychologists and psychiatrists to work with.</p><span>Explore clinicians →</span></a>
      </div>
    </section>

    <section className="home-section home-bottom-grid" aria-label="Availability and resources">
      <div className="home-availability-card"><span className="section-kicker">03 / Your signal</span><h2>Keep colleagues in the know.</h2><p>Availability is a small update that makes every connection more useful.</p>
        <dl><div><dt>Coverage</dt><dd>{stale ? "Unconfirmed" : formatStatus(profile?.coverage_availability)}</dd></div><div><dt>Referrals</dt><dd>{stale ? "Unconfirmed" : formatStatus(profile?.referral_availability)}</dd></div><div><dt>Consultation</dt><dd>{stale ? "Unconfirmed" : formatStatus(profile?.consultation_availability)}</dd></div></dl>
        <a href="/dashboard/availability" className="btn secondary">Update availability →</a></div>
      <div className="home-library-card"><span className="section-kicker">04 / Practice Library</span><h2>Good resources, ready when you are.</h2><p>Use the current reviewed version of each professional resource.</p>
        {recentResources?.length ? <ul>{recentResources.map((item) => <li key={item.id}><a href={`/dashboard/documents/${item.id}/open`} target="_blank" rel="noreferrer"><span>{item.title}</span><small>Version {item.version} · Reviewed {item.review_date || "pending"}</small></a></li>)}</ul> : <p className="home-library-empty">Resources will appear here after independent review.</p>}
        <a href="/dashboard/documents">Browse the Library →</a></div>
    </section>
  </div>;
}
