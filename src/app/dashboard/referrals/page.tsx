import { redirect } from "next/navigation";

// The former bulletin-board workflow now lives in Requests; its legacy
// write actions do not have the new audience and lifecycle safeguards.
export default function LegacyReferralsPage() {
  redirect("/dashboard/requests?tab=referrals");
}
