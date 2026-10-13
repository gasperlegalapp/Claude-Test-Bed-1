import { WORKFLOW_SCHEMA, generateWorkflow, systemPrompt } from "../generate.ts";
import { ENGAGEMENT_LETTER } from "../../data/samples.ts";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; $defs?: Record<string, Schema> };

// Structured outputs need every object closed and every property listed as required.
function objects(s: Schema, out: Schema[] = []): Schema[] {
  if (s.type === "object") out.push(s);
  Object.values(s.properties ?? {}).forEach((p) => objects(p, out));
  Object.values(s.$defs ?? {}).forEach((p) => objects(p, out));
  if (s.items) objects(s.items, out);
  return out;
}

describe("AI request", () => {
  it("uses a schema structured outputs accepts", () => {
    const all = objects(WORKFLOW_SCHEMA as Schema);
    expect(all.length).toBeGreaterThan(5);
    for (const o of all) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required ?? [])].sort()).toEqual(Object.keys(o.properties ?? {}).sort());
    }
  });

  it("tells Claude about the case fields it can pre-fill from", () => {
    expect(systemPrompt(["client.name", "number"])).toContain("- case.client.name\n- case.number");
  });
});

// Streams `text` back as a Messages API server-sent-event response.
function sseResponse(text: string): Response {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("generateWorkflow", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends errors back once and returns the corrected workflow", async () => {
    const broken = structuredClone(ENGAGEMENT_LETTER);
    broken.computed[1].expr = "hourly_rate * nope";
    const requests: { headers: Headers; body: Record<string, unknown> }[] = [];
    const replies = [broken, ENGAGEMENT_LETTER].map((workflow) => JSON.stringify({ summary: "Built an engagement letter.", workflow }));
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requests.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
      return sseResponse(replies[requests.length - 1]);
    });

    const statuses: string[] = [];
    const result = await generateWorkflow({ apiKey: "sk-test", request: "Engagement letter", caseFields: ["client.name"], onStatus: (s) => statuses.push(s) });

    expect(requests).toHaveLength(2);
    const first = requests[0].body;
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.fallbacks).toBe("default");
    expect(requests[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect((first.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const retry = requests[1].body.messages as { role: string; content: unknown }[];
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(retry[2].content)).toContain('"nope" is not a question or computed value');
    expect(statuses).toEqual(["Drafting…", "Fixing 1 problem…"]);
    expect(result.summary).toBe("Built an engagement letter.");
    expect(result.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(result.workflow.pages).toHaveLength(ENGAGEMENT_LETTER.pages.length);
  });

  it("includes the current workflow when revising", async () => {
    let sent = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)).messages[0].content;
      return sseResponse(JSON.stringify({ summary: "ok", workflow: ENGAGEMENT_LETTER }));
    });
    await generateWorkflow({ apiKey: "sk-test", request: "Add a due date", current: ENGAGEMENT_LETTER, caseFields: [] });
    expect(sent).toContain('"id":"engagement_letter"');
    expect(sent).toContain("Revise it as follows:\nAdd a due date");
  });
});
