import { CHECKS_SCHEMA, PRIOR_SCHEMA, STATEMENT_SCHEMA, categorizeSchema, fileBlock, readStatements, suggestEntries } from "../extract.ts";
import { DEFAULT_CATEGORIES } from "../../engine/accounting.ts";
import { writeXlsx, XLSX_MIME } from "../../engine/xlsx.ts";
import { sseResponse } from "./sse.ts";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema };

function objects(s: Schema, out: Schema[] = []): Schema[] {
  if (s.type === "object") out.push(s);
  Object.values(s.properties ?? {}).forEach((p) => objects(p, out));
  if (s.items) objects(s.items, out);
  return out;
}

const statement = (lines: { date: string; description: string; amount: number; balance: number | null }[]) => ({
  institution: "Example Bank",
  account_name: "Guardianship checking",
  account_last4: "4321",
  period_start: "2026-03-01",
  period_end: "2026-03-31",
  opening_balance: null,
  closing_balance: null,
  transactions: lines.map((l) => ({ ...l, check_number: "", doubt: "" })),
});

describe("reading bank records", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses schemas structured outputs accepts", () => {
    for (const schema of [STATEMENT_SCHEMA, CHECKS_SCHEMA, PRIOR_SCHEMA, categorizeSchema(["income"])]) {
      for (const o of objects(schema as Schema)) {
        expect(o.additionalProperties).toBe(false);
        expect([...(o.required ?? [])].sort()).toEqual(Object.keys(o.properties ?? {}).sort());
      }
    }
  });

  it("sends PDFs as documents, images as images and workbooks as their cells", () => {
    expect(fileBlock({ name: "s.pdf", type: "application/pdf", bytes: new Uint8Array([37, 80]) })).toMatchObject({ type: "document", source: { media_type: "application/pdf", data: "JVA=" } });
    expect(fileBlock({ name: "c.png", type: "image/png", bytes: new Uint8Array([1]) })).toMatchObject({ type: "image", source: { media_type: "image/png" } });
    const xlsx = writeXlsx([{ name: "Account", rows: [["Balance remaining", 1844.9]] }]);
    expect(fileBlock({ name: "prior.xlsx", type: XLSX_MIME, bytes: xlsx })).toEqual({ type: "text", text: 'Spreadsheet "prior.xlsx", cell by cell:\n## Sheet: Account\n1\tA: Balance remaining\tB: 1844.9' });
  });

  it("sends a history back once, naming the line that breaks the running balance", async () => {
    const misread = statement([
      { date: "2026-03-04", description: "Check 501", amount: -56, balance: 1035 },
      { date: "2026-03-02", description: "SSA direct deposit", amount: 400, balance: 1100 },
    ]);
    const fixed = statement([
      { date: "2026-03-04", description: "Check 501", amount: -65, balance: 1035 },
      { date: "2026-03-02", description: "SSA direct deposit", amount: 400, balance: 1100 },
    ]);
    const bodies: { messages: { role: string; content: unknown }[] }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return sseResponse(JSON.stringify({ statements: [bodies.length === 1 ? misread : fixed], notes: "" }));
    });
    const statuses: string[] = [];
    const result = await readStatements({ apiKey: "sk-test", file: { name: "history.pdf", type: "application/pdf", bytes: new Uint8Array([1]) }, onStatus: (s) => statuses.push(s) });

    expect(bodies).toHaveLength(2);
    expect((bodies[0].messages[0].content as { type: string }[])[0].type).toBe("document");
    expect(String(bodies[1].messages[2].content)).toContain('the line "Check 501" on 2026-03-04 for -56.00 doesn\'t take the balance from 1100.00 to the printed 1035.00');
    expect(statuses).toEqual(["Reading history.pdf…", "Re-checking history.pdf: it didn't balance…"]);
    expect(result.statements[0].transactions.map((t) => t.amount)).toEqual([-65, 400]);
  });

  it("doesn't send back a history that adds up", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return sseResponse(JSON.stringify({ statements: [statement([{ date: "2026-03-02", description: "Deposit", amount: 400, balance: 1100 }])], notes: "" }));
    });
    await readStatements({ apiKey: "sk-test", file: { name: "h.pdf", type: "application/pdf", bytes: new Uint8Array([1]) } });
    expect(calls).toBe(1);
  });

  it("suggests payees and descriptions without categories when the form doesn't use them", async () => {
    let system = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      system = body.system;
      return sseResponse(JSON.stringify({ results: [{ id: "t1", category: "unsure", payee: "Example Gas Co ", description: "", reason: "check payee" }, { id: "zz", category: "unsure", payee: "x", description: "", reason: "" }] }));
    });
    const out = await suggestEntries({
      apiKey: "sk-test",
      txns: [{ id: "t1", date: "2026-01-28", description: "SUBSTITUTE CHECK Check 2102", amount: -84.16, payee: "Example Gas Co" }],
      categories: [],
      accounts: [{ name: "Guardianship checking", last4: "4321" }],
      rules: "Card transfers are disbursements.",
    });
    expect(system).toContain("doesn't use categories");
    expect(system).toContain("Card transfers are disbursements.");
    expect([...out.entries()]).toEqual([["t1", { category: "", payee: "Example Gas Co", description: "", reason: "check payee" }]]);
  });

  it("offers the accounting's categories when it uses them", () => {
    const schema = categorizeSchema(DEFAULT_CATEGORIES.map((c) => c.id)) as unknown as { properties: { results: { items: { properties: { category: { enum: string[] } } } } } };
    expect(schema.properties.results.items.properties.category.enum).toEqual([...DEFAULT_CATEGORIES.map((c) => c.id), "transfer", "unsure"]);
  });
});
