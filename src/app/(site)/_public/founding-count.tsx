import { createClient } from "@/lib/supabase/server";
import { foundingCountsLine, loadFoundingCounts } from "@/lib/founding";

// "38 of 40 founding places left in New York", for every open state (v5, Nick 8 Nov).
export async function FoundingCount({ className = "founding-count" }: { className?: string }) {
  const line = foundingCountsLine(await loadFoundingCounts(await createClient()));
  if (!line) return null;
  return <p className={className}>{line}</p>;
}
