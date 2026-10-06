// The member's circle drawn as rings around them: trusted colleagues
// closest, then people they've worked with and saved on the outer ring.

export type CircleNode = { id: string; name: string; kind: "trusted" | "worked" | "saved"; avatarUrl: string | null };

const initials = (name: string) =>
  name
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function Orbit({ nodes, me }: { nodes: CircleNode[]; me?: { initials: string; avatarUrl: string | null } }) {
  const inner = nodes.filter((n) => n.kind === "trusted").slice(0, 8);
  const outer = nodes.filter((n) => n.kind !== "trusted").slice(0, 10);
  const place = (list: CircleNode[], r: number, offset: number) =>
    list.map((n, i) => {
      const a = offset + (i / Math.max(list.length, 1)) * Math.PI * 2;
      return { n, left: Math.round(100 + r * Math.cos(a)), top: Math.round(100 + r * Math.sin(a)) };
    });
  return (
    <div className="orbit" aria-hidden="true">
      <span className="ring ring-inner" />
      <span className="ring ring-outer" />
      <span className="me">
        {me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" />
        ) : (
          me?.initials || "You"
        )}
      </span>
      {[...place(inner, 54, -Math.PI / 2), ...place(outer, 88, -Math.PI / 3)].map(({ n, left, top }) => (
        <a key={n.id} className={`node ${n.kind}`} style={{ left, top }} href={`/dashboard/people/${n.id}`} title={n.name} tabIndex={-1}>
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
