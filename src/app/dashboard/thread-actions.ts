"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { identifierError } from "@/lib/deidentify";
import { postToThread } from "@/lib/threads";

// A reply typed into a conversation shown in place (under a client on a
// cover request, or on a referral). It goes into the same thread Messages
// shows, and the page comes back to the same spot.
const inDashboard = (path: string) => (path.startsWith("/dashboard/") || path === "/dashboard" ? path : "/dashboard/messages");

export async function replyInThreadAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const returnTo = inDashboard(String(formData.get("return_to") || ""));
  const anchor = String(formData.get("anchor") || "").replace(/[^a-z0-9-]/gi, "");
  const link = String(formData.get("link") || "");
  const title = String(formData.get("title") || "").trim() || null;
  const others = formData.getAll("other_ids").map(String).filter(Boolean);
  const body = String(formData.get("body") || "").trim();
  const back = (error?: string) => {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${error ? `${sep}error=${encodeURIComponent(error)}` : ""}${anchor ? `#${anchor}` : ""}`);
  };
  if (!body) back("Write a message first.");
  const idErr = identifierError(body);
  if (idErr) back(idErr);

  const { error } = await postToThread(supabase, user.id, others, title, body.slice(0, 2000), link.startsWith("/dashboard") ? link : undefined);
  if (error) back("Your message didn't send. Try again.");
  revalidatePath("/dashboard/messages");
  back();
}
