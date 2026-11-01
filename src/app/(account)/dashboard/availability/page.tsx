import { redirect } from "next/navigation";

// Availability lives in the workspace: the Hub's availability window (decision D-05). Earlier links land there,
// and closing the window takes the member back to the page they came from (Nick, 1 Nov).
export const dynamic = "force-dynamic";

export default async function AvailabilityMovedPage(props: { searchParams: Promise<{ back?: string }> }) {
  const { back } = await props.searchParams;
  const safe = typeof back === "string" && /^\/dashboard(\/[a-z0-9\-/]*)?(\?[a-z0-9=&%\-_.]*)?$/i.test(back) ? back : "";
  redirect(`/dashboard?availability=1${safe ? `&back=${encodeURIComponent(safe)}` : ""}`);
}
