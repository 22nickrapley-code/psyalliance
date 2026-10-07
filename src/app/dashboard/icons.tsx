// One line-icon family for navigation: 24px grid, 1.7 stroke, round caps.
// Replaces typographic glyphs, which phones render as coloured emoji.

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  cover: (
    <>
      <path d="M12 3.5 19 6v5.6c0 4.2-2.9 7.5-7 8.9-4.1-1.4-7-4.7-7-8.9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  refer: (
    <>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="12" r="7.8" />
    </>
  ),
  consult: (
    <>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16A2.5 2.5 0 0 1 5 13.5z" />
      <path d="M9 9h6M9 12h4" />
    </>
  ),
  messages: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" />
    </>
  ),
  availability: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  credentials: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6.5 15.5c.6-1.3 1.4-2 2.5-2s1.9.7 2.5 2M14 10h3.5M14 13h3" />
    </>
  ),
  library: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13.5H6.5A1.5 1.5 0 0 0 5 19z" />
      <path d="M5 19a1.5 1.5 0 0 0 1.5 1.5H19M9 8h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </>
  ),
  overview: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  pass: (
    <>
      <path d="M4 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1z" transform="translate(0 1.5)" />
      <path d="M14 6v11" strokeDasharray="1.5 2" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.3 2.3 4.7-4.6" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 18.5c.9-2.7 2.9-4 5.5-4s4.6 1.3 5.5 4" />
      <path d="M15.5 6.3a3 3 0 0 1 0 5.4M17 14.7c1.6.5 2.8 1.8 3.5 3.8" />
    </>
  ),
  flag: (
    <>
      <path d="M6 20V4.5" />
      <path d="M6 5h11l-2 3.5 2 3.5H6" />
    </>
  ),
  pulse: <path d="M3.5 12h3.5l2-5 4 10 2-5h5.5" />,
  continuity: (
    <>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z" />
      <path d="M14 3.5V8h4" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  overflow: (
    <>
      <path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4H12" />
      <path d="M4 20h9" />
      <path d="M15 8h5.5M18 5l3 3-3 3" />
      <path d="M9 9.5h2M9 13h4M9 16.5h3" />
    </>
  ),
};

export function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name] || PATHS.overview}
    </svg>
  );
}

// Older screens pass a typographic symbol; draw the matching icon instead,
// because phones render several of these characters as colour emoji.
const SYMBOL_ICON: Record<string, string> = {
  "✉": "messages",
  "✳": "consult",
  "◎": "network",
  "✓": "check",
  "▤": "library",
  "⚑": "flag",
  "↗": "pulse",
  "◇": "cover",
  "⌂": "home",
  "◷": "availability",
  "◈": "credentials",
  "☷": "members",
  "+": "overview",
};

export function Glyph({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const name = SYMBOL_ICON[symbol];
  return name ? <NavIcon name={name} size={size} /> : <>{symbol}</>;
}
