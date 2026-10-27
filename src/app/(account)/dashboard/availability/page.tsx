import { redirect } from "next/navigation";

// Availability now lives in the workspace: the Hub's availability window (decision D-05). Earlier links land there.
export const dynamic = "force-dynamic";

export default function AvailabilityMovedPage() {
  redirect("/dashboard?availability=1");
}
