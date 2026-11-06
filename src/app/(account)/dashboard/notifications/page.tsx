import { redirect } from "next/navigation";

// Notifications now open in the workspace's search window, on Notifications (Nick, 4 Nov). Old links land there.
export const dynamic = "force-dynamic";
export default function NotificationsPage() {
  redirect("/dashboard?notifications=1");
}
