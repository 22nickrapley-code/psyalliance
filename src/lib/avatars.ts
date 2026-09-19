import type { SupabaseClient } from "@supabase/supabase-js";

// One hour, matching the signed-URL TTL used for shared documents - long
// enough to cover a normal browse session without over-extending how long
// a leaked link stays valid.
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;

// Batch-resolves a set of avatar_path values (from profiles/public_directory
// rows) into signed URLs in a single Storage API call, rather than one
// round trip per row - matters on listing pages that can render dozens of
// people at once (Network's full directory, Referrals' suggested matches).
// Returns a Map keyed by the original path so callers can look up by row.
export async function resolveAvatarUrls(
  supabase: SupabaseClient,
  avatarPaths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const paths = Array.from(new Set(avatarPaths.filter((p): p is string => !!p)));
  if (paths.length === 0) return new Map();

  const { data, error } = await supabase.storage.from("avatars").createSignedUrls(paths, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return new Map();

  const map = new Map<string, string>();
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
  const { data } = await supabase.storage.from("avatars").createSignedUrl(avatarPath, AVATAR_SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || null;
}
