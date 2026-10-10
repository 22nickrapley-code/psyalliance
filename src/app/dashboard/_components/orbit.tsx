// The member's circle drawn as rings around them: trusted colleagues
// closest, people they've worked with next, and (on the large Network
// picture) colleagues PsyAlliance suggests on the outer ring.

export type CircleNode = { id: string; name: string; kind: "trusted" | "worked" | "suggested" | "saved"; avatarUrl: string | null };

const initials = (name: string) =>
  name
    .replace(/,.*$/, "")
    .replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function Orbit({ nodes, me, size = 200 }: { nodes: CircleNode[]; me?: { initials: string; avatarUrl: string | null }; size?: number }) {
  const big = size > 240;
  const inner = nodes.filter((n) => n.kind === "trusted").slice(0, big ? 10 : 8);
  const middle = nodes.filter((n) => n.kind === "worked" || n.kind === "saved").slice(0, big ? 12 : 10);
  const outer = big ? nodes.filter((n) => n.kind === "suggested").slice(0, 14) : [];
  const c = size / 2;
  const rInner = size * (big ? 0.2 : 0.27);
  const rMiddle = size * (big ? 0.32 : 0.44);
  const rOuter = size * 0.44;
  const place = (list: CircleNode[], r: number, offset: number) =>
    list.map((n, i) => {
      const a = offset + (i / Math.max(list.length, 1)) * Math.PI * 2;
      return { n, left: Math.round(c + r * Math.cos(a)), top: Math.round(c + r * Math.sin(a)) };
    });
  const ring = (r: number, cls: string) => <span className={`ring ${cls}`} style={{ left: c - r, top: c - r, width: r * 2, height: r * 2 }} />;
  return (
    <div className={`orbit${big ? " orbit-big" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      {big && ring(rOuter, "ring-suggested")}
      {ring(rMiddle, "ring-outer")}
      {ring(rInner, "ring-inner")}
      <span className="me">
        {me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" />
        ) : (
          me?.initials || "You"
        )}
      </span>
      {[...place(inner, rInner, -Math.PI / 2), ...place(middle, rMiddle, -Math.PI / 3), ...place(outer, rOuter, -Math.PI / 5)].map(({ n, left, top }) => (
        <a key={`${n.kind}-${n.id}`} className={`node ${n.kind}`} style={{ left, top }} href={`/dashboard/people/${n.id}`} title={n.name} tabIndex={-1}>
          {n.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.avatarUrl} alt="" />
          ) : (
            initials(n.name)
          )}
        </a>
      ))}
    </div>
  );
}
