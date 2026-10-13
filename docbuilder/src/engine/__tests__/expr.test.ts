import { evaluate, parse, ExprError, referencedPaths } from "../expr.ts";
import type { Value } from "../types.ts";

const run = (src: string, vars: Record<string, Value> = {}) => evaluate(parse(src), (n) => vars[n] ?? null);

describe("expressions", () => {
  it("handles boolean logic with words or symbols", () => {
    const vars = { client_type: "business", has_conflict: false };
    expect(run('client_type == "business" and not has_conflict', vars)).toBe(true);
    expect(run('client_type = "business" && !has_conflict', vars)).toBe(true);
    expect(run('client_type == "individual" or has_conflict', vars)).toBe(false);
  });

  it("respects precedence: and binds tighter than or", () => {
    expect(run("true or false and false")).toBe(true);
    expect(run("(true or false) and false")).toBe(false);
  });

  it("does arithmetic and comparisons", () => {
    expect(run("hours * rate + 500", { hours: 10, rate: 250 })).toBe(3000);
    expect(run("total >= 1000", { total: 1000 })).toBe(true);
    expect(run("-x + 1", { x: 3 })).toBe(-2);
  });

  it("treats unanswered values as null", () => {
    expect(run("rate > 0")).toBe(false);
    expect(run("rate * 2")).toBe(null);
    expect(run('"Hello " + name')).toBe("Hello ");
    expect(run("rate == null")).toBe(true);
  });

  it("supports in and contains for lists and text", () => {
    expect(run('fee_type in ["hourly", "flat"]', { fee_type: "flat" })).toBe(true);
    expect(run('issues contains "custody"', { issues: ["support", "custody"] })).toBe(true);
    expect(run('notes contains "URGENT"', { notes: "this is urgent" })).toBe(true);
  });

  it("reads fields of objects and maps fields across lists", () => {
    const vars = { case: { client: { name: "Ada" } }, assets: [{ value: 100 }, { value: 250 }] };
    expect(run("case.client.name", vars)).toBe("Ada");
    expect(run("sum(assets.value)", vars)).toBe(350);
    expect(run("count(assets) > 1", vars)).toBe(true);
    expect(run("case.missing.deeper", vars)).toBe(null);
  });

  it("formats values", () => {
    expect(run("money(1234.5)")).toBe("$1,234.50");
    expect(run('date_long("2026-01-05")')).toBe("January 5, 2026");
    expect(run('join(names, ", ", " and ")', { names: ["A", "B", "C"] })).toBe("A, B and C");
    expect(run("number_words(42)")).toBe("forty-two");
    expect(run('years_between("1990-06-15", "2026-06-14")')).toBe(35);
    expect(run('add_days("2026-01-30", 3)')).toBe("2026-02-02");
    expect(run('if(x, "yes", "no")', { x: 0 })).toBe("no");
    expect(run("is_empty(x)", { x: [] })).toBe(true);
    expect(run("answered(x)", { x: 0 })).toBe(true);
  });

  it("rejects unknown functions and bad syntax with a position", () => {
    expect(() => parse("eval(x)")).toThrow(ExprError);
    expect(() => parse("a ==")).toThrow(/ended too early/);
    expect(() => parse('"open')).toThrow(/Unclosed/);
    expect(() => parse("a b")).toThrow(/after expression/);
  });

  it("lists the paths an expression reads", () => {
    const paths = referencedPaths(parse('case.client.name == x and count(kids.name) > 0 and "a" in tags'));
    expect(paths).toEqual([["case", "client", "name"], ["x"], ["kids", "name"], ["tags"]]);
  });
});
