import type { SupabaseClient } from "@supabase/supabase-js";
import { friendly } from "@/lib/friendly-error";
import { identifierError } from "@/lib/deidentify";

// Every change the workspace makes goes through one of these. Each runs as
// the signed-in member (their own session, so row-level security and the
// database's own rules apply), calls a database function that does the whole
// change in one transaction, and sends back the parts of the workspace that
// changed so the screen shows what is true, not what was hoped.
export type Ctx = { supabase: SupabaseClient; userId: string };
export type Result = { ok: boolean; error?: string; patch?: Record<string, any>; data?: any; signedOut?: boolean };
type Handler = (ctx: Ctx, args: any) => Promise<Result>;

export async function slices(ctx: Ctx, names: string[]) {
  const { data, error } = await ctx.supabase.rpc("workspace_slice", { p_names: names });
  if (error) throw new Error(`workspace_slice: ${error.message}`);
  return (data || {}) as Record<string, any>;
}


const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const idList = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : []);
const num = (v: unknown) => Number(v);
const bad = (error: string): Result => ({ ok: false, error });
const fail = (error: any, fallback?: string): Result => ({ ok: false, error: friendly(error, fallback) });

export const handlers: Record<string, Handler> = {
  // Any slices, for polling and for returning to a screen.
  refresh: async (ctx, a) => {
    const allowed = ["me", "people", "known", "tiers", "availability", "plans", "referrals", "threads", "discussions", "resources", "drafts", "preferences"];
    const names = (Array.isArray(a?.names) ? a.names : []).filter((n: string) => allowed.includes(n));
    return { ok: true, patch: await slices(ctx, names) };
  },

  "availability.save": async (ctx, a) => {
    const { error } = await ctx.supabase.rpc("set_my_availability", {
      p_open: !!a.open,
      p_spaces: Math.round(Number(a.spaces)),
      p_states: a.states && typeof a.states === "object" ? a.states : {},
    });
    if (error) return fail(error);
    return { ok: true, patch: await slices(ctx, ["availability", "me"]) };
  },

  "availability.confirm": async (ctx) => {
    const { error } = await ctx.supabase.rpc("confirm_my_availability");
    if (error) return fail(error);
    return { ok: true, patch: await slices(ctx, ["availability", "me"]) };
  },

  // ---- Cover -------------------------------------------------------------
  "cover.create": async (ctx, a) => {
    const clients = (Array.isArray(a.clients) ? a.clients : []).slice(0, 21).map((c: any) => ({
      label: text(c.label, 40), focus: text(c.focus, 120), secondary: text(c.secondary, 120), state: text(c.state, 2),
      age: text(c.age, 120), setting: text(c.setting, 12), insurance: text(c.insurance, 120), frequency: text(c.frequency, 40),
      prescribing: c.prescribing === true, language: text(c.language, 120), city: text(c.city, 80), selected: idList(c.selected),
    }));
    const payload = {
      requestId: /^[0-9a-f-]{36}$/i.test(String(a.requestId || "")) ? String(a.requestId) : null,
      name: text(a.name, 120), reason: text(a.reason, 20), other: text(a.other, 400), start: text(a.start, 10), end: text(a.end, 10),
      mode: text(a.mode, 12), deadline: num(a.deadline), message: text(a.message, 1200), clients,
    };
    // Plan names, notes, messages and client labels never carry client identifiers.
    const err = [payload.name, payload.message, payload.other, ...clients.map((c: any) => c.label), ...clients.map((c: any) => c.city)].map(identifierError).find(Boolean);
    if (err) return bad(err);
    const { data, error } = await ctx.supabase.rpc("cover_create_plan", { p_payload: payload });
    if (error) return fail(error, "That didn't send, so nobody was asked. Your plan is kept; please try again.");
    return { ok: true, data, patch: await slices(ctx, ["plans", "known"]) };
  },

  "cover.answer": async (ctx, a) => {
    const question = text(a.question, 2000);
    if (a.response === "discussing") {
      if (!question) return bad("Write your question first.");
      const err = identifierError(question);
      if (err) return bad(err);
    }
    const { data, error } = await ctx.supabase.rpc("cover_answer", {
      p_request: num(a.request),
      p_response: String(a.response || ""),
      p_question: question || null,
      p_client_message_id: /^[0-9a-f-]{36}$/i.test(String(a.clientMessageId || "")) ? String(a.clientMessageId) : null,
    });
    if (error) return fail(error, "Your answer didn't save. Nothing was changed; please try again.");
    return { ok: true, data, patch: await slices(ctx, ["plans", "tiers", "known"]) };
  },

  "cover.ask": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("cover_ask", { p_plan: num(a.plan), p_case: num(a.case), p_person: String(a.person || "") });
    if (error) return fail(error);
    return { ok: true, data, patch: await slices(ctx, ["plans", "known"]) };
  },

  "cover.handover": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("cover_confirm_handover", {
      p_plan: num(a.plan), p_case: num(a.case), p_contact: a.contact === true, p_summary: a.summary === true, p_client: a.client === true,
    });
    if (error) return fail(error);
    return { ok: true, data, patch: await slices(ctx, ["plans", "known"]) };
  },

  "cover.complete": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("cover_complete_plan", { p_plan: num(a.plan) });
    if (error) return fail(error);
    return { ok: true, data, patch: await slices(ctx, ["plans", "tiers", "known"]) };
  },

  "cover.cancel": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("cover_cancel_plan", { p_plan: num(a.plan) });
    if (error) return fail(error);
    return { ok: true, data, patch: await slices(ctx, ["plans", "known"]) };
  },

  // ---- Referrals ---------------------------------------------------------
  "referral.create": async (ctx, a) => {
    const payload = {
      requestId: /^[0-9a-f-]{36}$/i.test(String(a.requestId || "")) ? String(a.requestId) : null,
      focus: text(a.focus, 120), secondary: text(a.secondary, 120), state: text(a.state, 2), city: text(a.city, 80), age: text(a.age, 120),
      setting: text(a.setting, 12), insurance: text(a.insurance, 120), language: text(a.language, 120), prescribing: a.prescribing === true,
      audience: text(a.audience, 12), selected: idList(a.selected).slice(0, 101), timeframe: text(a.timeframe, 40), message: text(a.message, 700),
    };
    // The note and the city never carry client identifiers.
    const err = [payload.message, payload.city].map(identifierError).find(Boolean);
    if (err) return bad(err);
    const { data, error } = await ctx.supabase.rpc("referral_create", { p_payload: payload });
    if (error) return fail(error, "That didn't send, so nobody was asked. Your referral is kept; please try again.");
    return { ok: true, data, patch: await slices(ctx, ["referrals", "known"]) };
  },

  "referral.answer": async (ctx, a) => {
    const question = text(a.question, 2000);
    if (a.response === "discussing") {
      if (!question) return bad("Write your question first.");
      const err = identifierError(question);
      if (err) return bad(err);
    }
    const { data, error } = await ctx.supabase.rpc("referral_answer", {
      p_referral: num(a.referral),
      p_response: String(a.response || ""),
      p_capacity: a.capacity === true,
      p_question: question || null,
      p_client_message_id: /^[0-9a-f-]{36}$/i.test(String(a.clientMessageId || "")) ? String(a.clientMessageId) : null,
    });
    if (error) return fail(error, "Your reply didn't save. Nothing was changed; please try again.");
    return { ok: true, data, patch: await slices(ctx, ["referrals", "known"]) };
  },

  "referral.place": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("referral_place", { p_referral: num(a.referral), p_colleague: String(a.person || "") });
    if (error) return fail(error, "The placement didn't save. Nothing was changed; please try again.");
    return { ok: true, data, patch: await slices(ctx, ["referrals", "tiers", "known"]) };
  },

  "referral.withdraw": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("referral_withdraw", { p_referral: num(a.referral) });
    if (error) return fail(error);
    return { ok: true, data, patch: await slices(ctx, ["referrals", "known"]) };
  },

  "referral.add": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("referral_add", { p_referral: num(a.referral), p_person: String(a.person || "") });
    if (error) return fail(error);
    return { ok: true, data, patch: await slices(ctx, ["referrals", "known"]) };
  },

  "referral.thread": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("referral_thread", { p_referral: num(a.referral), p_person: /^[0-9a-f-]{36}$/i.test(String(a.person || "")) ? String(a.person) : null });
    if (error) return fail(error);
    return { ok: true, data };
  },

  "draft.save": async (ctx, a) => {
    const kind = String(a.kind || "");
    if (!/^[a-z][a-z0-9:_-]{0,39}$/i.test(kind)) return { ok: false, error: "Unknown draft." };
    const { error } = await ctx.supabase.rpc("save_workspace_draft", { p_kind: kind, p_key: String(a.key || ""), p_data: a.data ?? null });
    if (error) return fail(error, "Your draft couldn't be saved just now.");
    return { ok: true };
  },
};
