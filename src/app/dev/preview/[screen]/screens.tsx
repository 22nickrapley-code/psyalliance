import type { ReactNode } from "react";

// Fixture renderers for the dev preview, one per screen. Each rebuilt
// screen exports a presentational view that takes plain data; the preview
// feeds it illustrative fixtures.
export const previewScreens: Record<string, () => ReactNode> = {
  shell: () => (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Stage 2 preview</div>
          <h1>The new workspace shell.</h1>
          <p>Navigation, top bar and design system from the premium concept.</p>
        </div>
      </div>
      <div className="split">
        <section className="card">
          <div className="card-title"><h3>A card</h3><span className="status">Open</span></div>
          <p>Body copy in the muted tone.</p>
          <a className="btn" href="#">Primary action</a> <a className="btn secondary" href="#">Secondary</a>
        </section>
        <aside className="card tint"><div className="eyebrow">Aside</div><h3>Quiet panel</h3><p className="small">Supporting detail.</p></aside>
      </div>
    </>
  ),
};
