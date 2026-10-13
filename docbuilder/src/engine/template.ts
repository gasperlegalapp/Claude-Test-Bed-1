// Document templates, Jinja-style, using the same expression language:
//
//   Dear {{ client_name }},
//   {% if fee_type == "hourly" %}
//   Our rate is {{ money(rate) }} per hour.
//   {% elif fee_type == "flat" %}
//   The flat fee is {{ money(flat_fee) }}.
//   {% else %}
//   We will discuss fees separately.
//   {% endif %}
//   {% for child in children %}
//   - {{ child.name }}{% if not loop.last %};{% endif %}
//   {% endfor %}
//
// A line holding only a `{% %}` tag is removed whole, so conditionals don't
// leave blank lines behind.

import { evaluate, parse, display, truthy, ExprError, type Lookup, type Node as ExprNode } from "./expr.ts";
import type { Value } from "./types.ts";

type TNode =
  | { kind: "text"; text: string }
  | { kind: "out"; expr: ExprNode }
  | { kind: "if"; branches: { cond: ExprNode; body: TNode[] }[]; otherwise: TNode[] }
  | { kind: "for"; varName: string; list: ExprNode; body: TNode[] };

export class TemplateError extends Error {
  constructor(message: string, readonly line: number) {
    super(`Line ${line}: ${message}`);
  }
}

type Piece =
  | { kind: "text"; text: string }
  | { kind: "out"; src: string; line: number }
  | { kind: "tag"; src: string; line: number };

function lineAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === "\n") line++;
  return line;
}

function split(src: string): Piece[] {
  const pieces: Piece[] = [];
  const re = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let start = m.index;
    let end = re.lastIndex;
    if (m[2] !== undefined) {
      // Standalone tag: swallow its indentation and its line break.
      const lineStart = src.lastIndexOf("\n", start - 1) + 1;
      const nl = src.indexOf("\n", end);
      const lineEnd = nl === -1 ? src.length : nl;
      if (/^[ \t]*$/.test(src.slice(lineStart, start)) && /^[ \t]*$/.test(src.slice(end, lineEnd)) && lineStart >= last) {
        start = lineStart;
        end = nl === -1 ? src.length : nl + 1;
      }
    }
    if (start > last) pieces.push({ kind: "text", text: src.slice(last, start) });
    const line = lineAt(src, m.index);
    if (m[1] !== undefined) pieces.push({ kind: "out", src: m[1].trim(), line });
    else pieces.push({ kind: "tag", src: m[2].trim(), line });
    last = end;
    re.lastIndex = end;
  }
  if (last < src.length) pieces.push({ kind: "text", text: src.slice(last) });
  return pieces;
}

function parseExpr(src: string, line: number): ExprNode {
  try {
    return parse(src);
  } catch (e) {
    if (e instanceof ExprError) throw new TemplateError(`${e.message} in "${src}"`, line);
    throw e;
  }
}

export function parseTemplate(src: string): TNode[] {
  const pieces = split(src);
  let i = 0;

  // Parses until one of `stops` is reached; returns the body and the stop tag.
  function block(stops: string[]): { body: TNode[]; stop: { word: string; rest: string; line: number } | null } {
    const body: TNode[] = [];
    while (i < pieces.length) {
      const piece = pieces[i++];
      if (piece.kind === "text") {
        body.push({ kind: "text", text: piece.text });
        continue;
      }
      if (piece.kind === "out") {
        body.push({ kind: "out", expr: parseExpr(piece.src, piece.line) });
        continue;
      }
      const tag = /^(\w+)\s*([\s\S]*)$/.exec(piece.src);
      if (!tag) throw new TemplateError(`Empty tag`, piece.line);
      let word = tag[1];
      let rest = tag[2];
      // Accept `else if` and `elseif` as spellings of `elif`.
      if (word === "elseif" || (word === "else" && /^else\s+if\b/.test(piece.src))) {
        word = "elif";
        rest = piece.src.replace(/^else\s*if\s*/, "");
      }
      if (stops.includes(word)) return { body, stop: { word, rest, line: piece.line } };
      if (word === "if") body.push(ifBlock(rest, piece.line));
      else if (word === "for") body.push(forBlock(rest, piece.line));
      else if (["elif", "else", "endif", "endfor"].includes(word)) throw new TemplateError(`"{% ${word} %}" without a matching opening tag`, piece.line);
      else throw new TemplateError(`Unknown tag "{% ${piece.src} %}"`, piece.line);
    }
    return { body, stop: null };
  }

  function ifBlock(condSrc: string, line: number): TNode {
    const branches: { cond: ExprNode; body: TNode[] }[] = [];
    let cond = parseExpr(condSrc, line);
    let otherwise: TNode[] = [];
    for (;;) {
      const { body, stop } = block(["elif", "else", "endif"]);
      if (!stop) throw new TemplateError(`"{% if %}" is never closed with "{% endif %}"`, line);
      branches.push({ cond, body });
      if (stop.word === "elif") {
        cond = parseExpr(stop.rest, stop.line);
        continue;
      }
      if (stop.word === "else") {
        const tail = block(["endif"]);
        if (!tail.stop) throw new TemplateError(`"{% if %}" is never closed with "{% endif %}"`, line);
        otherwise = tail.body;
      }
      return { kind: "if", branches, otherwise };
    }
  }

  function forBlock(src: string, line: number): TNode {
    const m = /^([A-Za-z_]\w*)\s+in\s+([\s\S]+)$/.exec(src);
    if (!m) throw new TemplateError(`Write loops as "{% for item in list %}"`, line);
    const { body, stop } = block(["endfor"]);
    if (!stop) throw new TemplateError(`"{% for %}" is never closed with "{% endfor %}"`, line);
    return { kind: "for", varName: m[1], list: parseExpr(m[2], line), body };
  }

  const { body } = block([]);
  return body;
}

export function renderTemplate(nodes: TNode[], lookup: Lookup): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.text;
        break;
      case "out":
        out += display(evaluate(node.expr, lookup));
        break;
      case "if": {
        const branch = node.branches.find((b) => truthy(evaluate(b.cond, lookup)));
        out += renderTemplate(branch ? branch.body : node.otherwise, lookup);
        break;
      }
      case "for": {
        const raw = evaluate(node.list, lookup);
        const items = Array.isArray(raw) ? raw : [];
        items.forEach((item, index) => {
          const loop: Value = { index: index + 1, first: index === 0, last: index === items.length - 1, count: items.length };
          const inner: Lookup = (name) => (name === node.varName ? item : name === "loop" ? loop : lookup(name));
          out += renderTemplate(node.body, inner);
        });
        break;
      }
    }
  }
  return out;
}

export interface TemplateExpr {
  expr: ExprNode;
  /** Loop variables in scope at this point, mapped to the list each iterates. */
  loops: Map<string, ExprNode>;
}

/** Every expression in a template, with the loop variables it can see. */
export function templateExprs(nodes: TNode[]): TemplateExpr[] {
  const out: TemplateExpr[] = [];
  const walk = (list: TNode[], loops: Map<string, ExprNode>) => {
    for (const node of list) {
      if (node.kind === "out") out.push({ expr: node.expr, loops });
      else if (node.kind === "if") {
        node.branches.forEach((b) => {
          out.push({ expr: b.cond, loops });
          walk(b.body, loops);
        });
        walk(node.otherwise, loops);
      } else if (node.kind === "for") {
        out.push({ expr: node.list, loops });
        walk(node.body, new Map([...loops, [node.varName, node.list]]));
      }
    }
  };
  walk(nodes, new Map());
  return out;
}
