"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeBack, backWith } from "@/lib/back";
import { IS_DEMO_SITE } from "@/lib/env";
import { extractStructuredData, AiNotConfiguredError, AiCallError } from "@/lib/ai/anthropic";
import { friendly } from "@/lib/friendly-error";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function profileError(message: string, back?: string | null): never {
  redirect(`/dashboard/profile?edit=1&error=${encodeURIComponent(message)}${back ? `&back=${encodeURIComponent(back)}` : ""}`);
}

// A photo address found in pasted profile text is fetched with care:
// public https addresses only (no IP addresses, local or internal names,
// or unusual ports), every redirect checked the same way, at most three of
// them, and the download stopped as soon as it passes 5 MB. The bytes must
// really be a JPEG, PNG or WebP image.
function publicHttpsUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host) || host.includes(":")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) return null;
  if (/(^|\.)(supabase\.co|supabase\.in|workers\.dev)$/.test(host)) return null;
  return u;
}

function imageTypeOf(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function fetchImageSafely(raw: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  let url = publicHttpsUrl(raw);
  const deadline = AbortSignal.timeout(8000);
  for (let hop = 0; url && hop <= 3; hop += 1) {
    const res = await fetch(url.toString(), { signal: deadline, redirect: "manual", headers: { accept: "image/jpeg,image/png,image/webp" } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      url = next ? publicHttpsUrl(new URL(next, url).toString()) : null;
      continue;
    }
    if (!res.ok || !res.body) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_AVATAR_BYTES) {
      await res.body.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AVATAR_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;
    const all = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    const type = imageTypeOf(all);
    if (!type || !ALLOWED_AVATAR_TYPES.has(type)) return null;
    return { bytes: all.buffer, type };
  }
  return null;
}

// A photo found in an imported profile (a picture pasted or dropped, or the
// headshot in pasted Psychology Today text) becomes the profile photo when
// the profile is saved. Only https images, up to 5 MB.
async function importAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  source: { file?: File | null; url?: string | null }
): Promise<boolean> {
  try {
    let bytes: ArrayBuffer | null = null;
    let type = "";
    if (source.file && source.file.size > 0) {
      if (!ALLOWED_AVATAR_TYPES.has(source.file.type) || source.file.size > MAX_AVATAR_BYTES) return false;
      bytes = await source.file.arrayBuffer();
      type = imageTypeOf(new Uint8Array(bytes)) || "";
      if (!ALLOWED_AVATAR_TYPES.has(type)) return false;
    } else if (source.url) {
      const got = await fetchImageSafely(source.url);
      if (!got) return false;
      bytes = got.bytes;
      type = got.type;
    }
    if (!bytes) return false;
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, new Blob([bytes], { type }), { contentType: type, upsert: false });
    if (upErr) return false;
    const { error: setErr } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
    if (setErr) {
      await supabase.storage.from("avatars").remove([path]);
      return false;
    }
    if (before?.avatar_path && before.avatar_path !== path) await supabase.storage.from("avatars").remove([before.avatar_path]);
    return true;
  } catch {
    return false;
  }
}

// Categories the AI import is allowed to auto-check from a pasted bio. The
// self-disclosure categories (ethnicity, gender identity, sex) are
// deliberately excluded even though they're plain lookup_values too - those
// are a personal disclosure the practitioner opts into themselves, not
// something to guess at from third-party bio text.
const AI_MATCHABLE_CATEGORIES = [
  "treatment_specialism",
  "treatment_modality",
  "insurance",
  "language",
  "session_type",
  "age_group_specialism",
  "sexual_orientation_specialism",
];

const RANKED_CATEGORIES = ["treatment_specialism", "treatment_modality"];
const SINGLE_SELECT_CATEGORIES = ["sex"];

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Practice state comes from a US state picker now. Licensed states live
  // in Credentials (reviewed licenses); states_qualified is kept only as a
  // legacy mirror so older read paths still see the practice state.
  const primaryState = String(formData.get("primary_state") || "").trim().toUpperCase() || null;
  const { data: existing } = await supabase.from("profiles").select("states_qualified").eq("id", user.id).maybeSingle();
  const prevStates: string[] = existing?.states_qualified || [];
  const statesQualified = primaryState ? [primaryState, ...prevStates.filter((s) => s !== primaryState)] : prevStates;
  const bio = String(formData.get("bio") || "").trim().slice(0, 700);
  const back = safeBack(formData.get("back"));

  const profileRow = {
    id: user.id,
    full_name: String(formData.get("full_name") || "").trim(),
    credential_prefix: String(formData.get("credential_prefix") || "").trim() || null,
    qualification_level: (String(formData.get("qualification_level") || "") || null) as any,
    board_certified: formData.get("board_certified") === "on",
    primary_practice_city: String(formData.get("primary_practice_city") || "").trim() || null,
    states_qualified: statesQualified,
    primary_state: primaryState,
    bio: bio || null,
    // accepting_referrals is deliberately NOT written here (Sept 23 audit
    // fix): it's a derived mirror of the confirmed Availability status.
    pronoun: String(formData.get("pronoun") || "") || null,
    practice_website: String(formData.get("practice_website") || "") || null,
    contact_phone: String(formData.get("contact_phone") || "") || null,
    contact_email: String(formData.get("contact_email") || "") || null,
    open_to_group_consultation: formData.get("open_to_group_consultation") === "on",
    // Supervision is hidden from the final product (decision D-03). Its two answers are kept as they are and are only
    // written when a form sends them, so saving the profile never clears what a member said before.
    ...(formData.has("open_to_give_supervision") ? { open_to_give_supervision: formData.get("open_to_give_supervision") === "on" } : {}),
    ...(formData.has("open_to_receive_supervision") ? { open_to_receive_supervision: formData.get("open_to_receive_supervision") === "on" } : {}),
    psypact_participating: formData.get("psypact_participating") === "on",
    updated_at: new Date().toISOString(),
  };
  if (!profileRow.full_name) profileError("Add your full name", back);

  // Update when the row exists, insert on first save. (An upsert would
  // need read access to private columns, which members don't have
  // directly: see migration 0079.)
  const { data: mine } = await supabase.rpc("my_profile").maybeSingle();
  const { error: saveError } = mine
    ? await supabase.from("profiles").update(profileRow).eq("id", user.id)
    : await supabase.from("profiles").insert(profileRow);
  if (saveError) {
    profileError(friendly(saveError), back);
  }

  // Rebuild the profile's lookup-value associations from scratch each save -
  // simplest correct approach for a form with a variable number of checkboxes.
  const { data: allLookups } = await supabase.from("lookup_values").select("id, category");

  const rows: { profile_id: string; lookup_value_id: number; rank: number | null }[] = [];
  const singleSelectIdsChosen = new Set<string>();
  for (const category of SINGLE_SELECT_CATEGORIES) {
    const chosen = formData.get(`single_${category}`);
    if (chosen) singleSelectIdsChosen.add(String(chosen));
  }
  // "Your top five" specialties: spec_rank_1..5 selects. A specialty
  // picked there is saved with that rank whether or not its checkbox is
  // ticked; ticked-only specialties are saved unranked.
  const topRank = new Map<number, number>();
  for (let n = 1; n <= 5; n++) {
    const id = Number(formData.get(`spec_rank_${n}`));
    if (Number.isFinite(id) && id > 0 && !topRank.has(id)) topRank.set(id, n);
  }
  const usesTopFive = formData.has("spec_rank_1");
  for (const lv of allLookups || []) {
    if (usesTopFive && lv.category === "treatment_specialism") {
      const checked = formData.get(`lv_${lv.id}`) === "on";
      const r = topRank.get(lv.id);
      if (r || checked) rows.push({ profile_id: user.id, lookup_value_id: lv.id, rank: r ?? null });
      continue;
    }
    if (SINGLE_SELECT_CATEGORIES.includes(lv.category)) {
      if (singleSelectIdsChosen.has(String(lv.id))) {
        rows.push({ profile_id: user.id, lookup_value_id: lv.id, rank: null });
      }
      continue;
    }
    const checked = formData.get(`lv_${lv.id}`) === "on";
    if (!checked) continue;
    let rank: number | null = null;
    if (RANKED_CATEGORIES.includes(lv.category)) {
      const rankRaw = formData.get(`rank_${lv.id}`);
      rank = rankRaw ? parseInt(String(rankRaw), 10) || null : null;
    }
    rows.push({ profile_id: user.id, lookup_value_id: lv.id, rank });
  }

  // Replaced in one step (one database transaction), so a failure part-way
  // never leaves a profile with its practice facts missing.
  const { error: factsError } = await supabase.rpc("set_my_practice_facts", {
    p_rows: rows.map((r) => ({ lookup_value_id: r.lookup_value_id, rank: r.rank })),
  });
  if (factsError) {
    // Until the database has the one-step function, fall back to the old way.
    if (factsError.code === "PGRST202" || /could not find the function/i.test(factsError.message)) {
      await supabase.from("profile_lookup_values").delete().eq("profile_id", user.id);
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from("profile_lookup_values").insert(rows);
        if (insertError) profileError(friendly(insertError), back);
      }
    } else {
      profileError("Your specialties and other practice details didn't save. Nothing was changed; try again.", back);
    }
  }

  const importFile = formData.get("avatar_import_file");
  const importUrl = String(formData.get("avatar_import_url") || "").trim();
  const photoImported =
    (importFile instanceof File && importFile.size > 0) || importUrl
      ? await importAvatar(supabase, user.id, { file: importFile instanceof File ? importFile : null, url: importUrl || null })
      : false;

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  if (back) redirect(backWith(back, { saved: "profile" }));
  redirect(`/dashboard/profile?saved=1${photoImported ? "&photo=imported" : ""}`);
}

// The three "Open to" flags shown on the profile view, keyed to their exact
// profiles column name so the toggle below can update any of them with one
// shared function instead of three near-identical ones. Incoming referrals
// used to be a fourth one-click field here (accepting_referrals) - removed
// Sept 23 as part of the audit fix, since that field is now derived from the
// confirmed Availability tri-state, not independently toggleable. It's shown
// read-only on the profile view with a link to Availability instead.
const OPEN_TO_FIELDS = new Set([
  "open_to_give_supervision",
  "open_to_receive_supervision",
  "open_to_group_consultation",
]);

// One-click "Open to" toggle from the read-only profile view - per Nick's
// note, these should flip with a single click right there, not require
// the full Edit Profile flow just to change a yes/no. Takes the field name
// and its current value (so it can flip it) via hidden form inputs.
export async function toggleOpenToField(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const field = String(formData.get("field") || "");
  if (!OPEN_TO_FIELDS.has(field)) profileError("Unknown toggle field.");

  const current = formData.get("current") === "true";
  const { error } = await supabase
    .from("profiles")
    .update({ [field]: !current, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) profileError(friendly(error));

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/people/${user.id}`);
}

export async function saveAvailability(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const days = formData.getAll("availability_day").map((d) => Number(d));

  await supabase.from("profile_availability").delete().eq("profile_id", user.id);
  if (days.length > 0) {
    const { error } = await supabase
      .from("profile_availability")
      .insert(days.map((day_of_week) => ({ profile_id: user.id, day_of_week })));
    if (error) profileError(friendly(error));
  }

  revalidatePath("/dashboard/profile");
}

// Turns a pasted bio (from Psychology Today, a practice website, LinkedIn,
// anywhere) into pre-fill values for the profile form above. Returns data
// for the client component to apply to the DOM itself - this never writes
// to the database; the user still reviews everything and clicks "Save
// profile" themselves.
// Lines that are site navigation, not the clinician's profile (Psychology Today and similar sites).
const BOILERPLATE = /^(therapists?|psychiatrists?|treatment centers?|support groups?|therapy guide|get help|find a therapist|magazine|today|sign in|log in|join|for professionals|united states|©.*|cookie.*|privacy.*|terms.*|share|email|call|website|view|see all|show more|show less|back|next|menu|search|home)$/i;

function cleanPastedProfile(text: string): string {
  const seen = new Set<string>();
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && !BOILERPLATE.test(l))
    .filter((l) => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return lines.join("\n").slice(0, 15000);
}

async function fetchProfilePage(url: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !/^(www\.)?psychologytoday\.com$/i.test(u.hostname) || u.username || u.password) return null;
  try {
    const res = await fetch(u.toString(), { redirect: "manual", headers: { accept: "text/html", "user-agent": "PsyAlliance profile import (member request)" } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 2_000_000);
    const text = html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
    return text.trim().length > 200 ? text : null;
  } catch {
    return null;
  }
}

export async function parseProfileBio(bioText: string): Promise<{
  fields?: {
    full_name: string | null;
    credential_prefix: string | null;
    qualification_level: string | null;
    primary_practice_city: string | null;
    states_qualified: string[];
    pronoun: string | null;
    practice_website: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    bio: string | null;
  };
  matchedLookupIds?: number[];
  matchedLabels?: string[];
  rankedSpecialtyIds?: number[];
  error?: string;
}> {
  let raw = bioText.trim();
  if (!raw) return { error: "Paste a link to your profile, or its text, first." };
  // A link: only a Psychology Today profile page is opened by us (a known host, no redirects, a size cap).
  if (/^https?:\/\/\S+$/i.test(raw)) {
    const page = await fetchProfilePage(raw);
    if (!page) return { error: "We couldn't open that page. Open your profile, select all its text, copy it and paste it here instead." };
    raw = page;
  }
  // A pasted web page carries menus and footers; keep the profile itself and stay within a sensible size.
  const trimmed = cleanPastedProfile(raw);
  if (trimmed.length < 40) return { error: "There isn't enough here to go on. Paste the full text of your profile." };

  const supabase = await createClient();
  const { data: lookups } = await supabase
    .from("lookup_values")
    .select("category, value")
    .in("category", AI_MATCHABLE_CATEGORIES);

  const byCategory: Record<string, string[]> = {};
  for (const lv of lookups || []) {
    byCategory[lv.category] = byCategory[lv.category] || [];
    byCategory[lv.category].push(lv.value);
  }
  const optionsBlock = Object.entries(byCategory)
    .map(([category, values]) => `${category}: ${values.join(", ")}`)
    .join("\n");

  try {
    const result = await extractStructuredData<{
      full_name?: string;
      credential_prefix?: string;
      qualification_level?: string;
      primary_practice_city?: string;
      states_qualified?: string[];
      pronoun?: string;
      practice_website?: string;
      contact_phone?: string;
      contact_email?: string;
      bio?: string;
      top_specialties?: string[];
      matched_options?: { category: string; value: string }[];
    }>({
      system:
        "You extract structured profile data for a psychologist/psychiatrist practice directory from bio text the practitioner pasted themselves (their own Psychology Today profile, practice website, LinkedIn, CV, etc). Only extract what's actually stated - never invent or guess a value. For matched_options, choose ONLY from the exact category/value pairs given in the allowed options list; do not invent new values, and skip anything not clearly supported by the text.",
      userContent: `Bio text:\n"""\n${trimmed}\n"""\n\nAllowed options (category: comma-separated canonical values - only match from these):\n${optionsBlock}`,
      toolName: "extract_profile",
      toolDescription: "Extract structured profile fields and matching specialism/preference options from bio text.",
      inputSchema: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Full name, if stated" },
          credential_prefix: { type: "string", description: "e.g. Dr" },
          qualification_level: { type: "string", enum: ["PhD", "PsyD", "EdD", "MD", "DO"] },
          primary_practice_city: { type: "string" },
          states_qualified: { type: "array", items: { type: "string" }, description: "Two-letter US state codes the practitioner is licensed in" },
          pronoun: { type: "string" },
          practice_website: { type: "string" },
          contact_phone: { type: "string" },
          contact_email: { type: "string" },
          bio: {
            type: "string",
            description:
              "The practitioner's own short description of who they work with and how, taken from their text (keep their words; trim to two or three sentences, under 600 characters). Omit if there isn't one.",
          },
          top_specialties: {
            type: "array",
            items: { type: "string" },
            description:
              "Up to five treatment_specialism values from the allowed list, in the order the text presents as most important (for example a 'Top Specialties' list first, then the order they're described). Only values clearly supported by the text.",
          },
          matched_options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                value: { type: "string" },
              },
              required: ["category", "value"],
            },
          },
        },
      },
    });

    const { data: allLookups } = await supabase
      .from("lookup_values")
      .select("id, category, value")
      .in("category", AI_MATCHABLE_CATEGORIES);
    const idByCategoryValue = new Map((allLookups || []).map((lv) => [`${lv.category}::${lv.value}`, lv.id]));

    const rankedSpecialtyIds: number[] = [];
    for (const v of result.top_specialties || []) {
      const id = idByCategoryValue.get(`treatment_specialism::${v}`);
      if (id && !rankedSpecialtyIds.includes(id) && rankedSpecialtyIds.length < 5) rankedSpecialtyIds.push(id);
    }
    const matchedLookupIds: number[] = [];
    const matchedLabels: string[] = [];
    for (const m of result.matched_options || []) {
      const id = idByCategoryValue.get(`${m.category}::${m.value}`);
      if (id) {
        matchedLookupIds.push(id);
        matchedLabels.push(m.value);
      }
    }

    return {
      fields: {
        full_name: result.full_name || null,
        credential_prefix: result.credential_prefix || null,
        qualification_level: result.qualification_level || null,
        primary_practice_city: result.primary_practice_city || null,
        states_qualified: (result.states_qualified || []).map((s) => s.toUpperCase()),
        pronoun: result.pronoun || null,
        practice_website: result.practice_website || null,
        contact_phone: result.contact_phone || null,
        contact_email: result.contact_email || null,
        bio: result.bio ? result.bio.trim().slice(0, 700) : null,
      },
      // Ranked specialties are also covered areas.
      matchedLookupIds: Array.from(new Set([...matchedLookupIds, ...rankedSpecialtyIds])),
      matchedLabels,
      rankedSpecialtyIds,
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      console.error("profile import: no AI key configured on this site");
      return {
        error: IS_DEMO_SITE
          ? "Importing a bio is switched off in the sandbox. On PsyAlliance it reads your bio or website and fills in these fields for you to check. Here, please type them in."
          : err.message,
      };
    }
    console.error("profile import", err);
    const status = err instanceof AiCallError ? err.status : 0;
    if (status === 429 || status === 529 || status === 503) return { error: "The import is busy just now. Please try again in a minute, or fill in the form below." };
    if (status === 400) return { error: "We couldn't read that text. Try pasting only your profile (name, specialties, approach), or fill in the form below." };
    return { error: "We couldn't read that just now. Please try again, or fill in the form below." };
  }
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Professional photo upload, in the vein of a Psychology Today profile
// photo. Stored privately (see 0032_profile_avatar_upload.sql) - only ever
// shown to another signed-in member via a short-lived signed URL, never a
// public one.
export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("Choose a photo first."));
  }
  const photo = file as File;
  if (!ALLOWED_AVATAR_TYPES.has(photo.type)) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("Please upload a JPEG, PNG, or WebP image."));
  }
  if (photo.size > MAX_AVATAR_BYTES) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("That photo is too large - please keep it under 5MB."));
  }

  // A profile row must already exist (created by the main "Save profile"
  // form) since avatar_path lives on it and profiles.full_name etc are
  // NOT NULL with no default - there's nothing sensible to upsert here.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  if (!existingProfile) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("Save your profile details below first, then add a photo."));
  }

  const ext = (photo.name.split(".").pop() || photo.type.split("/")[1] || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, photo, {
    contentType: photo.type,
    upsert: false,
  });
  if (uploadError) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent(friendly(uploadError, "That photo didn't upload. Try a JPG or PNG under 5 MB.")));
  }

  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (updateError) {
    // Clean up the just-uploaded object rather than leaving an orphan.
    await supabase.storage.from("avatars").remove([path]);
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent(friendly(updateError)));
  }

  // Best-effort cleanup of the previous photo, if any - not awaited-critical,
  // and never blocks the redirect below on failure.
  const oldPath = existingProfile?.avatar_path;
  if (oldPath && oldPath !== path) {
    await supabase.storage.from("avatars").remove([oldPath]);
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  redirect("/dashboard/profile?edit=1&avatar_saved=1#photo");
}

export async function submitCredentialVerification(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("credential_verifications").insert({
    profile_id: user.id,
    source: String(formData.get("source") || "state_board"),
    state: String(formData.get("state") || "") || null,
    license_number: String(formData.get("license_number") || ""),
  });
  if (error) profileError(friendly(error));

  revalidatePath("/dashboard/profile");
}

// A member deletes their own account (migration 0108, delete_my_account).
export async function deleteAccountAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const confirm = String(formData.get("confirm") || "").trim();
  // Errors go back to where the button was (Profile or Settings).
  const from = String(formData.get("back") || "") === "/dashboard/settings" ? "/dashboard/settings" : "/dashboard/profile";
  const fail = (msg: string) => redirect(`${from}?error=${encodeURIComponent(msg)}${from === "/dashboard/settings" ? "#data" : ""}`);
  if (confirm !== "DELETE") fail("Type DELETE in capitals to confirm.");

  // Who can't delete here is checked first, so nothing is removed for them.
  const { data: me } = await supabase.rpc("my_profile").maybeSingle<any>();
  if (me?.is_admin || me?.account_kind === "operator") fail("Admin accounts can't be deleted from here.");
  if (IS_DEMO_SITE) fail("Sandbox accounts end on their own. Use Start the story again to begin afresh.");

  // Stored files go first: the database rows that point at them are deleted
  // with the account, and a file without its row could never be found again.
  // If any file can't be removed, nothing is deleted and they can try again.
  const failedFiles = await removeMyStoredFiles(supabase, user.id, me?.avatar_path || null);
  if (failedFiles) fail("We couldn't remove your stored files, so nothing was deleted. Please try again in a minute.");

  const { error } = await supabase.rpc("delete_my_account", { p_confirm: confirm });
  if (error) fail(error.code === "P0001" ? error.message : "We couldn't delete your account just now. Please try again, or email hello@psyalliance.org.");
  await supabase.auth.signOut();
  redirect("/goodbye");
}

// Every file this member stored: their documents (by record, and anything
// left in their own folder) and their profile photos. Returns true if any
// file could not be found or removed. A listing that fails is a failure,
// not an empty folder (release review R04), and the folders are checked
// again afterwards; the database also refuses to delete the account while
// any of these files remain.
async function removeMyStoredFiles(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, avatarPath: string | null): Promise<boolean> {
  const docPaths = new Set<string>();
  const { data: docs, error: docsErr } = await supabase.from("documents").select("storage_path").eq("uploaded_by", userId);
  if (docsErr) return true;
  for (const d of docs || []) if (d.storage_path && String(d.storage_path).startsWith(`personal/${userId}/`)) docPaths.add(String(d.storage_path));
  // Every file under a folder, including any sub-folders. null = couldn't list.
  const listAll = async (bucket: string, prefix: string, depth = 0): Promise<string[] | null> => {
    const out: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset });
      if (error) return null;
      for (const f of data || []) {
        if (f.id) out.push(`${prefix}/${f.name}`);
        else if (depth < 4) {
          const inner = await listAll(bucket, `${prefix}/${f.name}`, depth + 1);
          if (!inner) return null;
          out.push(...inner);
        }
      }
      if (!data || data.length < 100) break;
      if (offset > 100_000) return null;
    }
    return out;
  };
  const inFolder = await listAll("documents", `personal/${userId}`);
  const photos = await listAll("avatars", userId);
  if (!inFolder || !photos) return true;
  inFolder.forEach((p) => docPaths.add(p));
  const photoPaths = new Set(photos);
  if (avatarPath && avatarPath.startsWith(`${userId}/`)) photoPaths.add(avatarPath);
  const removeAll = async (bucket: string, paths: string[]) => {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) return false;
    }
    return true;
  };
  const docsOk = await removeAll("documents", [...docPaths]);
  const photosOk = await removeAll("avatars", [...photoPaths]);
  if (!(docsOk && photosOk)) return true;
  const leftDocs = await listAll("documents", `personal/${userId}`);
  const leftPhotos = await listAll("avatars", userId);
  return !leftDocs || !leftPhotos || leftDocs.length > 0 || leftPhotos.length > 0;
}
