import type { SupabaseClient } from "@supabase/supabase-js";
import { friendly } from "@/lib/friendly-error";
import { identifierError } from "@/lib/deidentify";
import { loadInvite } from "@/lib/invite";
import { shapeLibrary, resourceKey } from "./library";

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
  const out = (data || {}) as Record<string, any>;
  if (out.resources !== undefined || out.saved !== undefined) {
    const lib = shapeLibrary({ resources: out.resources, saved: out.saved });
    delete out.saved;
    Object.assign(out, lib);
  }
  return out;
}


// The one conversation a reply opened, so it is there when the screen goes to it.
async function threadPatch(ctx: Ctx, data: any) {
  const key = data?.conversationKey;
  if (!key) return {};
  const { data: thread } = await ctx.supabase.rpc("workspace_thread", { p_key: key });
  return thread ? { thread } : {};
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const idList = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : []);
const num = (v: unknown) => Number(v);
const bad = (error: string): Result => ({ ok: false, error });
const fail = (error: any, fallback?: string): Result => ({ ok: false, error: friendly(error, fallback) });

export const handlers: Record<string, Handler> = {
  // Any slices, for polling and for returning to a screen.
  refresh: async (ctx, a) => {
    const allowed = ["me", "people", "known", "tiers", "availability", "plans", "referrals", "threads", "pulse", "inbound", "consult", "resources", "drafts", "preferences"];
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
    return { ok: true, data, patch: { ...(await slices(ctx, ["plans", "tiers", "known"])), ...(await threadPatch(ctx, data)) } };
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
    return { ok: true, data, patch: { ...(await slices(ctx, ["referrals", "known"])), ...(await threadPatch(ctx, data)) } };
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

  // ---- Messages ----------------------------------------------------------
  // A conversation is named by its key (see conversation_open). Every call
  // runs as the member; the database decides whether they are in it.
  "conversation.open": async (ctx, a) => {
    const kind = String(a.kind || "");
    if (!["direct", "cover", "referral"].includes(kind)) return bad("That conversation can't be opened.");
    const { data, error } = await ctx.supabase.rpc("conversation_open", {
      p_kind: kind,
      p_a: a.a == null ? null : num(a.a),
      p_b: a.b == null ? null : num(a.b),
      p_person: /^[0-9a-f-]{36}$/i.test(String(a.person || "")) ? String(a.person) : null,
    });
    if (error) return fail(error);
    const key = (data as any)?.key as string;
    const { data: thread } = await ctx.supabase.rpc("workspace_thread", { p_key: key });
    return { ok: true, data, patch: { thread: thread || null, ...(await slices(ctx, ["known"])) } };
  },

  "message.send": async (ctx, a) => {
    const body = text(a.text, 4000);
    const att = a.attachment && typeof a.attachment === "object" ? a.attachment : null;
    if (!body && !att) return bad("Write a message first.");
    if (body) {
      const err = identifierError(body);
      if (err) return bad(err);
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(a.clientId || ""))) return bad("That message can't be sent.");
    const { data, error } = await ctx.supabase.rpc("message_send", {
      p_key: String(a.key || ""),
      p_body: body,
      p_client_id: String(a.clientId),
      p_attachment: att
        ? { kind: text(att.kind, 8), path: text(att.path, 300), name: text(att.name, 200), size: Math.max(0, Math.round(Number(att.size) || 0)), mime: text(att.mime, 120), duration: att.duration == null ? null : Math.max(0, Math.round(Number(att.duration) || 0)) }
        : null,
    });
    if (error) return fail(error, "That message didn't send. You can try again.");
    return { ok: true, data };
  },

  "message.edit": async (ctx, a) => {
    const body = text(a.text, 4000);
    if (!body) return bad("A message can't be empty. Remove it instead.");
    const err = identifierError(body);
    if (err) return bad(err);
    const { error } = await ctx.supabase.rpc("message_edit", { p_key: String(a.key || ""), p_message: String(a.message || ""), p_body: body });
    if (error) return fail(error);
    return { ok: true };
  },

  "message.remove": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("message_remove", { p_key: String(a.key || ""), p_message: String(a.message || "") });
    if (error) return fail(error);
    const path = (data as any)?.path as string | null;
    // The file goes with the message; the message is already gone either way.
    if (path) await ctx.supabase.storage.from("message-files").remove([path]).catch(() => null);
    return { ok: true };
  },

  "message.react": async (ctx, a) => {
    const { error } = await ctx.supabase.rpc("message_react", { p_key: String(a.key || ""), p_message: String(a.message || ""), p_on: a.on === true });
    if (error) return fail(error);
    // A colleague whose message you mark useful joins Suggested for you.
    return { ok: true, patch: await slices(ctx, ["tiers"]) };
  },

  "conversation.read": async (ctx, a) => {
    const { error } = await ctx.supabase.rpc("conversation_read", { p_key: String(a.key || "") });
    if (error) return fail(error);
    return { ok: true };
  },

  // One conversation, read again (after the pulse says it changed).
  "thread.get": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("workspace_thread", { p_key: String(a.key || "") });
    if (error) return fail(error);
    return { ok: true, patch: { thread: data || null } };
  },

  "thread.older": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("thread_older", { p_key: String(a.key || ""), p_before: a.before == null ? null : num(a.before) });
    if (error) return fail(error);
    return { ok: true, data };
  },

  // Trusted colleagues: chosen one way. The colleague is told once.
  "trust.set": async (ctx, a) => {
    const person = String(a.person || "");
    if (!/^[0-9a-f-]{36}$/i.test(person)) return bad("Choose a colleague.");
    const { error } = await ctx.supabase.rpc("trust_set", { p_colleague: person, p_on: a.on === true });
    if (error) return fail(error);
    return { ok: true, patch: await slices(ctx, ["tiers"]) };
  },

  "preference.set": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("set_workspace_preference", { p_key: String(a.key || ""), p_on: a.on !== false });
    if (error) return fail(error);
    return { ok: true, patch: { preferences: data } };
  },

  // Asking a question in Consult. The same request id lands once.
  "consult.post": async (ctx, a) => {
    const title = text(a.title, 150);
    const body = text(a.body, 5000);
    const tags = (Array.isArray(a.tags) ? a.tags : String(a.tags || "").split(",")).map((t: unknown) => text(t, 40)).filter(Boolean).slice(0, 10);
    const err = [title, body, ...tags].map(identifierError).find(Boolean);
    if (err) return bad(err);
    if (!/^[0-9a-f-]{36}$/i.test(String(a.clientId || ""))) return bad("That question can't be posted.");
    const group = Number(a.groupId);
    const { data, error } = await ctx.supabase.rpc("consult_post", {
      p_payload: {
        title, body, tags, topic: text(a.topic, 40), audience: text(a.audience, 12), recipients: idList(a.recipients),
        groupId: Number.isInteger(group) && group > 0 ? group : null, clientRequestId: String(a.clientId), confirmed: a.confirmed === true,
      },
    });
    if (error) return fail(error, "That question didn't post. You can try again.");
    const id = Number((data as any)?.id);
    const [{ data: discussion }, { data: following }] = await Promise.all([
      ctx.supabase.rpc("workspace_discussion", { p_id: id }),
      ctx.supabase.rpc("my_consult_follows"),
    ]);
    return { ok: true, data: { id }, patch: { discussion: discussion || null, following: following || [] } };
  },

  "consult.reply": async (ctx, a) => {
    const body = text(a.text, 3000);
    if (!body) return bad("Write a reply first.");
    const err = identifierError(body);
    if (err) return bad(err);
    const id = Number(a.id);
    if (!Number.isInteger(id) || !/^[0-9a-f-]{36}$/i.test(String(a.clientId || ""))) return bad("That reply can't be posted.");
    const { data, error } = await ctx.supabase.rpc("consult_reply", { p_consultation: id, p_body: body, p_client_id: String(a.clientId) });
    if (error) return fail(error, "That reply didn't post. You can try again.");
    const [{ data: discussion }, { data: following }] = await Promise.all([
      ctx.supabase.rpc("workspace_discussion", { p_id: id }),
      ctx.supabase.rpc("my_consult_follows"),
    ]);
    return { ok: true, data, patch: { discussion: discussion || null, following: following || [] } };
  },

  // One discussion in full, when it is opened.
  "consult.get": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("workspace_discussion", { p_id: Number(a.id) });
    if (error) return fail(error);
    return { ok: true, patch: { discussion: data || null } };
  },

  "consult.follow": async (ctx, a) => {
    const { error } = await ctx.supabase.rpc("consult_follow", { p_consultation: Number(a.id), p_on: a.on === true });
    if (error) return fail(error);
    const { data } = await ctx.supabase.rpc("my_consult_follows");
    return { ok: true, patch: { following: data || [] } };
  },

  "consult.useful": async (ctx, a) => {
    const m = /^r(\d{1,18})$/.exec(String(a.response || ""));
    if (!m) return bad("That reply isn't available.");
    const { error } = await ctx.supabase.rpc("consult_useful", { p_response: Number(m[1]), p_on: a.on === true });
    if (error) return fail(error);
    const { data } = await ctx.supabase.rpc("my_consult_useful");
    // A colleague whose reply you mark useful joins Suggested for you.
    return { ok: true, patch: { useful: data || [], ...(await slices(ctx, ["tiers"])) } };
  },

  "resource.save": async (ctx, a) => {
    const key = resourceKey(Number(a.id));
    if (!key) return bad("That resource can't be saved.");
    const { error } = await ctx.supabase.rpc("resource_save", { p_key: key, p_on: a.on === true });
    if (error) return fail(error);
    const lib = await slices(ctx, ["resources"]);
    return { ok: true, patch: { savedResources: lib.savedResources } };
  },

  // The member's own invitation link and name, for the message they copy.
  // Nothing is sent from here.
  "invite.link": async (ctx) => {
    const info = await loadInvite(ctx.supabase as any);
    return { ok: true, data: { link: info.link, first: info.firstName, mode: info.mode } };
  },

  // ---- Sandbox (demo site only; the database refuses anywhere else) --------
  // A colleague gets in touch (on the clock, or now when asked).
  "sandbox.tick": async (ctx, a) => {
    const { data, error } = await ctx.supabase.rpc("sandbox_tick", { p_force: a?.force === true });
    if (error) return fail(error);
    if (!data) return { ok: true, data: { arrival: null } };
    return { ok: true, data: { arrival: data }, patch: await slices(ctx, ["pulse", "plans", "referrals", "threads", "consult", "tiers", "known"]) };
  },

  // "Try the whole journey": a colleague answers an open request now.
  "sandbox.respond": async (ctx, a) => {
    const kind = text(a.kind, 10);
    if (!["cover", "referral"].includes(kind)) return bad("Choose cover or a referral.");
    const person = idList([a.person])[0];
    if (!person) return bad("Choose a colleague.");
    const { error } = await ctx.supabase.rpc("sandbox_respond", {
      p_kind: kind, p_ref: num(a.ref), p_case: Number.isFinite(num(a.case)) ? num(a.case) : 0, p_person: person, p_response: text(a.response, 12),
    });
    if (error) return fail(error);
    return { ok: true, patch: await slices(ctx, ["pulse", "plans", "referrals", "threads", "tiers", "known"]) };
  },

  // The other colleague confirms a handover, so an agreed client shows Handover ready.
  "sandbox.confirm": async (ctx, a) => {
    const { error } = await ctx.supabase.rpc("sandbox_confirmation", { p_plan: num(a.plan), p_case: num(a.case) });
    if (error) return fail(error);
    return { ok: true, patch: await slices(ctx, ["pulse", "plans", "threads"]) };
  },

  // Worked examples: availability confirmed N days ago, a reply in a Cover conversation.
  "sandbox.example": async (ctx, a) => {
    const name = text(a.name, 20);
    const { data, error } = await ctx.supabase.rpc("sandbox_example", { p_name: name, p_days: a.days == null ? null : Math.round(num(a.days)) });
    if (error) return fail(error);
    const patch = name === "availability" ? await slices(ctx, ["availability", "me"]) : await slices(ctx, ["threads", "pulse"]);
    return { ok: true, data, patch };
  },

  // Start the story again.
  "sandbox.reset": async (ctx) => {
    const { error } = await ctx.supabase.rpc("reset_my_sandbox");
    if (error) return fail(error);
    return { ok: true };
  },

  "draft.save": async (ctx, a) => {
    const kind = String(a.kind || "");
    if (!/^[a-z][a-z0-9:_-]{0,39}$/i.test(kind)) return { ok: false, error: "Unknown draft." };
    const { error } = await ctx.supabase.rpc("save_workspace_draft", { p_kind: kind, p_key: String(a.key || ""), p_data: a.data ?? null });
    if (error) return fail(error, "Your draft couldn't be saved just now.");
    return { ok: true };
  },
};
