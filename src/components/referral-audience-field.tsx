"use client";

import { useState } from "react";

// Sept 23 audit ("review recipients before send"): the audience select on
// the Referrals create form gave no indication of how many people a
// request would actually reach - "Verified network" and "Trusted
// colleagues only" looked like equally scoped choices even though one
// could be 200 people and the other could be zero. This shows the actual
// reach as soon as the requester picks an option, and requires an
// explicit acknowledgement before a network-wide broadcast can be posted.
// Trusted/Selected don't get the same gate: Trusted is already a bounded,
// named list, and Selected starts empty until the requester picks people
// after posting, so neither can be sent to more people than intended by
// surprise the way a network-wide broadcast can.
export default function ReferralAudienceField({
  trustedCount,
  networkCount,
}: {
  trustedCount: number;
  networkCount: number;
}) {
  const [audience, setAudience] = useState("wider_network");
  const [confirmed, setConfirmed] = useState(false);

  const preview: Record<string, string> = {
    wider_network: `This will be visible to everyone verified on PsyAlliance right now - about ${networkCount} clinician${networkCount === 1 ? "" : "s"}.`,
    trusted:
      trustedCount > 0
        ? `This will be visible only to your ${trustedCount} trusted colleague${trustedCount === 1 ? "" : "s"}.`
        : "You don't have any trusted colleagues yet, so nobody would see this. Add some on the Network page, or choose a different audience.",
    selected: "Nobody sees this until you post it - you'll then choose specific people from the matches list below.",
  };

  return (
    <>
      <div className="field">
        <label htmlFor="ref_audience">Who should see this?</label>
        <select
          id="ref_audience"
          name="audience_type"
          value={audience}
          onChange={(e) => {
            setAudience(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="wider_network">Verified network</option>
          <option value="trusted">Trusted colleagues only</option>
          <option value="selected">Selected clinicians (choose after posting)</option>
        </select>
      </div>
      <p className="muted" style={{ fontSize: "0.82rem", flexBasis: "100%", margin: "0.4rem 0 0" }}>
        {preview[audience]}
      </p>
      {audience === "wider_network" && (
        <label
          className="checkbox-row"
          style={{ flexBasis: "100%", marginTop: "0.4rem", fontWeight: 400, fontSize: "0.85rem" }}
        >
          <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I understand this will be visible to the entire verified network
        </label>
      )}
    </>
  );
}
