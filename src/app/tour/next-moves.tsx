import { JOIN_HREF } from "@/lib/env";

// The way forward at the end of a demo: one door in, and the Library for
// anyone not ready yet. A sandbox comes with every account.
export function NextMoves() {
  return (
    <div className="next-moves two">
      <section className="card">
        <div className="eyebrow">Founding members never pay</div>
        <h3>Create your account</h3>
        <p className="small">
          For doctoral psychologists and psychiatrists. While a person checks your license, you can try everything in a sandbox with fictional colleagues
          and use the Practice Library.
        </p>
        <a className="btn" href={JOIN_HREF}>Create your account</a>
      </section>
      <section className="card">
        <div className="eyebrow">Not ready yet?</div>
        <h3>Browse the Practice Library</h3>
        <p className="small">
          Twenty templates for independent practice, from a professional will to a reciprocal cover agreement. Each shows whether it has been independently
          reviewed.
        </p>
        <a className="btn secondary" href={JOIN_HREF.replace("/auth/sign-up", "/library")}>Browse the Library</a>
      </section>
    </div>
  );
}
