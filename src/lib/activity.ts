import { createClient } from "@/lib/supabase/server";

// Backing store for the Overview activity ticker - a plain append-only log
// of "something happened that might interest other members" events. No
// per-viewer fan-out: relevance is computed at read time (see
// getActivityTicker below) by overlapping the event's specialism_ids/state
// against the viewer's own, so logging an event is just one insert, however
// many members it might end up being relevant to.
export type ActivityEventType = "new_member" | "town_hall_post" | "document_upload";

export async function logActivityEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    eventType: ActivityEventType;
    actorProfileId: string;
    actorName: string;
    specialismIds: number[];
    state: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("activity_events").insert({
    event_type: input.eventType,
    actor_profile_id: input.actorProfileId,
    actor_name: input.actorName,
    specialism_ids: input.specialismIds,
    state: input.state,
    summary: input.summary,
    metadata: input.metadata || {},
  });
  // Best-effort, same pattern as notifyProfile - never let ticker logging
  // block or fail the real action (accepting a member, posting a message,
  // uploading a document) that triggered it.
  if (error) console.error("logActivityEvent failed:", error.message);
}

export type ActivityTickerItem = {
  id: number;
  eventType: ActivityEventType;
  actorName: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const TICKER_LOOKBACK_DAYS = 30;
const TICKER_LIMIT = 20;

// Everything the viewer's own specialisms or state overlap with, from
// everyone but themselves, most recent first. Two members with no shared
// specialism and no shared state simply never see each other's activity -
// this is meant to feel like "things relevant to me," not a firehose.
export async function getActivityTicker(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string
): Promise<ActivityTickerItem[]> {
  const [{ data: viewerProfile }, { data: viewerSpecialisms }] = await Promise.all([
    supabase.from("profiles").select("primary_state").eq("id", viewerId).maybeSingle(),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values!inner(category)")
      .eq("profile_id", viewerId)
      .eq("lookup_values.category", "treatment_specialism"),
  ]);

  const viewerState = viewerProfile?.primary_state || null;
  const viewerSpecialismIds = (viewerSpecialisms || []).map((s) => s.lookup_value_id);
  if (!viewerState && viewerSpecialismIds.length === 0) return [];

  const cutoff = new Date(Date.now() - TICKER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const orParts: string[] = [];
  if (viewerState) orParts.push(`state.eq.${viewerState}`);
  if (viewerSpecialismIds.length > 0) orParts.push(`specialism_ids.ov.{${viewerSpecialismIds.join(",")}}`);

  const { data } = await supabase
    .from("activity_events")
    .select("id, event_type, actor_name, summary, metadata, created_at")
    .neq("actor_profile_id", viewerId)
    .gte("created_at", cutoff)
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(TICKER_LIMIT);

  return (data || []).map((e) => ({
    id: e.id,
    eventType: e.event_type as ActivityEventType,
    actorName: e.actor_name,
    summary: e.summary,
    metadata: (e.metadata as Record<string, unknown>) || {},
    createdAt: e.created_at,
  }));
}
