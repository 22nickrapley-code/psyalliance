// Small shared avatar chip for directory-style listing rows (Network,
// Referrals suggestions, Supervision) - a resolved signed URL when the
// person has uploaded a photo, initials otherwise. Kept tiny and
// presentational; pages resolve avatar_path -> signed URL themselves
// (batched via resolveAvatarUrls) and just pass the result in.
export default function Avatar({
  url,
  name,
  size = 32,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  if (url) {
    return (
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
        }}
      />
    );
  }

  return (
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
}
