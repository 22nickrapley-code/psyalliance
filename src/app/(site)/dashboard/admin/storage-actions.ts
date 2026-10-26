"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Removes files whose owner no longer exists, through the Storage API so
// the file itself is deleted (migration 0088 lists them and lets admins
// delete only those).
export async function removeOrphanedFilesAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const { data } = await supabase.rpc("admin_orphaned_files");
  const byBucket = new Map<string, string[]>();
  for (const f of (data as { bucket_id: string; name: string }[]) || []) {
    if (!byBucket.has(f.bucket_id)) byBucket.set(f.bucket_id, []);
    byBucket.get(f.bucket_id)!.push(f.name);
  }
  let removed = 0;
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 100) {
      const { data: gone, error } = await supabase.storage.from(bucket).remove(names.slice(i, i + 100));
      if (error) redirect(`/dashboard/admin?storage_error=${encodeURIComponent(error.message)}`);
      removed += (gone || []).length;
    }
  }
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/admin?storage_removed=${removed}`);
}
