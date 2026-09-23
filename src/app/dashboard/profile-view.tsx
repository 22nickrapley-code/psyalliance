import Avatar from "./avatar";
import { professionFor, professionLabel } from "@/lib/profession";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Display labels for the read-only view - shorter than the instructive
// labels used on the edit form, since this is presentation, not a form.
const SECTION_LABELS: Record<string, string> = {
  treatment_specialism: "Treatment specialisms",
  treatment_modality: "Treatment modalities",
  insurance: "Insurance accepted",
  language: "Languages spoken",
  session_type: "Session types",
  age_group_specialism: "Client age groups",
  sexual_orientation_specialism: "Client populations",
};

// The order these sections appear in on the profile view, regardless of
// what order they came back from the database in.
const SECTION_ORDER = [
  "treatment_specialism",
  "treatment_modality",
  "session_type",
  "insurance",
  "age_group_specialism",
  "sexual_orientation_specialism",
  "language",
];

export type SpecialismValue = { value: string; rank: number | null };

export type ProfileViewData = {
  id: string;
  fullName: string;
  credentialPrefix: string | null;
  qualificationLevel: string;
  boardCertified: boolean;
  city: string | null;
  state: string | null;
  acceptingReferrals: boolean;
  // The confirmed source of truth for "accepting referrals" (Sept 23 audit
  // fix) - the tri-state from the Availability page plus the timestamp of
  // when it was last confirmed. `acceptingReferrals` above is kept as a
  // derived mirror of `referralAvailability === "yes"` for the few places
  // that still just need a plain boolean (e.g. /refer's simpler physician
  // portal); anything shown to a colleague deciding whether to send a
  // referral should read `referralAvailability`/`availabilityConfirmedAt`
  // instead, so an unconfirmed profile never displays a false "Yes."
  referralAvailability?: "yes" | "limited" | "no" | null;
  availabilityConfirmedAt?: string | null;
  psypactParticipating: boolean;
  avatarUrl: string | null;
  practiceWebsite: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  openToGroupConsultation: boolean;
  openToGiveSupervision: boolean;
  openToReceiveSupervision: boolean;
  availableDays?: Set<number> | null;
  specialismsByCategory: Record<string, SpecialismValue[]>;
};

function ToggleBadge({ value }: { value: boolean }) {
  return (
    <span className="oswitch-row">
      <span className={`oswitch-text ${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>
      <span className={`oswitch ${value ? "yes" : "no"}`} aria-hidden="true" />
    </span>
  );
}

// One-click version of the same control, used only on your own profile view -
// clicking the switch flips the field immediately via the server action
// passed in, no need to open Edit Profile just to change a yes/no.
function ToggleBadgeButton({
  field,
  value,
  onToggleOpenTo,
}: {
  field: string;
  value: boolean;
  onToggleOpenTo: (formData: FormData) => void;
}) {
  return (
    <form action={onToggleOpenTo}>
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="current" value={String(value)} />
      <button type="submit" className="oswitch-row" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} aria-pressed={value} title="Click to toggle">
        <span className={`oswitch-text ${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>
        <span className={`oswitch oswitch-btn ${value ? "yes" : "no"}`} />
      </button>
    </form>
  );
}

export function ProfileView({
  data,
  tierBadge,
  bannerTier,
  relevantSpecialisms,
  highlightValues,
  locationMatch,
  matchToggle,
  actions,
  sidebarExtra,
  belowHeader,
  onToggleOpenTo,
}: {
  data: ProfileViewData;
  tierBadge?: React.ReactNode;
  // Tints the banner gradient toward the connection-tier color (blue for
  // Partner, purple for Bench, orange for Recommended) so the relationship
  // is obvious from the banner itself, not just the small tag underneath.
  bannerTier?: "partner" | "trusted_colleague" | "bench" | "recommended" | "none";
  relevantSpecialisms?: string[];
  // Additional values (any specialism category, lower-cased match is
  // case-insensitive) to highlight as chips without adding them to the
  // "Recommended for you" banner sentence - used by the Match me / Match my
  // caseload toggle, which can span categories the banner text isn't
  // written to describe.
  highlightValues?: string[];
  // True when the viewer's own location (or the aggregate of their
  // caseload's locations, depending which toggle is active) overlaps this
  // person's city/state - highlights the location line to match the chip
  // highlighting on shared specialisms below.
  locationMatch?: boolean;
  // "Match me" / "Match my caseload" toggle control, rendered by the caller
  // (people/[id]/page.tsx) since it's just navigation between two query-
  // param states - kept out of this presentational component.
  matchToggle?: React.ReactNode;
  actions?: React.ReactNode;
  // Extra sidebar cards (Endorsements) rendered by the caller, appended
  // after the built-in Contact/Open-to/Availability cards.
  sidebarExtra?: React.ReactNode;
  // Extra content rendered directly under the header, above the relevance
  // banner - used for the "Assign to Patient" quick-assign panel.
  belowHeader?: React.ReactNode;
  // When set, this is the viewer's own profile: the four "Open to" badges
  // become one-click toggle buttons wired to this server action instead of
  // static yes/no text. Left unset (viewing someone else's profile) they
  // stay read-only.
  onToggleOpenTo?: (formData: FormData) => void;
}) {
  const profession = professionFor(data.qualificationLevel);
  const relevantSet = new Set(
    [...(relevantSpecialisms || []), ...(highlightValues || [])].map((s) => s.toLowerCase())
  );
  const hasLocation = !!(data.city || data.state);

  // Sept 23 audit fix: only ever assert "Accepting referrals" to someone
  // else when it's backed by a confirmed answer on the Availability page -
  // never the legacy boolean's silent default. An unconfirmed profile shows
  // no referral badge at all rather than a claim that might not be true.
  const referralsConfirmed = !!data.availabilityConfirmedAt;
  const acceptingReferralsConfirmedYes = referralsConfirmed && data.referralAvailability === "yes";
  const acceptingReferralsLimited = referralsConfirmed && data.referralAvailability === "limited";

  return (
    <div className="profile-view-card">
      <div className={`profile-view-banner${bannerTier && bannerTier !== "none" ? ` profile-view-banner-${bannerTier}` : ""}`}>
        <div className="profile-view-avatar-ring">
          <Avatar url={data.avatarUrl} name={data.fullName} size={92} />
        </div>
        <div className="profile-view-heading">
          <h1>
            {data.credentialPrefix ? `${data.credentialPrefix} ` : ""}
            {data.fullName}
          </h1>
          <div className="profile-view-role">
            {data.qualificationLevel}
          </div>
          {hasLocation && (
            <div className={`profile-view-location${locationMatch ? " match" : ""}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flex: "0 0 auto" }}>
                <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {data.city}
              {data.city && data.state ? ", " : ""}
              {data.state}
              {locationMatch && <span className="location-match-tag">Overlaps with you</span>}
            </div>
          )}
        </div>
        {matchToggle && <div className="profile-view-match-toggle">{matchToggle}</div>}
      </div>

      <div style={{ padding: "1rem 1.75rem 1.75rem" }}>
        <div className="profile-view-badges" style={{ marginBottom: "0.9rem" }}>
          <span className={`tag${profession === "psychiatrist" ? " psychiatrist" : ""}`}>
            {professionLabel(profession)}
          </span>
          {tierBadge}
          {data.boardCertified && <span className="tag gold">Board certified</span>}
          {acceptingReferralsConfirmedYes && <span className="tag">Accepting referrals</span>}
          {acceptingReferralsLimited && <span className="tag">Limited referrals</span>}
          {data.psypactParticipating && (
            <span className="tag" title="Holds PSYPACT Authority to Practice Interjurisdictional Telepsychology">
              PSYPACT
            </span>
          )}
        </div>

        {actions && <div className="profile-view-actions">{actions}</div>}

        {belowHeader}

        {relevantSpecialisms && relevantSpecialisms.length > 0 && (
          <div className="relevance-banner">
            Recommended for you: shares your {relevantSpecialisms.join(", ")} specialism
            {relevantSpecialisms.length > 1 ? "s" : ""}.
          </div>
        )}

        <div className="profile-view-body">
          <div className="profile-view-sidebar">
            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>Contact &amp; practice</h3>
              <dl>
                {data.practiceWebsite && (
                  <>
                    <dt>Website</dt>
                    <dd>
                      <a href={data.practiceWebsite} target="_blank" rel="noreferrer">
                        {data.practiceWebsite.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </>
                )}
                {data.contactEmail && (
                  <>
                    <dt>Email</dt>
                    <dd>{data.contactEmail}</dd>
                  </>
                )}
                {data.contactPhone && (
                  <>
                    <dt>Phone</dt>
                    <dd>{data.contactPhone}</dd>
                  </>
                )}
                {!data.practiceWebsite && !data.contactEmail && !data.contactPhone && (
                  <dd className="muted">No contact details shared.</dd>
                )}
              </dl>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>Open to</h3>
              {onToggleOpenTo && (
                <p className="muted" style={{ marginTop: "-0.3rem", fontSize: "0.78rem" }}>
                  Flip a switch to change it instantly.
                </p>
              )}
              <dl>
                <dt>Incoming referrals</dt>
                <dd>
                  {referralsConfirmed ? (
                    <span className={`oswitch-text ${acceptingReferralsConfirmedYes ? "yes" : "no"}`}>
                      {data.referralAvailability === "yes" ? "Yes" : data.referralAvailability === "limited" ? "Limited" : "No"}
                    </span>
                  ) : (
                    <span className="oswitch-text no" title="Never confirmed on the Availability page">
                      Not confirmed
                    </span>
                  )}
                  {onToggleOpenTo && (
                    <>
                      {" "}
                      <a href="/dashboard/availability" style={{ fontSize: "0.8rem" }}>
                        (change)
                      </a>
                    </>
                  )}
                </dd>
                <dt>Giving supervision</dt>
                <dd>
                  {onToggleOpenTo ? (
                    <ToggleBadgeButton field="open_to_give_supervision" value={data.openToGiveSupervision} onToggleOpenTo={onToggleOpenTo} />
                  ) : (
                    <ToggleBadge value={data.openToGiveSupervision} />
                  )}
                </dd>
                <dt>Receiving supervision</dt>
                <dd>
                  {onToggleOpenTo ? (
                    <ToggleBadgeButton field="open_to_receive_supervision" value={data.openToReceiveSupervision} onToggleOpenTo={onToggleOpenTo} />
                  ) : (
                    <ToggleBadge value={data.openToReceiveSupervision} />
                  )}
                </dd>
                <dt>Group consultation</dt>
                <dd>
                  {onToggleOpenTo ? (
                    <ToggleBadgeButton field="open_to_group_consultation" value={data.openToGroupConsultation} onToggleOpenTo={onToggleOpenTo} />
                  ) : (
                    <ToggleBadge value={data.openToGroupConsultation} />
                  )}
                </dd>
              </dl>
            </div>

            {data.availableDays && (
              <div className="card">
                <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>Weekly availability</h3>
                <div className="chip-list">
                  {DAY_LABELS.map((label, i) =>
                    data.availableDays!.has(i) ? (
                      <span key={i} className="chip">{label}</span>
                    ) : null
                  )}
                  {data.availableDays.size === 0 && <span className="muted">Not specified.</span>}
                </div>
              </div>
            )}

            {sidebarExtra}
          </div>

          <div>
            {SECTION_ORDER.filter((cat) => (data.specialismsByCategory[cat] || []).length > 0).map((cat) => {
              const values = [...(data.specialismsByCategory[cat] || [])].sort((a, b) => {
                if (a.rank == null && b.rank == null) return 0;
                if (a.rank == null) return 1;
                if (b.rank == null) return -1;
                return a.rank - b.rank;
              });
              return (
                <div className="profile-view-section" key={cat}>
                  <h3>{SECTION_LABELS[cat] || cat}</h3>
                  <div className="chip-list">
                    {values.map((v) => (
                      <span
                        key={v.value}
                        className={`chip${relevantSet.has(v.value.toLowerCase()) ? " chip-match" : ""}`}
                      >
                        {v.value}
                        {v.rank ? ` (#${v.rank})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {SECTION_ORDER.every((cat) => (data.specialismsByCategory[cat] || []).length === 0) && (
              <p className="muted">No specialisms or preferences listed yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
