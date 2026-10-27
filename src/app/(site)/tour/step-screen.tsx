import { JOIN_HREF } from "@/lib/env";
import { sceneSrc, type Journey } from "@/tour/journeys";
import { StepView } from "./step-frame";

// One screen of a demo, to click through yourself.
export function DemoStepScreen({ demo, index: i }: { demo: Journey; index: number }) {
  const s = demo.steps[i];
  const base = `/tour/${demo.key}`;
  // Step one goes back to the video of this demo.
  const home = demo.key === "overview" ? "/tour" : base;
  const prev = i === 0 ? home : `${base}/${demo.steps[i - 1].slug}`;
  const last = i === demo.steps.length - 1;
  const next = last ? `${base}/done` : `${base}/${demo.steps[i + 1].slug}`;
  return (
    <StepView
      src={sceneSrc(demo.key, s.slug, s.scene)}
      demoTitle={demo.title}
      title={s.title}
      what={s.what}
      focus={s.focus}
      focusIndex={s.focusIndex}
      focusNote={s.focusNote}
      index={i}
      total={demo.steps.length}
      last={last}
      prev={prev}
      next={next}
      home={home}
      homeLabel={demo.key === "overview" ? "All demos" : "This demo’s video"}
      joinHref={JOIN_HREF}
      dots={demo.steps.map((x) => ({ slug: x.slug, title: x.title, href: `${base}/${x.slug}` }))}
      isPage={s.scene.kind === "page"}
    />
  );
}
