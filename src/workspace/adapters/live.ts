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
  // Set only on the demo site, for a sandbox guest.
  sandbox?: { label: string; expiresAt: string; arrivals: { done: number; total: number } } | null;
  me: any;
  people: any[];
  known?: any[];
  tiers: { trust: string[]; worked: string[]; suggested: string[]; workedReasons: Record<string, string>; invitedBy?: string[] };
  availability: any;
  options: { focus: string[]; insurance: string[]; language: string[]; age: string[]; modality: string[] };
  plans?: any[];
  referrals?: any[];
  threads?: any[];
  inbound?: { physician?: number };
  discussions?: any[];
  resources?: any[];
  groups?: any[];
  consultQuiet?: string[];
  savedResources?: number[];
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
    previewControls: !!boot.sandbox,
    sandbox: boot.sandbox || null,
    account: { admin: !!boot.me?.isAdmin, physician: Number(boot.inbound?.physician || 0), demoSite: !!boot.demo },
    data: {
      people,
      known: boot.known || [],
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
      invitedBy: boot.tiers.invitedBy || [],
      plans: boot.plans || [],
      referrals: boot.referrals || [],
      threads: boot.threads || [],
      inbound: boot.inbound || {},
      discussions: boot.discussions || [],
      following: boot.following || [],
      useful: boot.useful || [],
      savedResources: boot.savedResources || [],
      groups: boot.groups || [],
      consultQuiet: boot.consultQuiet || [],
      dismissed: boot.dismissed || [],
      preferences: boot.preferences || {},
      drafts: boot.drafts || {},
    },
  };
}
