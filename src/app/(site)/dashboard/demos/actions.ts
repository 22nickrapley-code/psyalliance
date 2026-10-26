"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// "I know my way around": Demos leaves the menu on this device (Nick,
// 13 Oct). Settings brings it back. The first-visit notes in Cover, Refer
// and Consult still offer their short example.
const COOKIE = "pa_hide_demos";

export async function hideDemosAction() {
  (await cookies()).set(COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect(`/dashboard?ok=${encodeURIComponent("Demos is hidden from the menu. You can bring it back in Settings.")}`);
}

export async function showDemosAction(formData: FormData) {
  const show = formData.get("show") === "1";
  const jar = await cookies();
  if (show) jar.delete(COOKIE);
  else jar.set(COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect(`/dashboard/settings?saved=1#menu`);
}
