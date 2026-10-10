import { redirect } from "next/navigation";
import { NOTIFICATIONS_HREF } from "./panel";

export const metadata = { title: "Notifications" };

// Notifications live in Messages, beside the conversations.
export default function NotificationsPage() {
  redirect(NOTIFICATIONS_HREF);
}
