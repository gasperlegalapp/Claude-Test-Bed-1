// The expression language shared by show-if rules, computed values and
// templates. It is parsed into an AST and interpreted; nothing is ever passed
// to `eval`, so expressions written by users or AI can only read variables and
// call the whitelisted functions below.
//
//   client_type == "business" and not has_conflict
//   fee_type in ["hourly", "flat"]
//   count(children) > 0 or years_between(dob, today()) >= 65
//   hours * rate + retainer
//
// Unanswered or hidden questions read as null. Comparisons against null are
// false, arithmetic with null is null, and null joins strings as "".

import type { Value } from "./types.ts";

export type Node =
  | { kind: "lit"; value: Value }
  | { kind: "var"; name: string }
  | { kind: "member"; object: Node; prop: string }
  | { kind: "list"; items: Node[] }
  | { kind: "call"; fn: string; args: Node[] }
  | { kind: "unary"; op: "not" | "neg"; arg: Node }
  | { kind: "binary"; op: BinaryOp; left: Node; right: Node };

type BinaryOp =
  | "or" | "and"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "contains" | "in"
  | "+" | "-" | "*" | "/";

export class ExprError extends Error {
  constructor(message: string, readonly pos: number) {
    super(message);
  }
}

// ---------------------------------------------------------------- tokenizer

type Token =
  | { t: "num"; v: number; pos: number }
  | { t: "str"; v: string; pos: number }
  | { t: "id"; v: string; pos: number }
  | { t: "op"; v: string; pos: number }
  | { t: "eof"; pos: number };

const KEYWORD_OPS: Record<string, string> = { and: "and", or: "or", not: "not", contains: "contains", in: "in" };
const SYMBOL_OPS = ["==", "!=", "<=", ">=", "&&", "||", "<", ">", "=", "!", "+", "-", "*", "/", "(", ")", "[", "]", ",", "."];
const SYMBOL_ALIASES: Record<string, string> = { "&&": "and", "||": "or", "!": "not", "=": "==" };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+|^[0-9]+/.exec(src.slice(i))!;
      out.push({ t: "num", v: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError("Unclosed string", i);
      out.push({ t: "str", v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const word = m[0];
      if (KEYWORD_OPS[word]) out.push({ t: "op", v: KEYWORD_OPS[word], pos: i });
      else out.push({ t: "id", v: word, pos: i });
      i += word.length;
      continue;
    }
    const sym = SYMBOL_OPS.find((s) => src.startsWith(s, i));
    if (!sym) throw new ExprError(`Unexpected character "${c}"`, i);
    out.push({ t: "op", v: SYMBOL_ALIASES[sym] ?? sym, pos: i });
    i += sym.length;
  }
  out.push({ t: "eof", pos: src.length });
  return out;
}

// ------------------------------------------------------------------- parser

export function parse(src: string): Node {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => {
    const tok = tokens[p];
    return tok.t === "op" && tok.v === v;
  };
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`, peek().pos);
    p++;
  };

  function orExpr(): Node {
    let left = andExpr();
    while (isOp("or")) {
      p++;
      left = { kind: "binary", op: "or", left, right: andExpr() };
    }
    return left;
  }
  function andExpr(): Node {
    let left = notExpr();
    while (isOp("and")) {
      p++;
      left = { kind: "binary", op: "and", left, right: notExpr() };
    }
    return left;
  }
  function notExpr(): Node {
    if (isOp("not")) {
      p++;
      return { kind: "unary", op: "not", arg: notExpr() };
    }
    return compare();
  }
  function compare(): Node {
    const left = additive();
    const tok = peek();
    if (tok.t === "op" && ["==", "!=", "<", "<=", ">", ">=", "contains", "in"].includes(tok.v)) {
      p++;
      return { kind: "binary", op: tok.v as BinaryOp, left, right: additive() };
    }
    return left;
  }
  function additive(): Node {
    let left = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = (peek() as { v: string }).v as BinaryOp;
      p++;
      left = { kind: "binary", op, left, right: multiplicative() };
    }
    return left;
  }
  function multiplicative(): Node {
    let left = unary();
    while (isOp("*") || isOp("/")) {
      const op = (peek() as { v: string }).v as BinaryOp;
      p++;
      left = { kind: "binary", op, left, right: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (isOp("-")) {
      p++;
      return { kind: "unary", op: "neg", arg: unary() };
    }
    return postfix();
  }
  function postfix(): Node {
    let node = primary();
    while (isOp(".")) {
      p++;
      const tok = peek();
      if (tok.t !== "id") throw new ExprError("Expected a field name after \".\"", tok.pos);
      p++;
      node = { kind: "member", object: node, prop: tok.v };
    }
    return node;
  }
  function primary(): Node {
    const tok = peek();
    if (tok.t === "num" || tok.t === "str") {
      p++;
      return { kind: "lit", value: tok.v };
    }
    if (tok.t === "id") {
      p++;
      if (tok.v === "true") return { kind: "lit", value: true };
      if (tok.v === "false") return { kind: "lit", value: false };
      if (tok.v === "null") return { kind: "lit", value: null };
      if (isOp("(")) {
        p++;
        if (!FUNCTIONS[tok.v]) throw new ExprError(`Unknown function "${tok.v}"`, tok.pos);
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(orExpr());
          while (isOp(",")) {
            p++;
            args.push(orExpr());
          }
        }
        expectOp(")");
        return { kind: "call", fn: tok.v, args };
      }
      return { kind: "var", name: tok.v };
    }
    if (isOp("(")) {
      p++;
      const inner = orExpr();
      expectOp(")");
      return inner;
    }
    if (isOp("[")) {
      p++;
      const items: Node[] = [];
      if (!isOp("]")) {
        items.push(orExpr());
        while (isOp(",")) {
          p++;
          items.push(orExpr());
        }
      }
      expectOp("]");
      return { kind: "list", items };
    }
    throw new ExprError(tok.t === "eof" ? "Expression ended too early" : "Unexpected token", tok.pos);
  }

  if (peek().t === "eof") throw new ExprError("Empty expression", 0);
  const node = orExpr();
  if (peek().t !== "eof") throw new ExprError("Unexpected text after expression", peek().pos);
  return node;
}

/** Root variable names an expression reads (`client.name` → `client`). */
export function referencedVars(node: Node, out = new Set<string>()): Set<string> {
  switch (node.kind) {
    case "var":
      out.add(node.name);
      break;
    case "member":
      referencedVars(node.object, out);
      break;
    case "list":
      node.items.forEach((n) => referencedVars(n, out));
      break;
    case "call":
      node.args.forEach((n) => referencedVars(n, out));
      break;
    case "unary":
      referencedVars(node.arg, out);
      break;
    case "binary":
      referencedVars(node.left, out);
      referencedVars(node.right, out);
      break;
  }
  return out;
}

/**
 * Dotted paths an expression reads: `case.client.name`, `children.name`,
 * `fee`. A chain that doesn't start at a variable (e.g. `f(x).y`) contributes
 * only the variables inside it.
 */
export function referencedPaths(node: Node, out: string[][] = []): string[][] {
  const chain: string[] = [];
  let cur: Node = node;
  while (cur.kind === "member") {
    chain.unshift(cur.prop);
    cur = cur.object;
  }
  if (cur.kind === "var") {
    out.push([cur.name, ...chain]);
    return out;
  }
  if (cur.kind === "list") cur.items.forEach((n) => referencedPaths(n, out));
  else if (cur.kind === "call") cur.args.forEach((n) => referencedPaths(n, out));
  else if (cur.kind === "unary") referencedPaths(cur.arg, out);
  else if (cur.kind === "binary") {
    referencedPaths(cur.left, out);
    referencedPaths(cur.right, out);
  }
  return out;
}

// ---------------------------------------------------------------- evaluator

export type Lookup = (name: string) => Value;

export function truthy(v: Value): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== false && v !== 0 && v !== "";
}

function equal(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "string" && b.trim() !== "") return a === Number(b);
  if (typeof b === "number" && typeof a === "string" && a.trim() !== "") return b === Number(a);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  return false;
}

function contains(container: Value, item: Value): boolean {
  if (Array.isArray(container)) return container.some((x) => equal(x, item));
  if (typeof container === "string" && item !== null) return container.toLowerCase().includes(String(item).toLowerCase());
  return false;
}

function num(v: Value): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

function str(v: Value): string {
  if (v === null) return "";
  if (Array.isArray(v)) return v.map(str).join(", ");
  if (typeof v === "object") return "";
  return String(v);
}

export function evaluate(node: Node, lookup: Lookup): Value {
  switch (node.kind) {
    case "lit":
      return node.value;
    case "var":
      return lookup(node.name);
    case "member": {
      const obj = evaluate(node.object, lookup);
      return member(obj, node.prop);
    }
    case "list":
      return node.items.map((n) => evaluate(n, lookup));
    case "call":
      return FUNCTIONS[node.fn](node.args.map((n) => evaluate(n, lookup)));
    case "unary": {
      const v = evaluate(node.arg, lookup);
      if (node.op === "not") return !truthy(v);
      const n = num(v);
      return n === null ? null : -n;
    }
    case "binary":
      return binary(node.op, node.left, node.right, lookup);
  }
}

// `children.name` on a list reads that field from every item.
function member(obj: Value, prop: string): Value {
  if (Array.isArray(obj)) return obj.map((item) => member(item, prop));
  if (obj !== null && typeof obj === "object") return obj[prop] ?? null;
  return null;
}

function binary(op: BinaryOp, l: Node, r: Node, lookup: Lookup): Value {
  if (op === "and") return truthy(evaluate(l, lookup)) && truthy(evaluate(r, lookup));
  if (op === "or") return truthy(evaluate(l, lookup)) || truthy(evaluate(r, lookup));
  const a = evaluate(l, lookup);
  const b = evaluate(r, lookup);
  switch (op) {
    case "==":
      return equal(a, b);
    case "!=":
      return !equal(a, b);
    case "contains":
      return contains(a, b);
    case "in":
      return contains(b, a);
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (a === null || b === null) return false;
      const na = num(a);
      const nb = num(b);
      const [x, y] = na !== null && nb !== null ? [na, nb] : [str(a), str(b)];
      if (op === "<") return x < y;
      if (op === "<=") return x <= y;
      if (op === ">") return x > y;
      return x >= y;
    }
    case "+": {
      const na = num(a);
      const nb = num(b);
      if (typeof a === "number" && typeof b === "number") return a + b;
      if (typeof a === "string" || typeof b === "string") {
        if (na !== null && nb !== null && a !== "" && b !== "") return na + nb;
        return str(a) + str(b);
      }
      return na === null || nb === null ? null : na + nb;
    }
    case "-":
    case "*":
    case "/": {
      const na = num(a);
      const nb = num(b);
      if (na === null || nb === null) return null;
      if (op === "-") return na - nb;
      if (op === "*") return na * nb;
      return nb === 0 ? null : na / nb;
    }
  }
}

// ---------------------------------------------------------------- functions

type Fn = (args: Value[]) => Value;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Parses `YYYY-MM-DD` without timezone shifts. */
function parseDate(v: Value): Date | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function list(v: Value): Value[] {
  if (Array.isArray(v)) return v;
  return v === null ? [] : [v];
}

/** Whitelisted functions, with the help text the builder and AI prompt show. */
export const FUNCTION_DOCS: Record<string, string> = {
  count: "count(list) → number of items",
  sum: "sum(list) → total of the numbers, e.g. sum(assets.value)",
  min: "min(a, b, ...) → smallest number",
  max: "max(a, b, ...) → largest number",
  round: "round(number, digits) → rounded number",
  is_empty: "is_empty(x) → true if unanswered, blank or an empty list",
  answered: "answered(x) → true if x has a value",
  if: "if(condition, then, else) → picks a value",
  upper: "upper(text) → UPPER CASE",
  lower: "lower(text) → lower case",
  title: "title(text) → Title Case",
  join: 'join(list, sep, last_sep) → "A, B and C" with join(names, ", ", " and ")',
  money: "money(number) → $1,234.50",
  number_words: "number_words(number) → twelve (0 to 999,999)",
  today: "today() → today's date (YYYY-MM-DD)",
  date_long: "date_long(date) → January 5, 2026",
  years_between: "years_between(date1, date2) → whole years, e.g. an age",
  add_days: "add_days(date, n) → date n days later",
};

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberWords(n % 100) : "");
  return numberWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + numberWords(n % 1000) : "");
}

const FUNCTIONS: Record<string, Fn> = {
  count: ([v]) => list(v).length,
  sum: ([v]) => list(v).reduce<number>((acc, x) => acc + (num(x) ?? 0), 0),
  min: (args) => {
    const ns = args.flatMap(list).map(num).filter((n): n is number => n !== null);
    return ns.length ? Math.min(...ns) : null;
  },
  max: (args) => {
    const ns = args.flatMap(list).map(num).filter((n): n is number => n !== null);
    return ns.length ? Math.max(...ns) : null;
  },
  round: ([v, digits]) => {
    const n = num(v);
    if (n === null) return null;
    const f = 10 ** (num(digits) ?? 0);
    return Math.round(n * f) / f;
  },
  is_empty: ([v]) => !truthy(v) && v !== 0 && v !== false,
  answered: ([v]) => truthy(v) || v === 0 || v === false,
  if: ([c, a, b]) => (truthy(c) ? a : (b ?? null)),
  upper: ([v]) => str(v).toUpperCase(),
  lower: ([v]) => str(v).toLowerCase(),
  title: ([v]) => str(v).replace(/\b\w/g, (ch) => ch.toUpperCase()),
  join: ([v, sep, lastSep]) => {
    const items = list(v).map(str).filter((s) => s !== "");
    const s = sep === undefined || sep === null ? ", " : str(sep);
    const last = lastSep === undefined || lastSep === null ? s : str(lastSep);
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(s) + last + items[items.length - 1];
  },
  money: ([v]) => {
    const n = num(v);
    if (n === null) return "";
    const fixed = Math.abs(n).toFixed(2);
    const [whole, cents] = fixed.split(".");
    return (n < 0 ? "-$" : "$") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + cents;
  },
  number_words: ([v]) => {
    const n = num(v);
    if (n === null || n < 0 || n >= 1_000_000 || !Number.isInteger(n)) return str(v);
    return numberWords(n);
  },
  today: () => isoDate(new Date()),
  date_long: ([v]) => {
    const d = parseDate(v);
    return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : str(v);
  },
  years_between: ([a, b]) => {
    const d1 = parseDate(a);
    const d2 = parseDate(b);
    if (!d1 || !d2) return null;
    const [from, to] = d1 <= d2 ? [d1, d2] : [d2, d1];
    let years = to.getUTCFullYear() - from.getUTCFullYear();
    if (to.getUTCMonth() < from.getUTCMonth() || (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate())) years--;
    return years;
  },
  add_days: ([v, n]) => {
    const d = parseDate(v);
    const days = num(n);
    if (!d || days === null) return null;
    d.setUTCDate(d.getUTCDate() + days);
    return isoDate(d);
  },
};

/** Text a value prints as inside a document. */
export function display(v: Value): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return str(v);
}
