import { createClient } from "@/lib/supabase/server";
import { MessagesShell } from "../messages/views";
import { NotificationsPanel, countNewNotifications } from "./panel";

export const metadata = { title: "Notifications" };

// Every notification in one list (the bell in the workspace opens the short
// version). Messages and conversations are in the workspace's Messages.
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;
  return (
    <MessagesShell list={null} tab="notifications" newNotifications={await countNewNotifications(supabase, myself)}>
      <NotificationsPanel supabase={supabase} myself={myself} />
    </MessagesShell>
  );
}
