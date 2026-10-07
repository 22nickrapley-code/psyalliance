// PSYPACT member states (psypact.gov, March 2026). New York and
// Massachusetts are not members. Mirrors private.psypact_states() in the
// database (migration 0097); review both before each release.
export const PSYPACT_STATES = new Set([
  "AL", "AZ", "AR", "CO", "CT", "DE", "DC", "FL", "GA", "ID", "IL", "IN", "KS", "KY", "ME", "MD", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NC", "ND", "OH", "OK", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

// PSYPACT covers psychologists (not psychiatrists) licensed in a member state.
export const psypactEligible = (homeState: string | null | undefined, qualification: string | null | undefined) =>
  !!homeState && PSYPACT_STATES.has(homeState.toUpperCase()) && !["MD", "DO"].includes(String(qualification || "").toUpperCase());

// Telehealth across state lines: only into a member state, by a
// participating psychologist whose home state is a member.
export const psypactCovers = (clientState: string | null | undefined, homeState: string | null | undefined, qualification: string | null | undefined, participating: boolean) =>
  participating && !!clientState && PSYPACT_STATES.has(clientState.toUpperCase()) && psypactEligible(homeState, qualification);
