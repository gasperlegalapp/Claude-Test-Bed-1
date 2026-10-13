import { parseTemplate, renderTemplate, TemplateError } from "../template.ts";
import type { Value } from "../types.ts";

const render = (src: string, vars: Record<string, Value> = {}) => renderTemplate(parseTemplate(src), (n) => vars[n] ?? null);

describe("templates", () => {
  it("fills in values", () => {
    expect(render("Dear {{ name }}, you owe {{ money(fee) }}.", { name: "Ada", fee: 50 })).toBe("Dear Ada, you owe $50.00.");
    expect(render("Agreed: {{ ok }}", { ok: true })).toBe("Agreed: Yes");
    expect(render("Born {{ dob }}", { dob: "1980-05-02" })).toBe("Born May 2, 1980");
  });

  it("chooses if / elif / else branches and removes tag-only lines", () => {
    const src = ["Fees:", "{% if fee == \"hourly\" %}", "Hourly.", "{% elif fee == \"flat\" %}", "Flat.", "{% else %}", "TBD.", "{% endif %}", "End."].join("\n");
    expect(render(src, { fee: "flat" })).toBe("Fees:\nFlat.\nEnd.");
    expect(render(src, { fee: "hourly" })).toBe("Fees:\nHourly.\nEnd.");
    expect(render(src)).toBe("Fees:\nTBD.\nEnd.");
  });

  it("accepts else if and elseif", () => {
    expect(render("{% if a %}A{% else if b %}B{% endif %}", { b: true })).toBe("B");
    expect(render("{% if a %}A{% elseif b %}B{% endif %}", { b: true })).toBe("B");
  });

  it("loops over lists with loop helpers", () => {
    const kids = [{ name: "Ann" }, { name: "Bo" }];
    expect(render("{% for k in kids %}{{ loop.index }}. {{ k.name }}{% if not loop.last %}, {% endif %}{% endfor %}", { kids })).toBe("1. Ann, 2. Bo");
    expect(render("{% for k in kids %}x{% endfor %}")).toBe("");
  });

  it("nests conditions inside loops", () => {
    const parties = [{ name: "A", minor: true }, { name: "B", minor: false }];
    const src = "{% for p in parties %}\n{{ p.name }}{% if p.minor %} (minor){% endif %}\n{% endfor %}";
    expect(render(src, { parties })).toBe("A (minor)\nB\n");
  });

  it("reports unbalanced tags with line numbers", () => {
    expect(() => parseTemplate("a\n{% if x %}\nb")).toThrow(TemplateError);
    expect(() => parseTemplate("a\n{% if x %}\nb")).toThrow(/Line 2/);
    expect(() => parseTemplate("{% endif %}")).toThrow(/without a matching/);
    expect(() => parseTemplate("{% for x %}{% endfor %}")).toThrow(/for item in list/);
    expect(() => parseTemplate("{{ a == }}")).toThrow(/ended too early/);
    expect(() => parseTemplate("{% unless x %}")).toThrow(/Unknown tag/);
  });
});
