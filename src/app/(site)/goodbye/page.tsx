import Link from "next/link";

export const metadata = { title: "Account deleted" };

// Where a member lands after deleting their account.
export default function Goodbye() {
  return (
    <main className="public-simple">
      <section className="card roomy" style={{ maxWidth: 560, margin: "64px auto" }}>
        <div className="eyebrow">Account deleted</div>
        <h1 className="serif-title" style={{ fontSize: 32 }}>Your account has been deleted.</h1>
        <p>Your profile and practice details are gone, and you&rsquo;ve been signed out. If you change your mind, you&rsquo;re welcome to create a new account any time.</p>
        <p className="row wrap" style={{ gap: 10 }}>
          <Link className="btn" href="/">PsyAlliance home</Link>
        </p>
      </section>
    </main>
  );
}
