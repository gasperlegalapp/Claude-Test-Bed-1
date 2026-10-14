import { normalizeWorkflow, validateWorkflow } from "../validate.ts";
import { ENGAGEMENT_LETTER, SAMPLE_CASE, casePaths } from "../../data/samples.ts";
import type { Workflow } from "../types.ts";

const base = (): Workflow => structuredClone(ENGAGEMENT_LETTER);
const errors = (wf: Workflow) => validateWorkflow(wf, { caseFields: casePaths(SAMPLE_CASE) }).filter((i) => i.level === "error");

describe("validation", () => {
  it("accepts the sample workflow without issues", () => {
    expect(validateWorkflow(base(), { caseFields: casePaths(SAMPLE_CASE) })).toEqual([]);
  });

  it("flags rules that read unknown names or list fields", () => {
    const wf = base();
    wf.pages[2].questions[1].showIf = 'fee_kind == "hourly"';
    wf.documents[0].body += "\n{% for p in related_parties %}{{ p.nmae }}{% endfor %}";
    const messages = errors(wf).map((i) => i.message);
    expect(messages).toContain('"fee_kind" is not a question or computed value.');
    expect(messages).toContain('The list "related_parties" has no field "nmae".');
  });

  it("flags syntax errors in rules and templates", () => {
    const wf = base();
    wf.computed[1].expr = "hourly_rate * ";
    wf.documents[1].body = "{% if needs_waiver %}open";
    const where = errors(wf).map((i) => i.where);
    expect(where).toContain('Computed "estimated_fee"');
    expect(where).toContain('Document "Conflict Waiver"');
  });

  it("flags duplicate and invalid names, missing options and empty lists", () => {
    const wf = base();
    wf.pages[0].questions[1].id = "client_type";
    wf.pages[1].questions[1].id = "2nd party";
    wf.pages[2].questions[0].options = [];
    wf.pages[3].questions[1].fields = [];
    const messages = errors(wf).map((i) => i.message).join("\n");
    expect(messages).toMatch(/"client_type" is used more than once/);
    expect(messages).toMatch(/"2nd party" is not a valid name/);
    expect(messages).toMatch(/needs at least one option/);
    expect(messages).toMatch(/at least one field/);
  });

  it("flags circular computed values", () => {
    const wf = base();
    wf.computed.push({ id: "a", expr: "b" }, { id: "b", expr: "a" });
    expect(errors(wf).some((i) => i.message.includes("a → b → a"))).toBe(true);
  });

  it("checks pre-fill reads only known case fields", () => {
    const wf = base();
    wf.pages[0].questions[1].prefill = "case.client.nmae";
    wf.pages[1].questions[1].prefill = "client_type";
    const issues = validateWorkflow(wf, { caseFields: casePaths(SAMPLE_CASE) });
    expect(issues.some((i) => i.level === "warning" && i.message.includes("case.client.nmae"))).toBe(true);
    expect(issues.some((i) => i.level === "error" && i.message.includes("can only read the case record"))).toBe(true);
  });

  it("warns when a rule reads a question asked later", () => {
    const wf = base();
    wf.pages[0].questions[0].showIf = "has_related";
    expect(validateWorkflow(wf).some((i) => i.level === "warning" && i.message.includes("asked later"))).toBe(true);
  });

  it("normalizes untrusted JSON, treating empty strings as absent", () => {
    const wf = normalizeWorkflow({
      name: "X",
      pages: [{ id: "p", title: "P", showIf: "", questions: [{ id: "a", label: "A", type: "text", showIf: "", prefill: "", options: [], fields: [], extra: 1 }] }],
    });
    expect(wf.pages[0]).toEqual({ id: "p", title: "P", questions: [{ id: "a", label: "A", type: "text" }] });
    expect(wf.computed).toEqual([]);
    expect(wf.documents).toEqual([]);
  });

  it("keeps a combobox's suggestions and checks them like other options", () => {
    const wf = normalizeWorkflow({
      name: "X",
      pages: [{ id: "p", title: "P", questions: [{ id: "matter", label: "Matter", type: "combobox", options: [{ value: "Guardianship of", label: "Guardianship of" }] }] }],
      documents: [{ id: "d", name: "D", body: "{{ matter }}" }],
    });
    expect(wf.pages[0].questions[0].options).toHaveLength(1);
    expect(errors(wf)).toEqual([]);
    wf.pages[0].questions[0].options = [];
    expect(errors(wf).map((e) => e.message).join(" ")).toMatch(/needs at least one option/);
  });
});
