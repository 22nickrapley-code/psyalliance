type AvatarTier = "partner" | "bench" | "recommended" | "none" | null | undefined;

// Small shared avatar chip for directory-style listing rows (Network,
// Referrals suggestions, Supervision, Messages, Town Hall, Overview) - a
// resolved signed URL when the person has uploaded a photo, initials
// otherwise. Kept tiny and presentational; pages resolve avatar_path ->
// signed URL themselves (batched via resolveAvatarUrls) and just pass the
// result in. Pass `ring` (the viewer's connection tier to this person) to
// wrap the circle in the same colored ring used everywhere else on the
// site for Partner/Bench/Recommended - this is the ONE place that combines
// "photo or initials" with "colored by relationship" so every call site
// gets both automatically instead of hand-rolling the ring wrapper.
export default function Avatar({
  url,
  name,
  size = 32,
  ring,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
  ring?: AvatarTier;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  const circle = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flex: "0 0 auto",
        border: "1px solid var(--border)",
        display: "block",
      }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--gold)",
        color: "#2a2313",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 700,
        flex: "0 0 auto",
      }}
    >
      {initials}
    </div>
  );

  if (ring && ring !== "none") {
    return <span className={`tier-ring tier-ring-${ring}`} style={{ flex: "0 0 auto" }}>{circle}</span>;
  }
  return circle;
}
