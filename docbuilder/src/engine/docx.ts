// Word (.docx) templates. Lawyers type the same tags as text templates into a
// Word document, and the filled file keeps all of Word's formatting.
//
//   {{ client_name }}                  inline, keeps the formatting it was typed in
//   {% if retainer_required %}         alone in its paragraph: includes or removes
//   ...paragraphs, tables...           whole paragraphs (the tag paragraphs vanish)
//   {% endif %}
//   | {% for p in parties %}{{ p.name }} | {{ p.role }}{% endfor %} |
//                                      first and last cell of a table row: repeats the row
//
// Word splits typed text into runs wherever formatting, spell-check or edit
// history changes, so one tag can be spread over several <w:t> elements. The
// loader first moves each tag's text into the run where the tag starts, then
// turns the document XML into a source for the ordinary template engine:
// XML passes through as literal text, tags stay tags, and block tags are moved
// to paragraph or table-row boundaries so the output stays well-formed.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Lookup } from "./expr.ts";
import { escapeHtml } from "./markdown.ts";
import { parseTemplate, renderTemplate, templateExprs, TemplateError, type TemplateExpr, type TNode } from "./template.ts";

export class DocxError extends Error {}

export interface DocxTemplate {
  /** Every file in the package; templated parts are replaced on fill. */
  files: Record<string, Uint8Array>;
  parts: { path: string; nodes: TNode[] }[];
  /** Plain text of the document body with its tags, for display and AI. */
  text: string;
}

const TEMPLATED_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ------------------------------------------------------------------ base64

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --------------------------------------------------------------------- XML

type Tok = { kind: "open" | "close" | "self" | "other" | "text"; raw: string; name: string };

const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][\s\S]*?>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g;

function tokenize(xml: string): Tok[] {
  const toks: Tok[] = [];
  for (const m of xml.matchAll(TOKEN_RE)) {
    const raw = m[0];
    if (raw[0] !== "<") toks.push({ kind: "text", raw, name: "" });
    else if (raw[1] === "?" || raw[1] === "!") toks.push({ kind: "other", raw, name: "" });
    else {
      const name = /^<\/?([^\s/>]+)/.exec(raw)?.[1] ?? "";
      toks.push({ kind: raw[1] === "/" ? "close" : raw.endsWith("/>") ? "self" : "open", raw, name });
    }
  }
  return toks;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

function encode(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Keeps literal `{{` / `{%` outside tags from being read as tags. */
function protect(s: string): string {
  return s.replace(/\{(?=[{%])/g, "&#123;");
}

/** How an inserted value is written inside a <w:t>: escaped, with line breaks and tabs as Word elements. */
function escapeValue(s: string): string {
  return encode(s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""))
    .replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">')
    .replace(/\t/g, '</w:t><w:tab/><w:t xml:space="preserve">');
}

/** Word autocorrects quotes and inserts non-breaking spaces; tags need plain ones. */
function plainTag(raw: string): string {
  return raw.replace(/[“”„″]/g, '"').replace(/[‘’‚′]/g, "'").replace(/ /g, " ");
}

// ------------------------------------------------------- template building

interface TextNode {
  tok: number;
  text: string;
  /** Token index of the enclosing <w:p>, <w:tc>, <w:tr> (-1 if none). */
  p: number;
  tc: number;
  tr: number;
  /** Element path to the text, and to its paragraph; tags may only pair across equal paths. */
  path: string;
  pPath: string;
}

interface Tag {
  node: number;
  start: number;
  end: number;
  raw: string;
  word: string;
}

const TAG_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;

function blockWord(raw: string): string {
  if (!raw.startsWith("{%")) return "";
  const src = raw.slice(2, -2).trim();
  if (/^else\s*if\b/.test(src)) return "elif";
  return /^\w+/.exec(src)?.[0] ?? "";
}

function describe(tag: Tag): string {
  return tag.raw.replace(/\s+/g, " ");
}

/** Turns one XML part into template source. Throws DocxError for tags whose layout can't work. */
export function xmlToTemplate(xml: string): string {
  const toks = tokenize(xml);
  const closeOf = new Map<number, number>();
  const nodes: TextNode[] = [];
  const stack: { name: string; idx: number }[] = [];

  toks.forEach((tok, i) => {
    if (tok.kind === "open") stack.push({ name: tok.name, idx: i });
    else if (tok.kind === "close") {
      const top = stack.pop();
      if (top) closeOf.set(top.idx, i);
    } else if (tok.kind === "text" && stack[stack.length - 1]?.name === "w:t") {
      const nearest = (name: string) => {
        for (let s = stack.length - 1; s >= 0; s--) if (stack[s].name === name) return s;
        return -1;
      };
      const ps = nearest("w:p");
      nodes.push({
        tok: i,
        text: decode(tok.raw),
        p: ps === -1 ? -1 : stack[ps].idx,
        tc: stack[nearest("w:tc")]?.idx ?? -1,
        tr: stack[nearest("w:tr")]?.idx ?? -1,
        path: stack.map((s) => s.name).join("/"),
        pPath: stack.slice(0, Math.max(ps, 0)).map((s) => s.name).join("/"),
      });
    }
  });

  // 1. Within each paragraph, move every tag's characters into the text node where it starts.
  const byParagraph = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    const list = byParagraph.get(n.p) ?? [];
    list.push(i);
    byParagraph.set(n.p, list);
  });
  const paragraphText = new Map<number, string>();
  for (const [p, members] of byParagraph) {
    const full = members.map((i) => nodes[i].text).join("");
    paragraphText.set(p, full);
    const owner: number[] = [];
    members.forEach((i) => {
      for (let c = 0; c < nodes[i].text.length; c++) owner.push(i);
    });
    for (const m of full.matchAll(TAG_RE)) {
      for (let c = m.index! + 1; c < m.index! + m[0].length; c++) owner[c] = owner[m.index!];
    }
    members.forEach((i) => (nodes[i].text = ""));
    for (let c = 0; c < full.length; c++) nodes[owner[c]].text += full[c];
  }

  // 2. Find the tags, now each inside one text node.
  const tags: Tag[] = [];
  nodes.forEach((n, ni) => {
    for (const m of n.text.matchAll(TAG_RE)) {
      const raw = plainTag(m[0]);
      tags.push({ node: ni, start: m.index!, end: m.index! + m[0].length, raw, word: blockWord(raw) });
    }
  });

  // 3. Pair block tags and decide where each group goes.
  const groups: Tag[][] = [];
  const open: Tag[][] = [];
  for (const tag of tags) {
    if (tag.word === "if" || tag.word === "for") open.push([tag]);
    else if (tag.word === "elif" || tag.word === "else") open[open.length - 1]?.push(tag);
    else if (tag.word === "endif" || tag.word === "endfor") {
      const group = open.pop();
      if (group) groups.push([...group, tag]);
    }
  }

  const before = new Map<number, string[]>();
  const after = new Map<number, string[]>();
  const replace = new Map<number, { to: number; src: string }>();
  const moved = new Set<Tag>();
  const add = (map: Map<number, string[]>, at: number, src: string) => map.set(at, [...(map.get(at) ?? []), src]);
  const alone = (tag: Tag) => plainTag(paragraphText.get(nodes[tag.node].p) ?? "").trim() === tag.raw;

  for (const group of groups) {
    const first = nodes[group[0].node];
    const last = nodes[group[group.length - 1].node];
    if (group.length === 2 && first.tr !== -1 && first.tr === last.tr && first.tc !== last.tc) {
      // Opening tag in one cell, closing tag in another cell of the same row: the row is the unit.
      add(before, first.tr, group[0].raw);
      add(after, closeOf.get(first.tr)!, group[1].raw);
      group.forEach((t) => moved.add(t));
    } else if (group.every(alone) && group.every((t) => nodes[t.node].pPath === first.pPath && nodes[t.node].p !== -1)) {
      // Every tag on its own line: whole paragraphs are the unit, and the tag lines disappear.
      for (const t of group) {
        const p = nodes[t.node].p;
        replace.set(p, { to: closeOf.get(p)!, src: t.raw });
        moved.add(t);
      }
    } else if (!group.every((t) => nodes[t.node].path === first.path)) {
      const opener = describe(group[0]);
      throw new DocxError(
        `${opener} and its closing tag can't be paired where they are. Put each on its own line, keep them in the same paragraph, or put them in the first and last cell of one table row.`,
      );
    }
  }

  // 4. Write the template source.
  const nodeAt = new Map(nodes.map((n, i) => [n.tok, i]));
  const tagsIn = new Map<number, Tag[]>();
  for (const t of tags) tagsIn.set(t.node, [...(tagsIn.get(t.node) ?? []), t]);

  let out = "";
  for (let i = 0; i < toks.length; i++) {
    for (const src of before.get(i) ?? []) out += src;
    const r = replace.get(i);
    if (r) {
      out += r.src;
      i = r.to;
      continue;
    }
    const tok = toks[i];
    const ni = nodeAt.get(i);
    if (ni !== undefined) {
      const text = nodes[ni].text;
      let pos = 0;
      for (const t of tagsIn.get(ni) ?? []) {
        out += protect(encode(text.slice(pos, t.start)));
        if (!moved.has(t)) out += t.raw;
        pos = t.end;
      }
      out += protect(encode(text.slice(pos)));
    } else if (tok.kind === "open" && tok.name === "w:t" && !/xml:space=/.test(tok.raw)) {
      out += tok.raw.replace(/^<w:t\b/, '<w:t xml:space="preserve"');
    } else {
      out += protect(tok.raw);
    }
    for (const src of after.get(i) ?? []) out += src;
  }
  return out;
}

/**
 * Fixes structures Word refuses to open after content was removed:
 * a table with no rows is dropped, and a cell (or header, footer, text box)
 * left with no paragraph gets an empty one.
 */
function repair(xml: string): string {
  const toks = tokenize(xml);
  const NEEDS_P = new Set(["w:tc", "w:hdr", "w:ftr", "w:txbxContent", "w:footnote", "w:endnote"]);
  const stack: { name: string; idx: number; hasP: boolean; hasRow: boolean }[] = [];
  const drop: [number, number][] = [];
  const insertBefore = new Set<number>();
  toks.forEach((tok, i) => {
    const parent = stack[stack.length - 1];
    if ((tok.kind === "open" || tok.kind === "self") && parent) {
      if (tok.name === "w:p") parent.hasP = true;
      if (tok.name === "w:tr") parent.hasRow = true;
    }
    if (tok.kind === "open") stack.push({ name: tok.name, idx: i, hasP: false, hasRow: false });
    else if (tok.kind === "close") {
      const e = stack.pop();
      if (!e) return;
      if (e.name === "w:tbl" && !e.hasRow) drop.push([e.idx, i]);
      else if (NEEDS_P.has(e.name) && !e.hasP) insertBefore.add(i);
    }
  });
  if (!drop.length && !insertBefore.size) return xml;
  let out = "";
  for (let i = 0; i < toks.length; i++) {
    const d = drop.find(([from]) => from === i);
    if (d) {
      i = d[1];
      continue;
    }
    if (insertBefore.has(i)) out += "<w:p/>";
    out += toks[i].raw;
  }
  // Dropping a table can leave its cell without a paragraph; one more pass settles it.
  return drop.length ? repair(out) : out;
}

/** Plain text of a WordprocessingML part: one line per paragraph. */
export function xmlText(xml: string): string {
  let out = "";
  let inText = false;
  for (const tok of tokenize(xml)) {
    if (tok.name === "w:t") inText = tok.kind === "open";
    else if (tok.kind === "text" && inText) out += decode(tok.raw);
    else if (tok.kind === "self" && (tok.name === "w:br" || tok.name === "w:cr")) out += "\n";
    else if (tok.kind === "self" && tok.raw === "<w:tab/>") out += "\t";
    else if (tok.kind === "close" && tok.name === "w:p") out += "\n";
  }
  return out.replace(/\n+$/, "");
}

/** Preview HTML for filled Word text: one paragraph per line. */
export function docxPreviewHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("\n");
}

// ------------------------------------------------------------------ public

const cache = new Map<string, DocxTemplate | DocxError>();

function partLabel(path: string): string {
  if (path === "word/document.xml") return "";
  if (path.includes("header")) return "In a header: ";
  if (path.includes("footer")) return "In a footer: ";
  return "In a footnote: ";
}

/** True when the bytes are a Word package (a zip with a main document part). */
export function isDocx(bytes: Uint8Array): boolean {
  try {
    return Boolean(unzipSync(bytes)["word/document.xml"]);
  } catch {
    return false;
  }
}

/** Unzips and compiles a Word template (base64). Results are cached. Throws DocxError. */
export function loadDocx(base64: string): DocxTemplate {
  const cached = cache.get(base64);
  if (cached instanceof DocxError) throw cached;
  if (cached) return cached;
  let result: DocxTemplate | DocxError;
  try {
    result = compile(base64);
  } catch (e) {
    result = e instanceof DocxError ? e : new DocxError((e as Error).message);
  }
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(base64, result);
  if (result instanceof DocxError) throw result;
  return result;
}

function compile(base64: string): DocxTemplate {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(base64ToBytes(base64));
  } catch {
    throw new DocxError("This file isn't a Word document. Save it from Word as .docx and try again.");
  }
  if (!files["word/document.xml"]) throw new DocxError("This file isn't a Word document. Save it from Word as .docx and try again.");

  // A .dotx template becomes a .docx document when filled.
  const types = files["[Content_Types].xml"];
  if (types) files["[Content_Types].xml"] = strToU8(strFromU8(types).replace("wordprocessingml.template.main+xml", "wordprocessingml.document.main+xml"));

  const parts: DocxTemplate["parts"] = [];
  for (const path of Object.keys(files)) {
    if (!TEMPLATED_PART.test(path)) continue;
    const xml = strFromU8(files[path]);
    if (!/\{\{|\{%/.test(xml.replace(/<[^>]*>/g, ""))) continue;
    try {
      parts.push({ path, nodes: parseTemplate(xmlToTemplate(xml), { standalone: false }) });
    } catch (e) {
      if (e instanceof TemplateError) throw new DocxError(partLabel(path) + e.reason);
      if (e instanceof DocxError) throw new DocxError(partLabel(path) + e.message);
      throw e;
    }
  }
  return { files, parts, text: xmlText(strFromU8(files["word/document.xml"])) };
}

export function docxExprs(t: DocxTemplate): TemplateExpr[] {
  return t.parts.flatMap((p) => templateExprs(p.nodes));
}

function fillPart(t: DocxTemplate, path: string, lookup: Lookup): string {
  const part = t.parts.find((p) => p.path === path);
  return part ? repair(renderTemplate(part.nodes, lookup, escapeValue)) : strFromU8(t.files[path]);
}

/** The filled .docx file. */
export function fillDocx(t: DocxTemplate, lookup: Lookup): Uint8Array {
  const files = { ...t.files };
  for (const part of t.parts) files[part.path] = strToU8(fillPart(t, part.path, lookup));
  return zipSync(files);
}

/** Plain text of the filled document body, for previews. */
export function fillDocxText(t: DocxTemplate, lookup: Lookup): string {
  return xmlText(fillPart(t, "word/document.xml", lookup));
}
