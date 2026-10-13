import { assemble, createScope, missingRequired, prefillAnswers } from "../session.ts";
import { ENGAGEMENT_LETTER, SAMPLE_CASE } from "../../data/samples.ts";
import type { Answers } from "../types.ts";

const wf = ENGAGEMENT_LETTER;
const q = (id: string) => wf.pages.flatMap((p) => p.questions).find((x) => x.id === id)!;
const page = (id: string) => wf.pages.find((p) => p.id === id)!;

describe("session", () => {
  it("pre-fills answers from the case record", () => {
    const answers = prefillAnswers(wf, SAMPLE_CASE);
    expect(answers.client_name).toBe("Pat Smith");
    expect(answers.client_type).toBe("individual");
    expect(answers.matter_description).toBe("Represent the client in Smith v. Acme Corp");
    expect(answers.flat_fee).toBeUndefined();
  });

  it("shows questions only when their rule passes", () => {
    const scope = createScope(wf, { fee_type: "hourly" });
    expect(scope.questionVisible(q("hourly_rate"))).toBe(true);
    expect(scope.questionVisible(q("flat_fee"))).toBe(false);
    expect(scope.questionVisible(q("retainer_amount"))).toBe(false);
  });

  it("reads hidden questions as unanswered, even if answered earlier", () => {
    const answers: Answers = { fee_type: "flat", hourly_rate: 300, estimated_hours: 10, flat_fee: 5000 };
    const scope = createScope(wf, answers);
    expect(scope.lookup("hourly_rate")).toBe(null);
    expect(scope.lookup("estimated_fee")).toBe(null);
    expect(scope.lookup("flat_fee")).toBe(5000);
  });

  it("shows a page from a computed value over a list", () => {
    const cleared = createScope(wf, { has_related: true, related_parties: [{ name: "A", cleared: true }] });
    expect(cleared.pageVisible(page("waiver"))).toBe(false);
    const uncleared = createScope(wf, { has_related: true, related_parties: [{ name: "A", cleared: true }, { name: "B", cleared: false }] });
    expect(uncleared.pageVisible(page("waiver"))).toBe(true);
    // Questions on a hidden page are hidden too.
    expect(cleared.questionVisible(q("conflict_description"))).toBe(false);
  });

  it("lists missing required answers, including list fields", () => {
    const answers: Answers = { client_type: "business", fee_type: "flat", has_related: true, related_parties: [{ name: "" }] };
    const missing = missingRequired(wf, answers, createScope(wf, answers)).map((m) => m.questionId);
    expect(missing).toContain("entity_name");
    expect(missing).toContain("flat_fee");
    expect(missing).toContain("related_parties");
    expect(missing).not.toContain("client_name");
    expect(missing).not.toContain("hourly_rate");
  });

  it("survives circular rules without hanging", () => {
    const loop = { ...wf, computed: [{ id: "a", expr: "b + 1" }, { id: "b", expr: "a + 1" }] };
    expect(createScope(loop, {}).lookup("a")).toBe(null);
  });

  it("assembles documents, including conditional ones", () => {
    const answers: Answers = {
      ...prefillAnswers(wf, SAMPLE_CASE),
      start_date: "2026-03-02",
      fee_type: "hourly",
      hourly_rate: 350,
      estimated_hours: 20,
      retainer_required: true,
      retainer_amount: 2500,
      has_related: true,
      related_parties: [{ name: "Chris Smith", relationship: "spouse", cleared: false }],
      conflict_description: "The firm previously advised Chris Smith.",
      waiver_explained: true,
    };
    const docs = assemble(wf, answers, SAMPLE_CASE);
    expect(docs.map((d) => d.doc.id)).toEqual(["letter", "waiver"]);
    const letter = docs[0].text;
    expect(letter).toContain("March 2, 2026");
    expect(letter).toContain("Dear Pat Smith:");
    expect(letter).toContain("$350.00 per hour");
    expect(letter).toContain("about $7,000.00");
    expect(letter).toContain("A retainer of $2,500.00");
    expect(letter).toContain("- Chris Smith (spouse): **conflict waiver required**");
    expect(letter).not.toContain("flat fee");
    expect(letter).not.toMatch(/\{\{|\{%/);
    expect(docs[1].text).toContain("- Chris Smith");

    const flat = assemble(wf, { ...answers, fee_type: "flat", flat_fee: 4000, has_related: false }, SAMPLE_CASE);
    expect(flat.map((d) => d.doc.id)).toEqual(["letter"]);
    expect(flat[0].text).toContain("flat fee of $4,000.00");
    expect(flat[0].text).not.toContain("per hour");
    expect(flat[0].text).not.toContain("Related parties");
  });
});
