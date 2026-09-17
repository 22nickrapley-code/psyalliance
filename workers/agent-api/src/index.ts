// PsyAlliance agent-query API (M4).
//
// A thin, public, agent-native front door onto `public_directory` - the
// Postgres view that already does the real work of only exposing verified,
// non-sensitive fields (see supabase/migrations/0001_m0_m1_foundation.sql).
// This Worker adds:
//   1. friendly query params instead of raw PostgREST filter syntax
//   2. grouping of the view's one-row-per-specialism join into one object
//      per psychologist
//   3. a WebMCP-style tool descriptor at /.well-known/mcp.json so an AI
//      agent (not just a human browser) can discover what this site offers
//      without being told out of band - the whole point of building this
//      "agent-native from day one," per the product's stated design goal
//   4. a stubbed paid-tier hook (X-API-Key) for future monetization. There
//      is nothing gated behind it YET - public_directory is the free
//      surface by design - but the check and the `tier` field are wired up
//      so a future gated view (scoring, endorsements, live availability)
//      has somewhere to plug in without reshaping the API.

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PAID_API_KEYS?: string;
}

type DirectoryRow = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string;
  board_certified: boolean;
  primary_practice_city: string | null;
  primary_state: string | null;
  accepting_referrals: boolean;
  category: string;
  value: string;
  rank: number | null;
};

type Psychologist = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string;
  board_certified: boolean;
  primary_practice_city: string | null;
  primary_state: string | null;
  accepting_referrals: boolean;
  treatment_specialisms: string[];
  treatment_modalities: string[];
  insurance_accepted: string[];
  languages: string[];
  session_types: string[];
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function tierFor(request: Request, env: Env): "free" | "paid" {
  const key = request.headers.get("X-API-Key");
  if (!key || !env.PAID_API_KEYS) return "free";
  const validKeys = env.PAID_API_KEYS.split(",").map((k) => k.trim());
  return validKeys.includes(key) ? "paid" : "free";
}

function groupRows(rows: DirectoryRow[]): Psychologist[] {
  const byId = new Map<string, Psychologist>();
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        credential_prefix: row.credential_prefix,
        qualification_level: row.qualification_level,
        board_certified: row.board_certified,
        primary_practice_city: row.primary_practice_city,
        primary_state: row.primary_state,
        accepting_referrals: row.accepting_referrals,
        treatment_specialisms: [],
        treatment_modalities: [],
        insurance_accepted: [],
        languages: [],
        session_types: [],
      });
    }
    const p = byId.get(row.id)!;
    if (row.category === "treatment_specialism" && !p.treatment_specialisms.includes(row.value)) {
      p.treatment_specialisms.push(row.value);
    }
    if (row.category === "treatment_modality" && !p.treatment_modalities.includes(row.value)) {
      p.treatment_modalities.push(row.value);
    }
    if (row.category === "insurance" && !p.insurance_accepted.includes(row.value)) {
      p.insurance_accepted.push(row.value);
    }
    if (row.category === "language" && !p.languages.includes(row.value)) {
      p.languages.push(row.value);
    }
    if (row.category === "session_type" && !p.session_types.includes(row.value)) {
      p.session_types.push(row.value);
    }
  }
  return Array.from(byId.values());
}

async function fetchDirectory(env: Env, filters: URLSearchParams): Promise<DirectoryRow[]> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/public_directory`);
  url.searchParams.set("select", "*");

  const state = filters.get("state");
  if (state) url.searchParams.set("primary_state", `eq.${state.toUpperCase()}`);

  const acceptingReferrals = filters.get("accepting_referrals");
  if (acceptingReferrals) url.searchParams.set("accepting_referrals", `eq.${acceptingReferrals === "true"}`);

  const qualification = filters.get("qualification_level");
  if (qualification) url.searchParams.set("qualification_level", `eq.${qualification}`);

  const res = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`directory fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function matchesValueFilters(p: Psychologist, filters: URLSearchParams): boolean {
  const specialism = filters.get("specialism");
  if (specialism && !p.treatment_specialisms.some((s) => s.toLowerCase().includes(specialism.toLowerCase()))) {
    return false;
  }
  const modality = filters.get("modality");
  if (modality && !p.treatment_modalities.some((m) => m.toLowerCase().includes(modality.toLowerCase()))) {
    return false;
  }
  const insurance = filters.get("insurance");
  if (insurance && !p.insurance_accepted.some((i) => i.toLowerCase().includes(insurance.toLowerCase()))) {
    return false;
  }
  const language = filters.get("language");
  if (language && !p.languages.some((l) => l.toLowerCase().includes(language.toLowerCase()))) {
    return false;
  }
  return true;
}

const MCP_DESCRIPTOR = {
  schema_version: "2026-01",
  name: "psyalliance_directory",
  description:
    "Search a closed, credential-verified directory of PhD/PsyD/EdD psychologists and psychiatrists. Every listed person has had their license checked by a human reviewer - this is not a self-submitted directory.",
  tools: [
    {
      name: "search_psychologists",
      description:
        "Find verified psychologists/psychiatrists matching a specialism, state, insurance, language, or qualification level.",
      endpoint: "/api/search",
      method: "GET",
      parameters: {
        type: "object",
        properties: {
          specialism: { type: "string", description: "e.g. 'Anxiety', 'Depression', 'Trauma / PTSD'" },
          modality: { type: "string", description: "e.g. 'CBT', 'EMDR'" },
          state: { type: "string", description: "Two-letter US state code, e.g. 'TX'" },
          insurance: { type: "string", description: "Insurance carrier name" },
          language: { type: "string", description: "Language spoken" },
          qualification_level: { type: "string", enum: ["PhD", "PsyD", "EdD", "MD"] },
          accepting_referrals: { type: "boolean" },
        },
      },
    },
    {
      name: "get_psychologist",
      description: "Get full public directory detail for one verified psychologist by id.",
      endpoint: "/api/psychologist/{id}",
      method: "GET",
      parameters: {
        type: "object",
        properties: { id: { type: "string", format: "uuid" } },
        required: ["id"],
      },
    },
  ],
  pricing: {
    free_tier: "Full read access to the fields above, no key required.",
    paid_tier:
      "Reserved for future gated data (scoring/endorsement signals, live availability) - not yet built. Send X-API-Key once issued.",
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/.well-known/mcp.json" || url.pathname === "/mcp") {
      return json(MCP_DESCRIPTOR);
    }

    if (url.pathname === "/api/search" && request.method === "GET") {
      try {
        const rows = await fetchDirectory(env, url.searchParams);
        const grouped = groupRows(rows).filter((p) => matchesValueFilters(p, url.searchParams));
        return json({
          tier: tierFor(request, env),
          count: grouped.length,
          results: grouped.slice(0, 50),
        });
      } catch (err) {
        return json({ error: (err as Error).message }, 502);
      }
    }

    const psychMatch = url.pathname.match(/^\/api\/psychologist\/([0-9a-fA-F-]+)$/);
    if (psychMatch && request.method === "GET") {
      try {
        const idFilter = new URLSearchParams();
        const url2 = new URL(`${env.SUPABASE_URL}/rest/v1/public_directory`);
        url2.searchParams.set("select", "*");
        url2.searchParams.set("id", `eq.${psychMatch[1]}`);
        const res = await fetch(url2.toString(), {
          headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
        });
        const rows: DirectoryRow[] = await res.json();
        const grouped = groupRows(rows);
        if (grouped.length === 0) return json({ error: "not found" }, 404);
        return json({ tier: tierFor(request, env), result: grouped[0] });
      } catch (err) {
        return json({ error: (err as Error).message }, 502);
      }
    }

    return json({ error: "not found", see: "/.well-known/mcp.json" }, 404);
  },
};
