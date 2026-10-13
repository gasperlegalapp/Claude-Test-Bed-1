// Runs a workflow against a set of answers and a case record.
//
// Values are resolved lazily: reading a question checks whether it is
// currently visible (its page's and its own show-if), and a hidden question
// reads as null even if it was answered earlier. That way a user who changes
// an earlier answer never leaks a stale answer from an abandoned branch into
// the documents. Computed values are evaluated on demand, so their order in
// the workflow doesn't matter.

import { evaluate, parse, truthy, type Lookup, type Node } from "./expr.ts";
import { parseTemplate, renderTemplate } from "./template.ts";
import { docxPreviewHtml, fillDocx, fillDocxText, loadDocx } from "./docx.ts";
import { markdownToHtml } from "./markdown.ts";
import type { Answers, DocTemplate, Page, Question, Value, Workflow } from "./types.ts";

const parsed = new Map<string, Node | Error>();

/** Parses with a cache; returns an Error instead of throwing. */
export function compile(src: string): Node | Error {
  let node = parsed.get(src);
  if (!node) {
    try {
      node = parse(src);
    } catch (e) {
      node = e as Error;
    }
    parsed.set(src, node);
  }
  return node;
}

export interface Scope {
  lookup: Lookup;
  pageVisible(page: Page): boolean;
  questionVisible(question: Question): boolean;
  /** Evaluates any expression against this scope; errors read as null. */
  eval(src: string): Value;
}

export function createScope(workflow: Workflow, answers: Answers, caseData: Value = null): Scope {
  const questions = new Map<string, { q: Question; page: Page }>();
  for (const page of workflow.pages) for (const q of page.questions) questions.set(q.id, { q, page });
  const computed = new Map(workflow.computed.map((c) => [c.id, c]));

  const memo = new Map<string, Value>();
  const visibleMemo = new Map<string, boolean>();
  const resolving = new Set<string>();

  const run = (src: string): Value => {
    const node = compile(src);
    return node instanceof Error ? null : evaluate(node, lookup);
  };

  // A broken or circular show-if leaves the question visible: better to ask
  // one question too many than to silently drop one. Validation reports it.
  const condition = (key: string, src: string | undefined): boolean => {
    if (!src || !src.trim()) return true;
    const cached = visibleMemo.get(key);
    if (cached !== undefined) return cached;
    if (resolving.has(key)) return true;
    resolving.add(key);
    const node = compile(src);
    const result = node instanceof Error ? true : truthy(evaluate(node, lookup));
    resolving.delete(key);
    visibleMemo.set(key, result);
    return result;
  };

  const pageVisible = (page: Page) => condition(`page:${page.id}`, page.showIf);
  const questionVisible = (q: Question) => {
    const entry = questions.get(q.id);
    return (!entry || pageVisible(entry.page)) && condition(`q:${q.id}`, q.showIf);
  };

  function lookup(name: string): Value {
    if (name === "case") return caseData;
    if (memo.has(name)) return memo.get(name)!;
    if (resolving.has(name)) return null;
    resolving.add(name);
    let value: Value = null;
    const c = computed.get(name);
    const entry = questions.get(name);
    if (c) value = run(c.expr);
    else if (entry && questionVisible(entry.q)) value = answers[name] ?? null;
    resolving.delete(name);
    memo.set(name, value);
    return value;
  }

  return { lookup, pageVisible, questionVisible, eval: run };
}

/** Starting answers from each question's `prefill` expression over the case record. */
export function prefillAnswers(workflow: Workflow, caseData: Value): Answers {
  const answers: Answers = {};
  const lookup: Lookup = (name) => (name === "case" ? caseData : null);
  for (const page of workflow.pages) {
    for (const q of page.questions) {
      if (!q.prefill) continue;
      const node = compile(q.prefill);
      if (node instanceof Error) continue;
      const value = evaluate(node, lookup);
      if (value !== null && value !== "") answers[q.id] = value;
    }
  }
  return answers;
}

export function isBlank(v: Value | undefined): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

export interface Missing {
  questionId: string;
  label: string;
}

/** Required questions (and required list fields) that are visible but unanswered. */
export function missingRequired(workflow: Workflow, answers: Answers, scope: Scope): Missing[] {
  const missing: Missing[] = [];
  for (const page of workflow.pages) {
    for (const q of page.questions) {
      if (!scope.questionVisible(q)) continue;
      const value = answers[q.id];
      if (q.required && isBlank(value)) {
        missing.push({ questionId: q.id, label: q.label });
        continue;
      }
      if (q.type === "list" && Array.isArray(value)) {
        value.forEach((item, i) => {
          for (const f of q.fields ?? []) {
            const v = item && typeof item === "object" && !Array.isArray(item) ? item[f.id] : undefined;
            if (f.required && isBlank(v)) missing.push({ questionId: q.id, label: `${q.label} #${i + 1}: ${f.label}` });
          }
        });
      }
    }
  }
  return missing;
}

export interface RenderedDoc {
  doc: DocTemplate;
  text: string;
  html: string;
  /** The filled .docx, for documents built from a Word template. */
  file?: Uint8Array;
  error?: string;
}

/** Fills one document. `file: false` skips building the .docx (for live previews). */
export function renderDocument(doc: DocTemplate, lookup: Lookup, opts: { file: boolean }): Omit<RenderedDoc, "doc" | "error"> {
  if (doc.docx) {
    const template = loadDocx(doc.docx.data);
    const text = fillDocxText(template, lookup);
    return { text, html: docxPreviewHtml(text), file: opts.file ? fillDocx(template, lookup) : undefined };
  }
  const text = renderTemplate(parseTemplate(doc.body), lookup);
  return { text, html: markdownToHtml(text) };
}

/** Renders every document whose show-if passes. */
export function assemble(workflow: Workflow, answers: Answers, caseData: Value = null): RenderedDoc[] {
  const scope = createScope(workflow, answers, caseData);
  const out: RenderedDoc[] = [];
  for (const doc of workflow.documents) {
    // As with questions, a broken show-if keeps the document rather than dropping it.
    if (doc.showIf && !(compile(doc.showIf) instanceof Error) && !truthy(scope.eval(doc.showIf))) continue;
    try {
      out.push({ doc, ...renderDocument(doc, scope.lookup, { file: true }) });
    } catch (e) {
      out.push({ doc, text: "", html: "", error: (e as Error).message });
    }
  }
  return out;
}
