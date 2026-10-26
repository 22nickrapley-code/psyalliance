export type Lead = {
  id: number;
  created_at: string;
  library_code: string;
  full_name: string;
  email: string;
  role: string;
  state: string | null;
  intent: "download" | "notify";
  source: string | null;
};

export type LeadsData = { leads: Lead[]; joins: Record<string, number> };

export function filterLeads(leads: Lead[], doc: string, intent: string) {
  return leads.filter((l) => (!doc || l.library_code === doc) && (!intent || l.intent === intent));
}
