// Small "?" icon with a pure-CSS hover/focus tooltip - no client JS needed,
// works in a server component. Used on the Income & Revenue stat labels so
// each figure (gross, net, overhead, true net) explains itself on hover,
// per Nick's request ("what's the difference between monthly true net and
// monthly net?").
export default function InfoTooltip({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <span className={`info-tooltip${dark ? " info-tooltip-dark" : ""}`} tabIndex={0}>
      <span className="info-tooltip-icon" aria-hidden="true">?</span>
      <span className="info-tooltip-bubble">{text}</span>
    </span>
  );
}
