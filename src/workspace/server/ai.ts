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
// - Ask (v7) answers only from the member's own PsyAlliance data (network, counts, plans, referrals, discussions), the
//   Library and the product guide, and names its sources. Colleagues it suggests come only from a list the server
//   ranked by the usual matching rules. Message text is never sent, only counts.
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

const SYSTEM_ASK = `You are Ask PsyAlliance, the member's personal assistant inside PsyAlliance, a professional network for doctoral-level psychologists and psychiatrists. You answer questions about their own PsyAlliance world: their colleagues and network, who they have worked with and how often, who they message most, their cover plans and referrals (both directions), consult discussions, the Library and how the product works.
Rules:
- Answer only from the CONTEXT. It is the member's own data: network (trusted, worked with before with counts and dates, suggested, who trusts them), message counts per colleague (never message text), cover plans, referrals, consult discussions they can see, Library and a product guide. If the context does not answer the question, say so plainly and point to the closest page.
- Every answer lists the ids it used in "sources", and any colleagues it names in "people" (ids from the context, in the order you mention them).
- When asked to find colleagues ("who could...", "find me...", "top 3 in..."), choose ONLY from "candidates", which PsyAlliance has already ranked by its usual matching rules, and keep that order. Say briefly why each fits (state, setting, ages, specialty). If candidates is empty, say nobody matches and suggest widening the search. Also fill "search" with the need so the usual match list appears.
- Counting questions ("most", "how many", "next month") must use the numbers and dates in the context; do the arithmetic carefully. Today's date is {TODAY} (US Eastern).
- Never give clinical, legal, billing or licensing advice. Never repeat or ask for anything that identifies a client.
- You cannot send, change or save anything. Offer the page where the member can do it.
- Be brief and direct: one or two short sentences, or a short list (one line each, starting with "- ") when listing plans or discussions. When you name colleagues, say in one short sentence why they fit and list their ids in "people": PsyAlliance shows each one as a card under your answer, so do not list them again. Plain US English.`;

// v7 (Nick, 9 Nov): who could fit a request is still decided by PsyAlliance's matching rules, not the model:
// the server ranks colleagues from the question's state, need, ages and setting, and the model may only name
// people from that ranked list, in order. Message text never leaves the database; only counts per colleague do.
const STATE_NAMES: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia" };
const FOCUS_WORDS: [RegExp, string][] = [[/\bocd\b|obsess/i, "Obsessive/Compulsive Disorder"], [/ptsd|trauma/i, "Trauma/PTSD"], [/anxi|panic/i, "Anxiety/Panic Disorders"], [/depress/i, "Depression"], [/grief|bereave/i, "Grief/Loss"], [/eating|anorex|bulim/i, "Eating Disorders"], [/addict|substance|alcohol/i, "Addictions"], [/bipolar/i, "Bipolar Disorder"], [/adhd/i, "ADHD"], [/autis/i, "Autism"], [/couple|marri|divorce/i, "Marriage & Divorce"], [/sleep|insomnia/i, "Sleep Disorders"], [/personality/i, "Personality Disorders"], [/dementia|alzheim/i, "Alzheimer’s/Dementia"], [/burnout/i, "Burnout"], [/life transition/i, "Life Transitions"], [/self.?harm/i, "Self-harm"], [/phobia/i, "Phobias"], [/pain/i, "Pain Management"], [/lgbt/i, "LGBTQ Issues"], [/parenting/i, "Parenting Issues"], [/stress/i, "Stress"]];

function readAsk(q: string, focusList: string[]) {
  const states = new Set<string>();
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    const full = new RegExp(`(?<!west )\\b${name}\\b`, "i").test(q);
    const short = !["IN", "OR", "ME", "OK", "HI"].includes(code) && new RegExp(`\\b${code}\\b`).test(q);
    if (full || short) states.add(code);
  }
  const focus = new Set<string>();
  for (const [re, f] of FOCUS_WORDS) if (re.test(q) && focusList.includes(f)) focus.add(f);
  for (const f of focusList) if (f.length > 4 && q.toLowerCase().includes(f.toLowerCase())) focus.add(f);
  const ages = /child|kid/i.test(q) ? "Children" : /teen|adolesc/i.test(q) ? "Adolescents" : /young adult/i.test(q) ? "Young Adults" : /senior|older adult|elder/i.test(q) ? "Seniors" : /adult/i.test(q) ? "Adults" : "";
  const setting = /remote|virtual|tele|video|online/i.test(q) ? "virtual" : /in.?person|office|face to face/i.test(q) ? "in_person" : "";
  return { states: [...states], focus: [...focus], ages, setting };
}

async function ask(ctx: Ctx, a: any): Promise<Result> {
  const q = clip(a?.question, 500);
  if (q.length < 3) return { ok: false, error: "Type a question first." };
  const idErr = identifierError(q);
  if (idErr) return { ok: false, error: idErr };
  const use = await takeUse(ctx, "ask");
  if ("ok" in use) return use;

  const [data, opts] = await Promise.all([slices(ctx, ["plans", "referrals", "resources", "tiers", "threads", "consult", "people", "year"]), loadNeedOptions(ctx.supabase as any)]);
  const people = new Map<string, any>(((data.people as any[]) || []).map((p) => [String(p.id), p]));
  const nameOf = (id: string) => people.get(String(id))?.name || "A colleague";
  const pid = (id: string) => `person:${id}`;
  const card = (p: any) => {
    const lic = p.licenses && typeof p.licenses === "object" ? p.licenses : {};
    return {
      id: pid(p.id), name: p.name, credential: p.credential || "", role: p.role || "", city: p.city || "", homeState: p.state || "",
      licensedIn: Object.keys(lic), virtual: Object.values(lic).some((l: any) => l?.virtual), inPerson: Object.values(lic).some((l: any) => l?.inPerson),
      ages: p.ages || [], specialties: (p.specialties || []).slice(0, 5), languages: (p.languages || []).filter((x: string) => x !== "English").slice(0, 3),
      referrals: p.selectedOnly ? "selected referrals only" : p.slots ? `accepting, about ${p.slots} spaces` : "at capacity", cover: p.cover || "", consult: p.consult === false ? "not answering" : "open",
    };
  };
  const tiers = (data.tiers as any) || {};
  const collab = tiers.collab || {}, workedAt = tiers.workedAt || {};
  const worked = Array.from(new Set<string>([...(tiers.worked || []), ...Object.keys(collab)]))
    .map((id) => ({ id: pid(id), name: nameOf(id), timesWorkedTogether: Number(collab[id]) || 1, lastWorkedTogether: String(workedAt[id] || "").slice(0, 10) }))
    .sort((x, y) => y.timesWorkedTogether - x.timesWorkedTogether || y.lastWorkedTogether.localeCompare(x.lastWorkedTogether));
  const msgCount = new Map<string, { n: number; last: string; threads: number }>();
  for (const t of (data.threads as any[]) || []) {
    if (t.group || !t.person) continue;
    const c = msgCount.get(t.person) || { n: 0, last: "", threads: 0 };
    c.n += Number(t.pulse?.count) || (t.messages || []).length; c.threads += 1;
    const at = String(t.activityAt || ""); if (at > c.last) c.last = at;
    msgCount.set(t.person, c);
  }
  const messaging = [...msgCount.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 12)
    .map(([id, c]) => ({ id: pid(id), name: nameOf(id), messages: c.n, conversations: c.threads, lastMessage: c.last.slice(0, 10) }));
  const network = {
    trusted: (tiers.trust || []).map((id: string) => ({ id: pid(id), name: nameOf(id), since: String((tiers.trustSince || {})[id] || "").slice(0, 10) })),
    workedWithBefore: worked,
    suggested: (tiers.suggested || []).slice(0, 10).map((id: string) => ({ id: pid(id), name: nameOf(id) })),
    trustYou: (tiers.trustedBy || []).map((id: string) => ({ id: pid(id), name: nameOf(id) })),
  };

  // Candidates for "find me..." questions, ranked by the usual rules: licensed in the state, the need, ages, setting.
  const want = readAsk(q, opts.focus.map((x) => x.value));
  const findish = /\b(find|who (could|can|might|would)|top \d|best|recommend|someone|colleague|specialis|speciali[sz]e|deals? with|works? with|sees?)\b/i.test(q) && (want.states.length || want.focus.length || want.ages || want.setting);
  const trusted = new Set<string>(tiers.trust || []), workedSet = new Set<string>(worked.map((w) => w.id.slice(7)));
  const candidates = !findish ? [] : [...people.values()].map((p) => {
    const lic = p.licenses && typeof p.licenses === "object" ? p.licenses : {};
    const inState = !want.states.length || want.states.some((s) => lic[s] || p.state === s);
    const specs: string[] = p.specialties || [];
    const top = want.focus.length && want.focus.includes(specs[0]);
    const anyFocus = !want.focus.length || want.focus.some((f) => specs.includes(f));
    const ageOk = !want.ages || (p.ages || []).includes(want.ages);
    const lics = want.states.length ? want.states.map((s) => lic[s]).filter(Boolean) : Object.values(lic);
    const settingOk = !want.setting || lics.some((l: any) => (want.setting === "virtual" ? l?.virtual : l?.inPerson));
    if (!inState || !anyFocus || !ageOk || !settingOk) return null;
    const fresh = p.confirmedAt && Date.now() - new Date(p.confirmedAt).getTime() < 60 * 864e5;
    const score = (top ? 4 : 0) + (want.focus.length ? 2 : 0) + (trusted.has(p.id) ? 2 : 0) + (workedSet.has(p.id) ? 1 : 0) + (fresh ? 1 : 0) + (p.slots && !p.selectedOnly ? 1 : 0) - (p.pausedUntil ? 3 : 0);
    return { p, score };
  }).filter(Boolean).sort((x: any, y: any) => y.score - x.score || String(x.p.name).localeCompare(String(y.p.name))).slice(0, 10).map((x: any) => card(x.p));

  const ownPlans = ((data.plans as any[]) || []).filter((p) => p.owner === "me").slice(0, 20).map((p) => ({
    id: `plan:${p.id}`, name: p.name, status: p.status, from: p.start, to: p.openEnded ? "until further notice" : p.end,
    clients: (p.clients || []).map((c: any) => `${c.label} (${c.focus}, ${c.state}): ${c.assignee ? `covered by ${nameOf(c.assignee)}` : c.status}`).join("; "), link: `/dashboard/cover?plan=${p.id}`,
  }));
  const otherPlans = ((data.plans as any[]) || []).filter((p) => p.owner !== "me").slice(0, 15).map((p) => ({
    id: `plan:${p.id}`, name: p.name, by: nameOf(p.owner), status: p.status, from: p.start, to: p.end,
    yourPart: (p.clients || []).map((c: any) => { const mine = (c.requests || []).find((r: any) => r.person === "me"); return `${c.label}: ${c.assignee === "me" ? "you are covering" : mine ? mine.status : c.status}`; }).join("; "), link: `/dashboard/cover?plan=${p.id}`,
  }));
  const refs = ((data.referrals as any[]) || []).slice(0, 25).map((r) => ({
    id: `referral:${r.id}`, label: r.title || r.label || r.focus, direction: r.owner === "me" ? "you are referring" : `referred to you by ${nameOf(r.owner)}`, need: r.focus, state: r.state,
    status: r.status, sent: String(r.createdAt || r.sentAt || "").slice(0, 10), replies: (r.requests || []).map((x: any) => `${x.person === "me" ? "you" : nameOf(x.person)}: ${x.status}`).join("; "), link: `/dashboard/referrals?referral=${r.id}`,
  }));
  const cons = (data.consult as any) || {};
  const discussions = ((cons.discussions as any[]) || []).slice(0, 40).map((d) => ({
    id: `discussion:${d.id}`, title: d.title, askedBy: d.person === "me" ? "you" : nameOf(d.person), topic: (d.tags || [d.tag]).filter(Boolean).join(", "), status: d.status,
    question: clip(d.text, 240), replies: ((d.history || []) as any[]).filter((h) => h.type === "reply").slice(0, 4).map((h) => `${h.person === "me" ? "you" : nameOf(h.person)}: ${clip(h.text, 160)}`), link: `/dashboard/consult?discussion=${d.id}`,
  }));
  const groups = ((cons.groups as any[]) || []).map((g) => ({ id: `group:${g.id}`, name: g.name, purpose: clip(g.purpose, 160), cadence: g.cadence, members: (g.members || []).map(nameOf), link: "/dashboard/consult" }));
  const lib = ((data.resources as any[]) || []).slice(0, 40).map((r) => ({ id: `library:${r.id}`, title: r.title, about: clip(r.description, 160), link: `/dashboard/library?resource=${r.id}` }));
  const guide = GUIDE.map((g) => ({ id: `guide:${g.id}`, title: g.title, text: g.text, link: g.link }));
  const context = JSON.stringify({ network, messaging, candidates, yourCoverPlans: ownPlans, coverColleaguesAskedYouAbout: otherPlans, referrals: refs, consultDiscussions: discussions, consultGroups: groups, thisYear: data.year || null, library: lib, guide });

  const known = new Map<string, { label: string; link: string }>();
  for (const g of guide) known.set(g.id, { label: g.title, link: g.link });
  for (const p of [...ownPlans, ...otherPlans]) known.set(p.id, { label: p.name, link: p.link });
  for (const r of refs) known.set(r.id, { label: String(r.label || "Referral"), link: r.link });
  for (const d of discussions) known.set(d.id, { label: d.title, link: d.link });
  for (const g of groups) known.set(g.id, { label: g.name, link: g.link });
  for (const l of lib) known.set(l.id, { label: l.title, link: l.link });
  const personIds = new Set<string>([...network.trusted, ...network.workedWithBefore, ...network.suggested, ...network.trustYou, ...messaging, ...candidates].map((x: any) => x.id));
  for (const id of personIds) known.set(id, { label: nameOf(id.slice(7)), link: `/dashboard/network?profile=${id.slice(7)}` });

  try {
    const o = { focus: opts.focus.map((x) => x.value), states: opts.states.map((s) => s.code), ages: opts.ageBands, insurance: opts.insurance.map((x) => x.value), languages: opts.language.map((x) => x.value) };
    const res: any = await extractStructuredData({
      system: SYSTEM_ASK.replace("{TODAY}", today()),
      userContent: `CONTEXT:\n${context}\n\nQUESTION:\n${q}`,
      toolName: "answer",
      toolDescription: "The answer shown to the member.",
      inputSchema: {
        type: "object",
        properties: {
          answer: { type: "string", description: "The short answer, from the context only. A short list uses one line per item starting with '- '." },
          sources: { type: "array", items: { type: "string" }, description: "Ids from the context that the answer used (plans, referrals, discussions, groups, library, guide)." },
          people: { type: "array", items: { type: "string" }, description: "person: ids of colleagues the answer names, in the order named. At most 6." },
          search: {
            type: "object",
            description: "Only for questions about finding colleagues: the need to match. Omit otherwise.",
            properties: { kind: { type: "string", enum: ["cover", "referral", "consult"] }, ...((needSchema(o) as any).properties) },
          },
        },
        required: ["answer", "sources"],
      },
    });
    const sources = (Array.isArray(res?.sources) ? res.sources : []).map(String).filter((s: string) => known.has(s) && !s.startsWith("person:")).slice(0, 5)
      .map((id: string) => ({ id, ...known.get(id)! }));
    const named = (Array.isArray(res?.people) ? res.people : []).map(String).filter((s: string) => personIds.has(s)).slice(0, 6).map((s: string) => s.slice(7));
    let search: any = null;
    if (res?.search && typeof res.search === "object" && candidates.length) {
      const need = cleanNeed(res.search, o);
      if (need.focus || need.state) search = { kind: ["cover", "referral", "consult"].includes(res.search.kind) ? res.search.kind : "referral", need };
    }
    let answer = clip(res?.answer, 1200);
    // An answer with nothing behind it isn't shown as fact.
    if (!sources.length && !named.length && !search) answer = "I can’t find that in your PsyAlliance records. Try Network / Search, or ask me about your colleagues, plans, referrals or discussions.";
    return { ok: true, data: { answer, sources, people: named, search, left: use.left } };
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
