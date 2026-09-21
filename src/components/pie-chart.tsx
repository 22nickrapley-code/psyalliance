"use client";

// Small dependency-free SVG pie chart. No charting library is installed in
// this project and pulling one in just for this would be overkill for a
// single interactive chart - plain SVG arc math keeps it edge-runtime-safe
// for the Cloudflare Workers build too.
export type PieSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

const SIZE = 220;
const R = 100;
const CX = SIZE / 2;
const CY = SIZE / 2;

function arcPoint(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
}

export default function PieChart({
  slices,
  selectedKey,
  onSelect,
}: {
  slices: PieSlice[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className="muted">No data to chart yet.</p>;
  }

  let cumulative = 0;
  const paths = slices.map((s) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += s.value;
    const endAngle = (cumulative / total) * 360;
    const isFullCircle = endAngle - startAngle >= 359.999;
    const [x1, y1] = arcPoint(startAngle);
    const [x2, y2] = arcPoint(endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const d = isFullCircle
      ? `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX - 0.01} ${CY - R} Z`
      : `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...s, d, pct: (s.value / total) * 100 };
  });

  return (
    <div className="pie-chart-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Treatment area distribution">
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            fill={p.color}
            className={`pie-slice${selectedKey === p.key ? " pie-slice-selected" : ""}`}
            onClick={() => onSelect(p.key)}
          >
            <title>{`${p.label}: ${p.value} (${p.pct.toFixed(0)}%)`}</title>
          </path>
        ))}
      </svg>
      <ul className="pie-legend">
        {paths.map((p) => (
          <li
            key={p.key}
            className={selectedKey === p.key ? "pie-legend-selected" : undefined}
            onClick={() => onSelect(p.key)}
          >
            <span className="pie-legend-swatch" style={{ background: p.color }} />
            {p.label} <span className="muted">({p.value})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
