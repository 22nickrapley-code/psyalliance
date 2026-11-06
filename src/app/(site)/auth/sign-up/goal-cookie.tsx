"use client";
import { useEffect } from "react";
import { HANDOFF_COOKIE, HANDOFF_HOURS } from "@/lib/start-guide";

// A goal picked deliberately on a demo ("Watch another", R08) replaces the one chosen earlier, so sign-up and the
// first screen after it agree with what the visitor last chose. Structured choice only, with the usual expiry.
export function GoalCookie({ need, ctx }: { need: string; ctx?: string }) {
  useEffect(() => {
    const v = encodeURIComponent(JSON.stringify({ need, ctx: ctx || undefined, exp: Date.now() + HANDOFF_HOURS * 3600 * 1000 }));
    document.cookie = `${HANDOFF_COOKIE}=${v}; Max-Age=${HANDOFF_HOURS * 3600}; Path=/; SameSite=Lax`;
  }, [need, ctx]);
  return null;
}
