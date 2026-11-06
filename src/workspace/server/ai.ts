import { identifierError } from "@/lib/deidentify";
import { friendly } from "@/lib/friendly-error";
import { extractStructuredData, AiNotConfiguredError } from "@/lib/ai/anthropic";
import { loadNeedOptions } from "@/lib/need-options";
import { slices, type Ctx, type Result } from "./handlers";

// PsyAlliance AI (v4, Nick 6 Nov). Everything AI lives in this file and in the block marked "AI (v4)" in the
// workspace engine. It is off unless an admin switches "AI tech enabled" on for this site, and every call first asks
// the database (ai_take) whether AI is on and takes one of the member's 20 daily uses, so the switch works at once,
// without a rebuild. To remove AI entirely: delete this file, its line in handlers.ts, the engine block, the admin
// page and migration 0130 section 1.
//
// Rules the code enforces, not just the prompt:
// - Nothing is sent or saved by AI. Smart requests return suggested field values for the member to check; Ask
//   returns an answer and links. The member presses every button.
// - Suggested values must come from PsyAlliance's own lists; anything else comes back as "not matched".
// - Text that carries client identifiers (contact details, full dates, record numbers, addresses) is refused before
//   it reaches the model. Names can't be detected reliably, so the screens ask the member to leave them out.
// - Ask answers only from the member's own plans and referrals, the Library and the product guide below, and every
//   answer names its sources. Who to ask is decided by the usual matching rules in the browser, never by the model.
// - Members' text isn't stored here.

const MAX_TYPED = 2000;
const MAX_FILE = 20000;

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const SETTINGS = ["either", "virtual", "in_person"] as const;
const FREQUENCIES = ["Weekly", "Every two weeks", "Monthly", "As needed"];
const TIMEFRAMES = ["As soon as possible", "Within two weeks", "Within a month", "Flexible"];
const REASONS = ["short", "extended", "unexpected", "closing", "reciprocal", "other"];

async function takeUse(ctx: Ctx, kind: "smart" | "ask"): Promise<{ left: number } | Result> {
  const { data, error } = await ctx.supabase.rpc("ai_take", { p_kind: kind });
  if (error) return { ok: false, error: friendly(error, "AI isn't available right now. The form works as usual.") };
  return { left: Number(data) };
}

function modelError(e: unknown): Result {
  if (e instanceof AiNotConfiguredError) return { ok: false, error: "AI isn't set up on this site yet. The form works as usual." };
  console.error("ai:", e instanceof Error ? e.message : e);
  return { ok: false, error: "AI couldn't read that just now. Please try again, or fill in the form as usual." };
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// One client need, in the fields the forms use.
const needSchema = (opts: { focus: string[]; states: string[]; ages: string[]; insurance: string[]; languages: string[] }) => ({
  type: "object",
  properties: {
    focus: { type: "string", description: `Main treatment need. Exactly one of: ${opts.focus.join(" | ")}. Empty if unclear.` },
    secondary: { type: "string", description: "A second treatment need from the same list, or empty." },
    state: { type: "string", description: `Two-letter US state the client is in. One of: ${opts.states.join(", ")}. Empty if not said.` },
    age: { type: "string", description: `Age band. One of: ${opts.ages.join(" | ")}. Empty if not said.` },
    setting: { type: "string", enum: [...SETTINGS], description: "virtual, in_person, or either (default either)." },
    insurance: { type: "string", description: `Insurance, exactly as one of: ${opts.insurance.slice(0, 200).join(" | ")}. Empty if self-pay, unsure or not said.` },
    frequency: { type: "string", description: `Session frequency for cover. One of: ${FREQUENCIES.join(" | ")}. Empty if not said.` },
    language: { type: "string", description: `Language other than English if one is needed. One of: ${opts.languages.join(" | ")}. Empty otherwise.` },
    city: { type: "string", description: "City, only if the member said one. Empty otherwise." },
    prescribing: { type: "boolean", description: "True only if medication management or prescribing is needed." },
    unmatched: { type: "array", items: { type: "string" }, description: "Requirements the member mentioned that fit none of the lists, in a few words each." },
  },
  required: ["focus", "state", "setting", "prescribing", "unmatched"],
});

// Keep only values that are on PsyAlliance's lists; anything else is reported as not matched.
function cleanNeed(n: any, o: { focus: string[]; states: string[]; ages: string[]; insurance: string[]; languages: string[] }) {
  const unmatched: string[] = Array.isArray(n?.unmatched) ? n.unmatched.map((x: unknown) => clip(x, 80)).filter(Boolean).slice(0, 6) : [];
  const pick = (v: unknown, list: string[], label: string) => {
    const s = clip(v, 120);
    if (!s) return "";
    const hit = list.find((x) => x.toLowerCase() === s.toLowerCase());
    if (!hit) unmatched.push(`${label}: ${s}`);
    return hit || "";
  };
  const out = {
    focus: pick(n?.focus, o.focus, "Main need"),
    secondary: pick(n?.secondary, o.focus, "Second need"),
    state: pick(String(n?.state || "").toUpperCase(), o.states, "State"),
    age: pick(n?.age, o.ages, "Age band"),
    setting: SETTINGS.includes(n?.setting) ? n.setting : "either",
    insurance: pick(n?.insurance, o.insurance, "Insurance"),
    frequency: pick(n?.frequency, FREQUENCIES, "Frequency"),
    language: pick(n?.language, o.languages, "Language"),
    city: clip(n?.city, 60),
    prescribing: n?.prescribing === true,
    unmatched: Array.from(new Set(unmatched)).slice(0, 8),
  };
  if (out.secondary === out.focus) out.secondary = "";
  return out;
}

const SYSTEM_SMART = `You turn a psychologist's short description of a professional need into structured form fields for PsyAlliance, a network where clinicians arrange cover, referrals and consultation with each other.
Rules:
- Only fill a field when the text clearly supports it. Leave it empty rather than guess. Never invent a state, date, insurer or need.
- Use the exact spellings from the lists you are given. If a requirement fits no list value, put it in "unmatched".
- The text must not identify any client. If it contains a name, initials, a date of birth or contact details, ignore them and do not repeat them anywhere.
- Never give clinical advice. You only fill in the form.
- Today's date is ${"{TODAY}"} (US Eastern). Interpret relative dates from it.`;

async function suggest(ctx: Ctx, a: any): Promise<Result> {
  const kind = String(a?.kind || "");
  if (!["referral", "cover-plan", "cover-clients"].includes(kind)) return { ok: false, error: "Unknown form." };
  const source = a?.source === "file" ? "file" : a?.source === "voice" ? "voice" : "typed";
  const text = clip(a?.text, source === "file" ? MAX_FILE : MAX_TYPED);
  if (text.length < 4) return { ok: false, error: "Describe the need in a few words first." };
  const idErr = identifierError(text);
  if (idErr) return { ok: false, error: idErr };
  const use = await takeUse(ctx, "smart");
  if ("ok" in use) return use;

  const opts = await loadNeedOptions(ctx.supabase as any);
  const o = {
    focus: opts.focus.map((x) => x.value),
    states: opts.states.map((s) => s.code),
    ages: opts.ageBands,
    insurance: opts.insurance.map((x) => x.value),
    languages: opts.language.map((x) => x.value),
  };
  const system = SYSTEM_SMART.replace("{TODAY}", today());
  try {
    if (kind === "referral") {
      const res: any = await extractStructuredData({
        system,
        userContent: `A referral: the member wants to refer a client to a colleague. Their description:\n\n${text}`,
        toolName: "fill_referral",
        toolDescription: "The referral form fields.",
        inputSchema: {
          type: "object",
          properties: {
            need: needSchema(o),
            timeframe: { type: "string", description: `When the client needs to start. One of: ${TIMEFRAMES.join(" | ")}. Empty if not said.` },
          },
          required: ["need"],
        },
      });
      const need = cleanNeed(res?.need, o);
      const timeframe = TIMEFRAMES.includes(res?.timeframe) ? res.timeframe : "";
      return { ok: true, data: { need, timeframe, left: use.left } };
    }
    if (kind === "cover-plan") {
      const res: any = await extractStructuredData({
        system,
        userContent: `A cover plan: the member will be away and needs colleagues to cover their clients. Their description:\n\n${text}`,
        toolName: "fill_cover_plan",
        toolDescription: "The cover plan's first step.",
        inputSchema: {
          type: "object",
          properties: {
            reason: { type: "string", enum: REASONS, description: "short = short planned absence; extended = extended leave such as parental or medical leave; unexpected; closing = closing or reducing practice; reciprocal = an ongoing arrangement with a colleague; other." },
            start: { type: "string", description: "First day away, YYYY-MM-DD. Empty if not said." },
            end: { type: "string", description: "Last day away, YYYY-MM-DD. Empty if not said or open-ended." },
            untilFurtherNotice: { type: "boolean", description: "True if the member said it has no end date yet." },
            states: { type: "array", items: { type: "string" }, description: "Two-letter states the clients are in." },
            name: { type: "string", description: "A short plan name such as 'Spring parental leave'. No client details." },
            clientCount: { type: "integer", description: "How many clients need cover, if said. 0 otherwise." },
          },
          required: ["reason"],
        },
      });
      const iso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
      const states = Array.isArray(res?.states) ? res.states.map((s: unknown) => String(s).toUpperCase()).filter((s: string) => o.states.includes(s)).slice(0, 10) : [];
      const reason = REASONS.includes(res?.reason) ? res.reason : "short";
      let start = iso(res?.start), end = iso(res?.end);
      if (start && end && end < start) end = "";
      return {
        ok: true,
        data: {
          plan: {
            reason, start, end,
            untilFurtherNotice: !!res?.untilFurtherNotice && (reason === "closing" || reason === "reciprocal"),
            states,
            name: clip(res?.name, 60),
            clientCount: Math.max(0, Math.min(20, Number(res?.clientCount) || 0)),
          },
          left: use.left,
        },
      };
    }
    // cover-clients: several anonymous client needs from a description or a de-identified file.
    const res: any = await extractStructuredData({
      system: system + "\n- Each client becomes one entry. Up to 20. Never include a name or identifier in any field.",
      userContent: `The member's clients who need cover while they are away (${source === "file" ? "from a file they uploaded, with identifying columns already removed" : "in their own words"}):\n\n${text}`,
      toolName: "fill_cover_clients",
      toolDescription: "One entry per client who needs cover.",
      inputSchema: { type: "object", properties: { clients: { type: "array", items: needSchema(o), maxItems: 20 } }, required: ["clients"] },
    });
    const clients = (Array.isArray(res?.clients) ? res.clients : []).slice(0, 20).map((c: any) => cleanNeed(c, o));
    return { ok: true, data: { clients, left: use.left } };
  } catch (e) {
    return modelError(e);
  }
}

// What Ask PsyAlliance knows about the product, so how-to answers have a source too.
const GUIDE: { id: string; title: string; text: string; link: string }[] = [
  { id: "cover", title: "Cover", link: "/dashboard/cover", text: "Plan cover for time away: choose the reason and dates, add up to 20 anonymous client needs, choose colleagues for each client, then send. Colleagues reply I can cover, Ask a question or Not available. You agree a colleague for each client; after a discussion alone the colleague confirms with one tap. Confirm cover arranged once every client has an agreed colleague and a ready handover. The plan stays active until the absence ends." },
  { id: "referrals", title: "Referrals", link: "/dashboard/referrals", text: "Refer a client: describe the main need and the client's state, see matched colleagues, choose selected colleagues, trusted colleagues or the whole network, and send. Selected or trusted colleagues can be asked one at a time in your order with a reply deadline. Colleagues reply I can accept this referral, Ask a question or Not available. Agree one colleague; then Close moves it to Completed." },
  { id: "consult", title: "Consult", link: "/dashboard/consult", text: "Ask a de-identified question of chosen colleagues, a group or the network. Tabs: All discussions, Active, Resolved, Following. Mark a discussion resolved when it is answered. Consultation groups have a charter, meeting details and a group chat." },
  { id: "availability", title: "Availability", link: "/dashboard/availability", text: "Set whether you take referrals, cover and consultation, and how many spaces you have. Confirmed within 60 days ranks normally; 60 to 120 days shows as not recently confirmed; after 120 days you drop out of suggestions. The Hub has quick controls under the three service cards." },
  { id: "continuity", title: "Continuity plan", link: "/dashboard/continuity", text: "Your practice continuity plan names a backup colleague and what they would need if you were suddenly unable to practice. Review it once a year; Still correct records the review without changes." },
  { id: "network", title: "Network / Search", link: "/dashboard/network", text: "Trusted colleagues, colleagues you have worked with before (filter by how recently) and colleagues suggested by PsyAlliance. Open a profile to message, refer, ask for cover, trust, exclude from suggestions or block." },
  { id: "library", title: "Library", link: "/dashboard/library", text: "Practice templates and guides. Open the PDF, download it, or Save to My Files, which puts a copy in a PsyAlliance documents folder." },
  { id: "membership", title: "Membership", link: "/dashboard/settings", text: "After your license is verified, Activate membership in Actions. The first 40 members to activate in each state are founding members, free for life; after that membership is $30 a month. Nobody is charged yet." },
];

const SYSTEM_ASK = `You are Ask PsyAlliance, a read-only helper inside PsyAlliance, a professional network for licensed psychologists and psychiatrists. You help a member find their way around the product and their own work.
Rules:
- Answer only from the CONTEXT you are given: the product guide, the member's own cover plans and referrals, and the Library list. Every answer must list the sources it used, by their ids from the context. If the context does not answer the question, say plainly that you don't know and point to the closest page.
- For "who could cover / take / help with ..." questions, do not name or rank colleagues. Fill "search" with the need instead; PsyAlliance's usual matching rules will list colleagues.
- Never give clinical, legal, billing or licensing advice. Say that the Library's "Before you use it" notes and their own professional judgement apply.
- Never repeat or ask for anything that identifies a client.
- You cannot send, change or save anything. Offer the page where the member can do it.
- Be brief: at most four short sentences. Plain US English.
- Today's date is {TODAY} (US Eastern).`;

async function ask(ctx: Ctx, a: any): Promise<Result> {
  const q = clip(a?.question, 500);
  if (q.length < 3) return { ok: false, error: "Type a question first." };
  const idErr = identifierError(q);
  if (idErr) return { ok: false, error: idErr };
  const use = await takeUse(ctx, "ask");
  if ("ok" in use) return use;

  const [data, opts] = await Promise.all([slices(ctx, ["plans", "referrals", "resources"]), loadNeedOptions(ctx.supabase as any)]);
  const plans = ((data.plans as any[]) || []).filter((p) => p.owner === "me").slice(0, 15).map((p) => ({
    id: `plan:${p.id}`, name: p.name, status: p.status, from: p.start, to: p.openEnded ? "until further notice" : p.end,
    clients: (p.clients || []).map((c: any) => `${c.label}: ${c.status}`).join("; "), link: `/dashboard/cover?plan=${p.id}`,
  }));
  const coverForOthers = ((data.plans as any[]) || []).filter((p) => p.owner !== "me").slice(0, 10).map((p) => ({
    id: `plan:${p.id}`, name: "Cover a colleague asked you about", status: p.status, from: p.start, to: p.end,
    clients: (p.clients || []).map((c: any) => `${c.label}: ${c.status}`).join("; "), link: `/dashboard/cover?plan=${p.id}`,
  }));
  const refs = ((data.referrals as any[]) || []).slice(0, 20).map((r) => ({
    id: `referral:${r.id}`, label: r.label, direction: r.owner === "me" ? "you are referring" : "referred to you", need: r.focus, state: r.state,
    status: r.status, replies: (r.requests || []).map((x: any) => x.status).join(", "), link: `/dashboard/referrals?referral=${r.id}`,
  }));
  const lib = ((data.resources as any[]) || []).slice(0, 40).map((r) => ({ id: `library:${r.id}`, title: r.title, about: clip(r.description, 200), link: `/dashboard/library?resource=${r.id}` }));
  const guide = GUIDE.map((g) => ({ id: `guide:${g.id}`, title: g.title, text: g.text, link: g.link }));
  const context = JSON.stringify({ guide, yourCoverPlans: plans, coverYouWereAskedAbout: coverForOthers, referrals: refs, library: lib });
  const known = new Map<string, { label: string; link: string }>();
  for (const g of guide) known.set(g.id, { label: g.title, link: g.link });
  for (const p of [...plans, ...coverForOthers]) known.set(p.id, { label: p.name, link: p.link });
  for (const r of refs) known.set(r.id, { label: r.label, link: r.link });
  for (const l of lib) known.set(l.id, { label: l.title, link: l.link });

  try {
    const res: any = await extractStructuredData({
      system: SYSTEM_ASK.replace("{TODAY}", today()),
      userContent: `CONTEXT:\n${context}\n\nQUESTION:\n${q}`,
      toolName: "answer",
      toolDescription: "The answer shown to the member.",
      inputSchema: {
        type: "object",
        properties: {
          answer: { type: "string", description: "The short answer, from the context only." },
          sources: { type: "array", items: { type: "string" }, description: "Ids from the context that the answer used." },
          search: {
            type: "object",
            description: "Only for questions about finding colleagues: the need to match. Omit otherwise.",
            properties: {
              kind: { type: "string", enum: ["cover", "referral", "consult"] },
              ...((needSchema({ focus: opts.focus.map((x) => x.value), states: opts.states.map((s) => s.code), ages: opts.ageBands, insurance: opts.insurance.map((x) => x.value), languages: opts.language.map((x) => x.value) }) as any).properties),
            },
          },
        },
        required: ["answer", "sources"],
      },
    });
    const sources = (Array.isArray(res?.sources) ? res.sources : []).map(String).filter((s: string) => known.has(s)).slice(0, 5)
      .map((id: string) => ({ id, ...known.get(id)! }));
    let search: any = null;
    if (res?.search && typeof res.search === "object") {
      const o = { focus: opts.focus.map((x) => x.value), states: opts.states.map((s) => s.code), ages: opts.ageBands, insurance: opts.insurance.map((x) => x.value), languages: opts.language.map((x) => x.value) };
      const need = cleanNeed(res.search, o);
      if (need.focus || need.state) search = { kind: ["cover", "referral", "consult"].includes(res.search.kind) ? res.search.kind : "referral", need };
    }
    let answer = clip(res?.answer, 900);
    // An answer without a source isn't shown as fact.
    if (!sources.length && !search) answer = "I don't know that from your records, the Library or the PsyAlliance guide. Try the Library, or ask a colleague in Consult.";
    return { ok: true, data: { answer, sources, search, left: use.left } };
  } catch (e) {
    return modelError(e);
  }
}

export const aiHandlers: Record<string, (ctx: Ctx, a: any) => Promise<Result>> = {
  "ai.status": async (ctx) => {
    const { data, error } = await ctx.supabase.rpc("ai_status");
    if (error) return { ok: true, data: { enabled: false, left: 0 } };
    return { ok: true, data };
  },
  "ai.suggest": suggest,
  "ai.ask": ask,
};
