"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const back = (q: string) => redirect(`/dashboard/full${q}`);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Your page: on or off, its address and what it says.
export async function saveOverflowPage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const slug = slugify(String(formData.get("slug") || ""));
  if (slug.length < 3) back(`?error=${encodeURIComponent("Choose a web address of at least 3 letters or numbers.")}`);
  const { error } = await supabase.from("overflow_pages").upsert(
    {
      profile_id: user.id,
      slug,
      enabled: String(formData.get("enabled") || "") === "1",
      message: String(formData.get("message") || "").trim().slice(0, 400) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );
  if (error) back(`?error=${encodeURIComponent(error.code === "23505" ? "That web address is taken. Try another." : error.message)}`);
  revalidatePath("/dashboard/full");
  back("?saved=page");
}

// Leave a colleague off your page, or put them back.
export async function toggleOverflowColleague(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const id = String(formData.get("id") || "");
  const { data: page } = await supabase.from("overflow_pages").select("hidden").eq("profile_id", user.id).maybeSingle<any>();
  if (!page) back(`?error=${encodeURIComponent("Save your page first.")}`);
  const hidden: string[] = page!.hidden || [];
  const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
  await supabase.from("overflow_pages").update({ hidden: next, updated_at: new Date().toISOString() }).eq("profile_id", user.id);
  revalidatePath("/dashboard/full");
  back("#colleagues");
}

// Your consent to appear on trusted colleagues' pages, with the contact
// details you choose to make public.
export async function savePublicListing(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const enabled = String(formData.get("enabled") || "") === "1";
  let website = String(formData.get("website") || "").trim() || null;
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const phone = String(formData.get("phone") || "").trim().slice(0, 40) || null;
  const email = String(formData.get("email") || "").trim() || null;
  if (enabled && !website && !phone && !email) back(`?error=${encodeURIComponent("Add at least one way for clients to reach you.")}#listing`);
  const { error } = await supabase.from("public_listings").upsert(
    { profile_id: user.id, enabled, website, phone, email, note: String(formData.get("note") || "").trim().slice(0, 200) || null, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" }
  );
  if (error) back(`?error=${encodeURIComponent(error.message.includes("check") ? "Check the website and email addresses." : error.message)}#listing`);
  revalidatePath("/dashboard/full");
  back("?saved=listing#listing");
}
