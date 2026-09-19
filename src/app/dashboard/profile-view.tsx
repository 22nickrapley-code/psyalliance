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
  return <span className={`toggle-badge ${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>;
}

export function ProfileView({
  data,
  tierBadge,
  relevantSpecialisms,
  actions,
}: {
  data: ProfileViewData;
  tierBadge?: React.ReactNode;
  relevantSpecialisms?: string[];
  actions?: React.ReactNode;
}) {
  const profession = professionFor(data.qualificationLevel);
  const relevantSet = new Set((relevantSpecialisms || []).map((s) => s.toLowerCase()));

  return (
    <div className="profile-view-card">
      <div className="profile-view-banner" />
      <div className="profile-view-header">
        <Avatar url={data.avatarUrl} name={data.fullName} size={88} />
        <div className="profile-view-heading">
          <h1>
            {data.credentialPrefix ? `${data.credentialPrefix} ` : ""}
            {data.fullName}
          </h1>
          <div className="profile-view-meta">
            {data.qualificationLevel}
            {data.city ? ` · ${data.city}` : ""}
            {data.state ? `, ${data.state}` : ""}
          </div>
          <div className="profile-view-badges">
            <span className={`tag${profession === "psychiatrist" ? " psychiatrist" : ""}`}>
              {professionLabel(profession)}
            </span>
            {tierBadge}
            {data.boardCertified && <span className="tag gold">Board certified</span>}
            {data.acceptingReferrals && <span className="tag">Accepting referrals</span>}
            {data.psypactParticipating && (
              <span className="tag" title="Holds PSYPACT Authority to Practice Interjurisdictional Telepsychology">
                PSYPACT
              </span>
            )}
          </div>
        </div>
        {actions && <div className="profile-view-actions">{actions}</div>}
      </div>

      <div style={{ padding: "0 1.75rem 1.75rem" }}>
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
              <dl>
                <dt>Incoming referrals</dt>
                <dd><ToggleBadge value={data.acceptingReferrals} /></dd>
                <dt>Giving supervision</dt>
                <dd><ToggleBadge value={data.openToGiveSupervision} /></dd>
                <dt>Receiving supervision</dt>
                <dd><ToggleBadge value={data.openToReceiveSupervision} /></dd>
                <dt>Group consultation</dt>
                <dd><ToggleBadge value={data.openToGroupConsultation} /></dd>
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
