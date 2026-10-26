import { createClient } from "@/lib/supabase/server";
import { foundingCountsLine, loadFoundingCounts } from "@/lib/founding";

// "31 founding places left in New York". Shown only for states with at least
// 10 founding members, so an empty state never advertises itself as empty.
export async function FoundingCount({ className = "founding-count" }: { className?: string }) {
  const line = foundingCountsLine(await loadFoundingCounts(await createClient()));
  if (!line) return null;
  return <p className={className}>{line}</p>;
}
