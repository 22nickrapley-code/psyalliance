"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { clinicianName } from "@/lib/profession";
import type { Suggestion } from "@/lib/colleague-suggestions";

// Searches the verified network by name for the colleague picker. Uses the
// same directory function as Network, so blocks and eligibility apply.
export async function searchColleaguesAction(q: string): Promise<Suggestion[]> {
  const term = String(q || "").trim().slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.rpc("network_directory", { p: { q: term, limit: 8, offset: 0 } });
  const rows: any[] = ((data as any)?.people || []).filter((p: any) => p.id !== user.id);
  const urls = await resolveAvatarUrls(supabase, rows.map((p) => p.avatar_path));
  return rows.map((p) => ({
    id: p.id,
    name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix),
    avatarUrl: urls.get(p.avatar_path || "") || null,
    where: [p.city, p.state].filter(Boolean).join(", "),
    group: "network" as const,
    reason: "Verified member",
    focus: (p.focus || []).slice(0, 2),
  }));
}
