// Thin, dependency-free wrapper around the Claude Messages API, used to turn
// unstructured text a user pastes or uploads (a bio, a caseload export) into
// structured data we can trust enough to pre-fill a form with. Plain fetch
// rather than the @anthropic-ai/sdk package, on purpose: this runs inside a
// Cloudflare Worker (via OpenNext), and a raw fetch call is guaranteed to
// work there with zero bundle-size or edge-runtime-compatibility risk.
//
// Requires an ANTHROPIC_API_KEY environment variable (set as a Cloudflare
// secret in production, and in .env.local for local dev) - see
// docs/ai-import-setup.md. Everything that calls this must be prepared for
// it to throw (missing key, network error, or the model returning something
// that doesn't validate) and turn that into a friendly inline message rather
// than a crashed page, since this is always optional, user-triggered
// convenience, never on the required path to using the product.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // cheap/fast - plenty for structured extraction

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI import isn't configured yet - ask your admin to add an ANTHROPIC_API_KEY.");
    this.name = "AiNotConfiguredError";
  }
}

/**
 * Calls Claude with a single forced tool call and returns that tool's
 * parsed `input` object - the standard reliable pattern for getting
 * structured JSON out of the model instead of free-form prose we'd then
 * have to parse ourselves.
 */
export async function extractStructuredData<T = Record<string, unknown>>(opts: {
  system: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.userContent }],
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: opts.inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error (${response.status}): ${bodyText.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const toolUse = (data.content || []).find((block: any) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("The model didn't return structured data - try again with more detail in the text.");
  }
  return toolUse.input as T;
}
