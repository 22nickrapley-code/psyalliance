import type { SupabaseClient } from "@supabase/supabase-js";

// One hour, matching the signed-URL TTL used for shared documents - long
// enough to cover a normal browse session without over-extending how long
// a leaked link stays valid.
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;

const DEMO_PREFIX = "demo/";
const demoUrl = (p: string) => `/demo-avatars/${p.slice(DEMO_PREFIX.length)}`;

// Batch-resolves a set of avatar_path values (from profiles/public_directory
// rows) into signed URLs in a single Storage API call, rather than one
// round trip per row - matters on listing pages that can render dozens of
// people at once (Network's full directory, Referrals' suggested matches).
// Returns a Map keyed by the original path so callers can look up by row.
export async function resolveAvatarUrls(
  supabase: SupabaseClient,
  avatarPaths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const all = Array.from(new Set(avatarPaths.filter((p): p is string => !!p)));
  const map = new Map<string, string>();
  // Demo network avatars ship with the app as static illustrations.
  for (const p of all) if (p.startsWith(DEMO_PREFIX)) map.set(p, demoUrl(p));
  const paths = all.filter((p) => !p.startsWith(DEMO_PREFIX));
  if (paths.length === 0) return map;

  const { data, error } = await supabase.storage.from("avatars").createSignedUrls(paths, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return map;

  for (const row of data) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

// Single-path convenience wrapper for the current user's own avatar on the
// profile page, where batching doesn't apply.
export async function resolveAvatarUrl(
  supabase: SupabaseClient,
  avatarPath: string | null | undefined
): Promise<string | null> {
  if (!avatarPath) return null;
  if (avatarPath.startsWith(DEMO_PREFIX)) return demoUrl(avatarPath);
  const { data } = await supabase.storage.from("avatars").createSignedUrl(avatarPath, AVATAR_SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || null;
}
