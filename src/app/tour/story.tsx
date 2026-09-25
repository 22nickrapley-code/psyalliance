// The one fictional story the tour and the sandbox share. Keep the facts
// here identical to private.seed_demo_viewer: Alex Rivers, PsyD, a
// clinical psychologist in Brooklyn, licensed in New York and New Jersey,
// planning six weeks of parental leave that starts on the Monday after
// the week four weeks from today.

export const AV = {
  alex: "/demo-avatars/f07.svg",
  maya: "/demo-avatars/f04.svg",
  eli: "/demo-avatars/m10.svg",
  imani: "/demo-avatars/f05.svg",
  samuel: "/demo-avatars/m11.svg",
  lena: "/demo-avatars/f06.svg",
  noah: "/demo-avatars/m21.svg",
};

// Same rule as the seed: date_trunc('week', today + 28) + 7 days, for six weeks.
export function leaveDates(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 28));
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7);
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 41);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const short = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const long = (x: Date) => x.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return { start: iso(monday), end: iso(end), range: `${short(monday)} to ${short(end)}`, startLong: long(monday) };
}

export const CHAPTERS = [
  { key: "meet", title: "Meet Alex's practice", blurb: "The profile, home screen, circle, messages and Library. A minute or two." },
  { key: "refer", title: "Refer and consult", blurb: "Find the right colleague for a new enquiry and ask the circle a question." },
  { key: "cover", title: "Six weeks away, covered", blurb: "Plan parental leave case by case, from both sides of the request." },
] as const;
export type ChapterKey = (typeof CHAPTERS)[number]["key"];

export function AlexCard({ compact }: { compact?: boolean }) {
  const leave = leaveDates();
  return (
    <div className={`story-alex${compact ? " compact" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={AV.alex} alt="" />
      <div>
        <div className="eyebrow">You&rsquo;ll be</div>
        <h3>Alex Rivers, PsyD</h3>
        <p>Clinical psychologist in Brooklyn, New York</p>
        {!compact && (
          <ul className="story-facts">
            <li>Licensed in New York and New Jersey, PSYPACT telehealth</li>
            <li>Adults and adolescents: anxiety, trauma and OCD</li>
            <li>Parental leave for six weeks from {leave.startLong}</li>
            <li>1,200 fictional colleagues across NY, NJ, MA, CT, RI and VT</li>
          </ul>
        )}
      </div>
    </div>
  );
}
