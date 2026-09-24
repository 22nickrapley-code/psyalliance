import { redirect } from "next/navigation";

// The old combined Requests hub is replaced by Cover and Refer (Product
// Spec v1). Kept as a redirect so older notification links still land in
// the right place.
export default async function RequestsRedirect(props: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await props.searchParams;
  redirect(tab === "referrals" ? "/dashboard/refer" : "/dashboard/cover");
}
