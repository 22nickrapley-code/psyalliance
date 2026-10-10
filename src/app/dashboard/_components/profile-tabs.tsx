// Profile holds everything about your own practice in one place: the
// profile colleagues see, your availability, your credentials and your
// continuity plan (Nick, 10 Oct: fewer items in the menu).

const TABS: [string, string, string][] = [
  ["profile", "Profile", "/dashboard/profile"],
  ["availability", "Availability", "/dashboard/availability"],
  ["credentials", "Credentials", "/dashboard/credentials"],
  ["continuity", "Continuity plan", "/dashboard/continuity"],
];

export function ProfileTabs({ active, back }: { active: "profile" | "availability" | "credentials" | "continuity"; back?: string | null }) {
  // Moving between tabs keeps the way back to where you started.
  const keep = back && !back.startsWith("/dashboard/profile") ? `?back=${encodeURIComponent(back)}` : "";
  return (
    <nav className="tabs profile-tabs" aria-label="Your practice">
      {TABS.map(([k, label, href]) => (
        <a key={k} className={`tab${k === active ? " active" : ""}`} href={`${href}${keep}`} aria-current={k === active ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
