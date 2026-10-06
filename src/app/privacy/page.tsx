import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";

export const metadata = { title: "Privacy" };

// Plain-language privacy notes. Not yet a reviewed legal policy: that needs
// counsel (data handling across Supabase and Cloudflare, state rules)
// before launch. This page says what the product actually does today.
export default function PrivacyPage() {
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 760 }}>
            <div className="section-intro">
              <div className="eyebrow">Privacy</div>
              <h2>How PsyAlliance handles information.</h2>
              <p>Plain-language notes while our full privacy policy completes legal review. Questions: <a href="mailto:hello@psyalliance.org">hello@psyalliance.org</a>.</p>
            </div>

            <h3>Rules we don&rsquo;t bend</h3>
            <ul className="rules" style={{ marginBottom: 36 }}>
              <li><b>Needs, not people</b>Clients are described by need. We flag dates, contact details and record numbers before anything is sent, and remove anything identifying that&rsquo;s reported.</li>
              <li><b>Verified means reviewed</b>Listing and requests require a reviewed identity, degree and in-date license.</li>
              <li><b>Facts, not judgments</b>Profiles show facts on file with dates. Whether a colleague suits a client is your professional call.</li>
              <li><b>Nothing sends without review</b>Every request and post shows exactly who will see it before you confirm.</li>
              <li><b>Private by default</b>Who you save, exclude or block is never visible to them.</li>
              <li><b>Never sold, never advertised to</b>Your data isn&rsquo;t sold or used for advertising.</li>
            </ul>

            <h3>Your information</h3>
            <p>
              We use your profile and credentials to verify you and to connect you with other verified clinicians. Your license numbers, NPI, CAQH and malpractice details,
              and your contact email and phone are visible only to you and to PsyAlliance admins. Other verified members see your professional profile: name, degree,
              practice location, specialties, availability and the states where your license is reviewed. Accounts that aren&rsquo;t verified yet can&rsquo;t see other members.
              We don&rsquo;t sell member data or use it for advertising.
            </p>

            <h3 style={{ marginTop: 28 }}>Client information</h3>
            <p>
              PsyAlliance is designed so client identities never enter it. Cover plans, referrals and consults describe needs, not people. Before anything is sent, we flag dates,
              phone numbers, email and street addresses and record numbers. We can&rsquo;t reliably recognize names, so please leave names and unusual combinations of details
              out. The clinical handoff happens outside PsyAlliance, through your own secure channel, once a colleague agrees. Email notifications never include what you wrote.
            </p>

            <h3 style={{ marginTop: 28 }}>If client information is shared by mistake</h3>
            <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
              <li>Remove it yourself if you can: you can remove your own messages at any time.</li>
              <li>Otherwise use <b>Report</b> on the post, reply or message and choose &ldquo;It identifies a client&rdquo;. Don&rsquo;t repeat the details in the report.</li>
              <li>An admin reviews it as a priority and replaces the text everywhere it appears in PsyAlliance. We log that it happened, without keeping the removed words.</li>
              <li>We tell you when it&rsquo;s done. Whether the disclosure needs further action under your own professional or legal obligations is your call; we&rsquo;ll give you the facts you need.</li>
            </ol>
            <p className="micro-note">Removed text may persist in encrypted database backups until they expire on our provider&rsquo;s schedule.</p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
