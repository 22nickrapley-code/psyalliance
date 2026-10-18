import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";

export const metadata = { title: "Privacy policy" };

const UPDATED = "October 18, 2026";
const CONTACT = "hello@psyalliance.org";

// PsyAlliance's privacy policy (Nick, 18 Oct: a full policy on the site,
// which he takes to legal review before launch). Every statement here is
// meant to match what the product does; change both together.
function Mail() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

export default function PrivacyPage() {
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner policy" style={{ maxWidth: 780 }}>
            <div className="section-intro">
              <div className="eyebrow">Privacy policy</div>
              <h2>How PsyAlliance handles information.</h2>
              <p>
                Last updated {UPDATED}. This policy explains what information PsyAlliance collects, how we use it, who can see it and the choices you have. It
                covers psyalliance.org, the PsyAlliance sandbox at sandbox.psyalliance.org and the emails we send. Questions: <Mail />.
              </p>
            </div>

            <h3>The short version</h3>
            <ul className="rules" style={{ marginBottom: 36 }}>
              <li><b>Needs, not people</b>Clients are described by need. We flag dates, contact details and record numbers before anything is sent, and remove anything identifying that&rsquo;s reported.</li>
              <li><b>Verified means reviewed</b>Listing and requests require a reviewed identity, degree and in-date license.</li>
              <li><b>Facts, not judgments</b>Profiles show facts on file with dates. Whether a colleague suits a client is your professional call.</li>
              <li><b>Nothing sends without review</b>Every request and post shows exactly who will see it before you confirm.</li>
              <li><b>Private by default</b>Who you exclude or block, and how you rate a collaboration, is never visible to them.</li>
              <li><b>Never sold, never advertised to</b>Your data isn&rsquo;t sold, rented or used for advertising, and we use no advertising or analytics trackers.</li>
            </ul>

            <h3>1. Who we are</h3>
            <p>
              PsyAlliance is a closed professional network for licensed doctoral psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) in private practice in
              the United States. PsyAlliance is responsible for the information described in this policy. You can reach us about privacy at <Mail />.
            </p>

            <h3>2. Information we collect</h3>
            <p><b>Information you give us.</b></p>
            <ul className="policy-list">
              <li><b>Your account:</b> your name and email address, and a password, which is stored only as a secure hash by our sign-in provider. We never see it.</li>
              <li>
                <b>Your professional profile:</b> title and degree, practice city and state, specialties, approaches, the ages and settings you work with,
                insurance, languages, a short bio, a photo, your website, pronouns, and the contact email and phone number you choose to add.
              </li>
              <li>
                <b>Your credentials:</b> the states you&rsquo;re licensed in, license numbers and expiry dates, and where you provide them your NPI, CAQH and
                malpractice details, along with our notes from reviewing them.
              </li>
              <li><b>Your availability:</b> whether you&rsquo;re taking referrals, cover and consult questions, and when you last confirmed it.</li>
              <li>
                <b>What you do in PsyAlliance:</b> referrals, cover plans and requests, consult questions and replies, messages and reactions, the colleagues you
                add as trusted, collaboration ratings, blocks and exclusions, reports you make, and your continuity plan.
              </li>
              <li><b>Invitations:</b> when you invite a colleague, the email address, phone number or profile link you enter for them, and their name if you add it.</li>
              <li><b>Practice Library requests:</b> on the public Library, your name, email address, role and state, the template you asked about and the page you came from.</li>
              <li><b>Messages to us:</b> anything you send when you contact us.</li>
            </ul>
            <p><b>Information collected automatically.</b></p>
            <ul className="policy-list">
              <li>
                <b>Sign-in and security:</b> cookies that keep you signed in, and technical logs kept by our hosting and database providers (such as IP address,
                browser type, the pages requested, times and errors), used for security and fixing problems.
              </li>
              <li><b>Activity:</b> when you were last active, which helps keep suggestions and availability current.</li>
            </ul>
            <p><b>Information from others.</b> Colleagues may refer clients to you, ask you to cover, add you as a trusted colleague or invite you. To verify a license, we check it against the relevant state board&rsquo;s public records.</p>

            <h3>3. Client information</h3>
            <p>
              PsyAlliance is designed so client identities never enter it. Cover plans, referrals and consults describe needs, not people. Before anything is sent,
              we flag dates, phone numbers, email and street addresses and record numbers. We can&rsquo;t reliably recognize names, so please leave names and unusual
              combinations of details out. The clinical handoff happens outside PsyAlliance, through your own secure channel, once a colleague agrees. Email
              notifications never include what you wrote.
            </p>
            <p>
              PsyAlliance is not designed to receive protected health information, and we don&rsquo;t enter into business associate agreements. Please don&rsquo;t
              enter it.
            </p>
            <p><b>If client information is shared by mistake:</b></p>
            <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
              <li>Remove it yourself if you can: you can remove your own messages at any time.</li>
              <li>Otherwise use <b>Report</b> on the post, reply or message and choose &ldquo;It identifies a client&rdquo;. Don&rsquo;t repeat the details in the report.</li>
              <li>An admin reviews it as a priority and replaces the text everywhere it appears in PsyAlliance. We log that it happened, without keeping the removed words.</li>
              <li>We tell you when it&rsquo;s done. Whether the disclosure needs further action under your own professional or legal obligations is your call; we&rsquo;ll give you the facts you need.</li>
            </ol>

            <h3>4. How we use information</h3>
            <ul className="policy-list">
              <li>To create and run your account, and to verify your identity, degree and licenses.</li>
              <li>
                To connect you with other verified clinicians: listing you, suggesting colleagues and matching referrals and cover. Your own reactions to
                colleagues&rsquo; messages and the consult replies you mark useful gently adjust your own suggestions; no one else sees them or is affected.
              </li>
              <li>To send you notifications and service emails about your account and activity.</li>
              <li>To keep PsyAlliance safe: preventing misuse, reviewing reports and removing client information.</li>
              <li>To answer your questions and give support.</li>
              <li>To understand how PsyAlliance is used, in aggregate, and improve it.</li>
              <li>To meet legal obligations and enforce our <a href="/terms">Terms</a>.</li>
            </ul>
            <p>
              <b>Profile import.</b> If you choose to import your profile from text you paste, that text is sent to our AI provider, Anthropic, to fill in the
              form, and isn&rsquo;t kept by us unless you save your profile. You can always fill in the form yourself instead.
            </p>

            <h3>5. Who can see your information</h3>
            <ul className="policy-list">
              <li>
                <b>Other verified members</b> see your professional profile: name, degree, practice location, specialties and the other practice details you
                add, your availability, and the states where your license is reviewed. Accounts that aren&rsquo;t verified yet can&rsquo;t see other members.
              </li>
              <li>
                <b>Only you and PsyAlliance admins</b> see your license numbers, NPI, CAQH and malpractice details, and your contact email and phone unless
                you choose to share them with a colleague.
              </li>
              <li>
                <b>The people you choose</b> see your requests, consult questions and messages: each shows exactly who receives it before you send it.
                Conversations are visible to the people in them.
              </li>
              <li>
                <b>Only you</b> see your collaboration ratings, the people you block or exclude, and how your reactions and useful marks affect your
                suggestions.
              </li>
              <li><b>PsyAlliance admins</b> can see account information when needed to verify credentials, review reports, keep the service safe and give support.</li>
            </ul>

            <h3>6. Service providers</h3>
            <p>We use a small number of providers to run PsyAlliance. They process information only to provide their service to us:</p>
            <ul className="policy-list">
              <li><b>Supabase:</b> our database, sign-in and file storage.</li>
              <li><b>Cloudflare:</b> hosting, network security, and storage for our encrypted weekly backups.</li>
              <li><b>Resend:</b> delivery of our emails.</li>
              <li><b>Anthropic:</b> only for the optional profile import described above.</li>
              <li><b>GitHub:</b> runs our weekly backup job; backup data passes through it while the job runs.</li>
            </ul>
            <p>
              We don&rsquo;t sell or rent personal information, and we don&rsquo;t share it for advertising. We may disclose information if the law requires it, to
              protect the rights and safety of our members or others, or as part of a merger or sale of PsyAlliance, in which case this policy continues to apply.
            </p>

            <h3>7. Cookies and browser storage</h3>
            <p>
              We use only the cookies PsyAlliance needs to work: keeping you signed in, keeping a sandbox session open, and remembering a menu choice such as
              hiding Demos. Your browser also stores small conveniences, such as tips you&rsquo;ve dismissed. We don&rsquo;t use advertising or analytics cookies.
            </p>

            <h3>8. How long we keep information</h3>
            <ul className="policy-list">
              <li>We keep your account information while your account is open.</li>
              <li>
                When you delete your account (Profile, then Delete account), your profile and everything that belongs to it are deleted at once, including the
                messages you wrote and the files you uploaded. Requests other members made, such as a referral they sent you, stay theirs.
              </li>
              <li>
                We keep encrypted weekly backups for 12 weeks, so deleted information can remain in a backup until it ages out. Backups are used only to
                restore the service.
              </li>
              <li>Practice Library requests are kept until you ask us to remove them.</li>
              <li>Sandbox accounts and everything in them are fictional and end on their own.</li>
              <li>Technical logs are kept by our providers for a limited time for security and troubleshooting.</li>
            </ul>

            <h3>9. Security</h3>
            <p>
              Information is encrypted in transit and at rest by our providers. Access inside the database is limited by rules that check who is asking, so
              members see only what they&rsquo;re allowed to, and admin access is limited to the people who need it. No system is perfectly secure; if you think
              something is wrong, tell us at <Mail />.
            </p>

            <h3>10. Your choices and rights</h3>
            <ul className="policy-list">
              <li>You can see and change your profile, availability and credentials at any time.</li>
              <li>You can download a copy of your information from Settings.</li>
              <li>You can delete your account from Profile.</li>
              <li>You can block or exclude colleagues, and set your availability, including consult, to Not now.</li>
            </ul>
            <p>
              Depending on where you live, you may have rights to know what we hold about you, to get a copy, to correct or delete it, and to object to or limit
              some uses. We don&rsquo;t sell personal information or use it for targeted advertising. To make a request, email <Mail /> from the address on your
              account. We&rsquo;ll confirm it&rsquo;s you before acting, answer within the time the law allows, and won&rsquo;t treat you differently for asking.
              If we decline a request, you can ask us to reconsider.
            </p>

            <h3>11. Children</h3>
            <p>PsyAlliance is for licensed professionals. It isn&rsquo;t meant for anyone under 18, and we don&rsquo;t knowingly collect information about children.</p>

            <h3>12. Where information is processed</h3>
            <p>PsyAlliance is run from the United States, and your information is stored and processed in the United States by us and our providers.</p>

            <h3>13. Changes to this policy</h3>
            <p>
              We&rsquo;ll post any change here with a new date. If a change is significant, we&rsquo;ll tell members in PsyAlliance or by email before it takes
              effect.
            </p>

            <h3>14. Contact</h3>
            <p>
              Questions or requests about privacy: <Mail />.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
