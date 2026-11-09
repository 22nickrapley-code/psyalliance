// Staging stand-in for the Claude Messages API (v4 AI tests). Never used outside local staging: the app talks to it
// only when ANTHROPIC_API_URL=http://127.0.0.1:54410/v1/messages and ANTHROPIC_API_KEY is any value.
// It answers the three forced tool calls the app makes (fill_referral, fill_cover_plan, fill_cover_clients, answer)
// with simple keyword rules, so tests can check the screens without a real model. GET /__calls lists what it received.
import http from "node:http";

const PORT = 54410;
const calls = [];
const FOCUS = [["anxiety", "Anxiety/Panic Disorders"], ["depress", "Depression"], ["adhd", "ADHD"], ["trauma", "Trauma/PTSD"], ["ptsd", "Trauma/PTSD"]];
const STATES = ["NY", "MA", "VT", "RI", "CT", "NJ", "NH", "ME", "PA"];

function need(t) {
  const low = t.toLowerCase();
  const f = FOCUS.find(([k]) => low.includes(k));
  const st = STATES.find((s) => new RegExp(`\\b${s}\\b`).test(t));
  const age = /teen|adolescent/.test(low) ? "Adolescents" : /child/.test(low) ? "Children" : /adult/.test(low) ? "Adults" : "";
  return {
    focus: f ? f[1] : "", secondary: "", state: st || "", age,
    setting: /telehealth|virtual|online/.test(low) ? "virtual" : /in person|in-person/.test(low) ? "in_person" : "either",
    insurance: /aetna/.test(low) ? "AETNA Health, Inc." : "", frequency: /weekly/.test(low) ? "Weekly" : "", language: /spanish/.test(low) ? "Spanish" : "",
    city: "", prescribing: /medication|prescrib/.test(low), unmatched: /horse|equine/.test(low) ? ["equine therapy"] : [],
  };
}

function answer(tool, text) {
  if (tool === "fill_referral") return { need: need(text), timeframe: /two weeks/.test(text) ? "Within two weeks" : "" };
  if (tool === "fill_cover_plan") {
    const dates = text.match(/\d{4}-\d{2}-\d{2}/g) || [];
    return { reason: /parental|maternity|leave/.test(text.toLowerCase()) ? "extended" : /clos/.test(text.toLowerCase()) ? "closing" : "short",
      start: dates[0] || "", end: dates[1] || "", untilFurtherNotice: /further notice/.test(text), states: STATES.filter((s) => new RegExp(`\\b${s}\\b`).test(text)),
      name: /parental/.test(text.toLowerCase()) ? "Parental leave" : "Time away", clientCount: 0 };
  }
  if (tool === "fill_cover_clients") {
    const parts = text.includes("Row ") ? text.split("\n").filter((l) => l.startsWith("Row ")) : text.split(/;|\n/).filter((x) => x.trim());
    return { clients: parts.map(need) };
  }
  // v5: profile import. Echoes a city and bio, and the kind of "email" a scraped page often gives ("Email me"), which
  // the app must drop rather than let it block Save profile.
  if (tool === "extract_profile") {
    return { primary_practice_city: /Rochester/.test(text) ? "Rochester" : "", bio: "I work with adults through anxiety and life transitions, in person and by video.",
      contact_email: /Email me/.test(text) ? "Email me" : "", practice_website: /www\.[a-z-]+\.com/.exec(text)?.[0] || "", top_specialties: [] };
  }
  if (tool === "answer") {
    const q = text.split("QUESTION:\n")[1] || "";
    // v7: the assistant reads the member's own data. The mock answers from the context it was given, so a test sees the plumbing.
    let ctx = {};
    try { ctx = JSON.parse((text.split("CONTEXT:\n")[1] || "").split("\n\nQUESTION:")[0] || "{}"); } catch {}
    if (/worked with most/i.test(q) && ctx.network?.workedWithBefore?.length) {
      const w = ctx.network.workedWithBefore[0];
      return { answer: `${w.name}: ${w.timesWorkedTogether} times, most recently ${w.lastWorkedTogether}.`, sources: [], people: [w.id] };
    }
    if (/message most/i.test(q) && ctx.messaging?.length) return { answer: `${ctx.messaging[0].name}, ${ctx.messaging[0].messages} messages.`, sources: [], people: [ctx.messaging[0].id] };
    if (/top \d|find me/i.test(q) && ctx.candidates?.length) return { answer: ctx.candidates.slice(0, 3).map((c) => `- ${c.name}, ${c.city}`).join("\n"), sources: [], people: ctx.candidates.slice(0, 3).map((c) => c.id) };
    if (/who/i.test(q)) return { answer: "Here is who matches, by PsyAlliance's usual rules.", sources: ["guide:cover"], search: { kind: "cover", ...need(q) } };
    if (/continuity/i.test(q)) return { answer: "Your continuity plan names a backup colleague. Review it once a year.", sources: ["guide:continuity", "made-up:1"] };
    return { answer: "I made this up.", sources: [] };
  }
  return {};
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__calls") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(calls));
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const b = JSON.parse(body || "{}");
      const tool = b.tool_choice?.name;
      const text = b.messages?.[0]?.content || "";
      calls.push({ tool, text: String(text).slice(-2000), at: new Date().toISOString() });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ content: [{ type: "tool_use", name: tool, input: answer(tool, String(text)) }] }));
    } catch (e) {
      res.writeHead(400).end(String(e));
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`ai mock on ${PORT}`));
