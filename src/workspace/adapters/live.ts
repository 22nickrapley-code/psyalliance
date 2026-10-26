import { US_STATES } from "@/lib/us-states";

// The shape of what the server sends for the member's workspace, and how it
// becomes the engine's data and starting state. Safe to import from the
// browser: no server code here.
export type WorkspaceView = "home" | "cover" | "referrals" | "consult" | "network" | "messages" | "library";

export type LiveBoot = {
  gate: "ok";
  serverNow: string;
  userId: string;
  demo: boolean;
  me: any;
  people: any[];
  tiers: { trust: string[]; worked: string[]; suggested: string[]; workedReasons: Record<string, string> };
  availability: any;
  options: { focus: string[]; insurance: string[]; language: string[]; age: string[]; modality: string[] };
  plans?: any[];
  referrals?: any[];
  threads?: any[];
  discussions?: any[];
  resources?: any[];
  following?: number[];
  useful?: string[];
  dismissed?: string[];
  preferences?: Record<string, boolean>;
  drafts?: Record<string, any>;
  [k: string]: any;
};

export function buildLiveEnv(boot: LiveBoot, view: WorkspaceView) {
  const states: Record<string, string> = {};
  for (const s of US_STATES) states[s.code] = s.name;
  const people = boot.people;
  return {
    mode: "live" as const,
    view,
    me: boot.me,
    previewControls: false,
    data: {
      people,
      discussions: boot.discussions || [],
      resources: boot.resources || [],
      threads: boot.threads || [],
      options: { ...boot.options, states },
    },
    initial: {
      availability: boot.availability,
      trust: boot.tiers.trust,
      worked: boot.tiers.worked,
      suggested: boot.tiers.suggested,
      plans: boot.plans || [],
      referrals: boot.referrals || [],
      threads: boot.threads || [],
      discussions: boot.discussions || [],
      following: boot.following || [],
      useful: boot.useful || [],
      dismissed: boot.dismissed || [],
      preferences: boot.preferences || {},
    },
  };
}
