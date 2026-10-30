"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const SITUATIONS = ["starting_practice", "building_caseload", "professional_perspective", "time_away", "returning_relocating", "reducing_closing", "something_else", "prefer_not_to_say"];

function back(kind: "saved" | "error", text: string, section: string): never {
  redirect(`/dashboard/settings?${kind}=${encodeURIComponent(text)}#${section}`);
}

async function save(p: Record<string, unknown>, section: string, ok: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const { error } = await supabase.rpc("set_my_participation", { p });
  if (error) {
    const known = /Tick the box|Sign in/i.test(error.message);
    back("error", known ? error.message : "That didn't save, so nothing was changed. Please try again.", section);
  }
  revalidatePath("/dashboard/settings");
  back("saved", ok, section);
}

export async function saveSituationsAction(formData: FormData) {
  const picked = formData.getAll("situation").map(String).filter((s) => SITUATIONS.includes(s));
  const skip = formData.get("intent") === "skip";
  // "Prefer not to say" stands alone: it never sits beside other choices.
  const situations = skip ? [] : picked.includes("prefer_not_to_say") && picked.length > 1 ? ["prefer_not_to_say"] : picked;
  await save({ situations }, "situations", skip ? "Skipped. You can set this any time." : "Saved.");
}

export async function saveApproachAction(formData: FormData) {
  const p: Record<string, unknown> = {};
  for (const [k, key] of [["referrals", "Referrals"], ["cover", "Cover"], ["consult", "Consult"]] as const) {
    const act = String(formData.get(`${k}_action`) || "");
    if (act === "pause") {
      p[`open${key}`] = true;
      p[`paused${key}`] = true;
      const until = String(formData.get(`${k}_until`) || "");
      p[`pause${key}Until`] = /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : "";
    } else if (act === "resume") {
      p[`paused${key}`] = false;
      p[`pause${key}Until`] = "";
      p[`open${key}`] = true;
    } else if (act === "close") {
      p[`open${key}`] = false;
      p[`paused${key}`] = false;
      p[`pause${key}Until`] = "";
    } else if (act === "open") {
      p[`open${key}`] = true;
    }
  }
  await save(p, "approach", "Saved. Work already in progress is not affected.");
}

export async function saveAlertsAction(formData: FormData) {
  const p: Record<string, unknown> = {
    quietStart: String(formData.get("quiet_start") || ""),
    quietEnd: String(formData.get("quiet_end") || ""),
  };
  const phone = String(formData.get("sms_phone") || "").replace(/[\s().-]/g, "");
  const remove = formData.get("intent") === "remove-phone";
  if (remove) p.smsPhone = "";
  else if (phone) {
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) back("error", "Enter the phone number with its country code, for example +1 555 010 0199.", "alerts");
    p.smsPhone = phone;
    p.smsConsent = formData.get("sms_consent") === "on";
    p.alertSms = true;
  } else p.alertSms = formData.get("alert_sms") === "on";
  await save(p, "alerts", remove ? "Phone number removed." : "Alert settings saved.");
}
