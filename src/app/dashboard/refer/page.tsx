import RequestsPage from "../requests/page";

// Interim (Stage 2): the Refer tab shows the existing referral screens
// until the four-step Refer flow replaces them in Stage 3.
export default async function ReferPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  return RequestsPage({ searchParams: Promise.resolve({ tab: "referrals", error }) });
}
