// Run (answering the questionnaire, one page at a time with a step list) and
// Finished documents. Answer inputs carry `data-answer` (plus `data-item` /
// `data-field` inside lists); main.ts reads them back into the answers.

import { escapeHtml as esc } from "../engine/markdown.ts";
import type { Missing, RenderedDoc, Scope } from "../engine/session.ts";
import type { Answers, Field, Page, Question, Value, Workflow } from "../engine/types.ts";
import { icon } from "./icons.ts";

type Answerable = Pick<Question, "id" | "type" | "options" | "label">;

function control(q: Answerable | Field, value: Value | undefined, attrs: string): string {
  const v = value ?? null;
  switch (q.type) {
    case "textarea":
      return `<textarea class="textarea" ${attrs} rows="3">${esc(typeof v === "string" ? v : "")}</textarea>`;
    case "number":
    case "currency":
      return `<div class="${q.type === "currency" ? "money" : ""}"><input type="number" step="any" class="input" data-kind="number" ${attrs} value="${typeof v === "number" ? v : ""}"></div>`;
    case "date":
      return `<input type="date" class="input date" ${attrs} value="${esc(typeof v === "string" ? v : "")}">`;
    case "yesno":
      return `<div class="choices">
        <label class="choice"><input type="radio" data-kind="bool" value="true" ${attrs}${v === true ? " checked" : ""}><span>Yes</span></label>
        <label class="choice"><input type="radio" data-kind="bool" value="false" ${attrs}${v === false ? " checked" : ""}><span>No</span></label>
      </div>`;
    case "choice":
      return `<div class="choices">${(q.options ?? [])
        .map((o) => `<label class="choice"><input type="radio" value="${esc(o.value)}" ${attrs}${v === o.value ? " checked" : ""}><span>${esc(o.label)}</span></label>`)
        .join("")}</div>`;
    case "multichoice": {
      const picked = Array.isArray(v) ? v : [];
      return `<div class="choices">${(q.options ?? [])
        .map((o) => `<label class="choice"><input type="checkbox" data-kind="multi" value="${esc(o.value)}" ${attrs}${picked.includes(o.value) ? " checked" : ""}><span>${esc(o.label)}</span></label>`)
        .join("")}</div>`;
    }
    default:
      return `<input type="text" class="input" ${attrs} value="${esc(typeof v === "string" ? v : v === null ? "" : String(v))}">`;
  }
}

function listControl(q: Question, value: Value | undefined): string {
  const items = Array.isArray(value) ? value : [];
  const cards = items
    .map((item, i) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
      const fields = (q.fields ?? [])
        .map((f) => {
          const name = `${q.id}__${i}__${f.id}`;
          const attrs = `name="${esc(name)}" data-answer="${esc(q.id)}" data-item="${i}" data-field="${esc(f.id)}"`;
          return `<div class="q sub"><div class="q-title"><span>${esc(f.label)}</span>${f.required ? '<span class="req">*</span>' : ""}</div>${control(f, record[f.id], attrs)}</div>`;
        })
        .join("");
      return `<div class="list-item"><div class="list-head"><span>${esc(q.label)} ${i + 1}</span><button class="btn btn-ghost btn-icon danger" data-action="remove-item" data-q="${esc(q.id)}" data-index="${i}" title="Remove">${icon("trash")}</button></div>${fields}</div>`;
    })
    .join("");
  return `${cards}<button class="btn btn-sm" data-action="add-item" data-q="${esc(q.id)}">${icon("plus")} Add ${items.length ? "another" : "one"}</button>`;
}

function questionHtml(q: Question, answers: Answers, missing: Set<string>): string {
  const attrs = `name="${esc(q.id)}" data-answer="${esc(q.id)}"`;
  const body = q.type === "list" ? listControl(q, answers[q.id]) : control(q, answers[q.id], attrs);
  const flagged = missing.has(q.id);
  return `<div class="q${flagged ? " missing" : ""}">
    <div class="q-title"><span>${esc(q.label)}</span>${q.required ? '<span class="req" title="Required">*</span>' : ""}</div>
    ${q.help ? `<div class="hint">${esc(q.help)}</div>` : ""}
    ${body}
  </div>`;
}

export interface RunState {
  pageIndex: number;
  showTestData: boolean;
  showValues: boolean;
  visited: Set<number>;
}

export function runHtml(wf: Workflow, pages: Page[], s: RunState, answers: Answers, scope: Scope, missing: Missing[], caseJson: string): string {
  const reviewing = s.pageIndex >= pages.length;
  const page = reviewing ? undefined : pages[s.pageIndex];
  const missingIds = new Set(missing.map((m) => m.questionId));
  const missingOn = (p: Page) => p.questions.filter((q) => missingIds.has(q.id)).length;

  const steps = [
    ...pages.map((p, i) => {
      const n = missingOn(p);
      const current = i === s.pageIndex;
      const done = !current && s.visited.has(i) && n === 0;
      const state = current ? "current" : done ? "done" : s.visited.has(i) && n ? "needs" : "";
      const mark = done ? icon("check-circle") : current ? icon("dot") : icon("circle");
      return `<li class="${state}"><button data-action="goto-page" data-index="${i}">${mark}<span>${esc(p.title || `Page ${i + 1}`)}</span>${state === "needs" ? `<span class="count">${n}</span>` : ""}</button></li>`;
    }),
    `<li class="${reviewing ? "current" : ""}"><button data-action="goto-page" data-index="${pages.length}">${reviewing ? icon("dot") : icon("circle")}<span>Review</span></button></li>`,
  ].join("");

  let mainCard: string;
  if (reviewing) {
    mainCard = `<section class="card run-card">
      <h1>Review</h1>
      ${missing.length
        ? `<div class="banner">Some required answers are missing. The documents will have gaps until they're filled in:<ul>${missing.map((m) => `<li>${esc(m.label)}</li>`).join("")}</ul></div>`
        : `<p class="ok">${icon("check-circle")} Everything required is answered.</p>`}
      <div class="run-nav">
        <button class="btn" data-action="goto-page" data-index="${pages.length - 1}"${pages.length ? "" : " disabled"}>${icon("left")} Back</button>
        <button class="btn btn-primary" data-action="tab" data-tab="documents">${icon("doc")} Generate documents</button>
      </div>
    </section>`;
  } else if (page) {
    const questions = page.questions.filter((q) => scope.questionVisible(q));
    mainCard = `<section class="card run-card">
      <h1>${esc(page.title)}</h1>
      ${questions.map((q) => questionHtml(q, answers, missingIds)).join("") || `<p class="hint">Nothing to ask on this page with the current answers.</p>`}
      <div class="run-nav">
        <button class="btn" data-action="goto-page" data-index="${s.pageIndex - 1}"${s.pageIndex <= 0 ? " disabled" : ""}>${icon("left")} Back</button>
        <button class="btn btn-primary" data-action="goto-page" data-index="${s.pageIndex + 1}">${s.pageIndex < pages.length - 1 ? "Next" : "Review"} ${icon("right")}</button>
      </div>
    </section>`;
  } else {
    mainCard = `<section class="card run-card"><p>This workflow has no pages.</p></section>`;
  }

  const values = [...wf.pages.flatMap((p) => p.questions.map((q) => q.id)), ...wf.computed.map((c) => c.id)]
    .map((id) => `<tr><td><code>${esc(id)}</code></td><td>${esc(JSON.stringify(scope.lookup(id)))}</td></tr>`)
    .join("");
  const testPanel = s.showTestData
    ? `<aside class="side-col test-panel">
        <section class="card">
          <div class="panel-title">Case record</div>
          <p class="hint">Stand-in for the case this runs against. Questions with a pre-fill rule start from these values.</p>
          <textarea id="case-json" class="textarea code" rows="12" spellcheck="false">${esc(caseJson)}</textarea>
          <div class="card-actions"><button class="btn btn-sm" data-action="apply-case">Apply case record</button></div>
        </section>
        <section class="card">
          <label class="switch"><input type="checkbox" data-action="toggle-values"${s.showValues ? " checked" : ""}><span class="track"></span> Show live values</label>
          ${s.showValues ? `<p class="hint">What rules and templates see. Hidden questions read as null.</p><table class="values">${values}</table>` : ""}
        </section>
      </aside>`
    : "";

  return `<div class="run${s.showTestData ? " with-test" : ""}">
    <nav class="steps">
      <div class="run-name">${esc(wf.name)}</div>
      <ol>${steps}</ol>
      <div class="steps-tools">
        <button class="btn btn-sm btn-ghost" data-action="restart">${icon("restart")} Start over</button>
        <button class="btn btn-sm btn-ghost${s.showTestData ? " on" : ""}" data-action="toggle-test-data">${icon("beaker")} Test data</button>
      </div>
    </nav>
    <div class="run-main">${mainCard}</div>
    ${testPanel}
  </div>`;
}

/** `wordPreview(i)` returns the host for document i's formatted Word preview. */
export function documentsHtml(docs: RenderedDoc[], missing: Missing[], wordPreview: (index: number) => string): string {
  const warning = missing.length
    ? `<div class="banner">Some required answers are missing, so these drafts have gaps:
        <ul>${missing.map((m) => `<li>${esc(m.label)}</li>`).join("")}</ul>
        <button class="btn btn-sm" data-action="tab" data-tab="run">${icon("left")} Back to the questions</button></div>`
    : "";
  const cards = docs
    .map(
      (d, i) => `<section class="doc-out">
        <div class="doc-bar"><span class="doc-icon">${icon(d.file ? "file-word" : "file")}</span><h2>${esc(d.doc.name)}</h2>
          ${d.file
            ? `<button class="btn btn-primary" data-action="download-docx" data-index="${i}">${icon("download")} Word file</button>`
            : `<button class="btn" data-action="print-doc" data-index="${i}">${icon("print")} Print / Save as PDF</button>`}
          <button class="btn" data-action="copy-doc" data-index="${i}">Copy text</button>
          ${d.file ? "" : `<button class="btn" data-action="download-doc" data-index="${i}">${icon("download")} HTML</button>`}
        </div>
        ${d.file ? `<p class="hint doc-note">Preview. The downloaded Word file is the exact document.</p>` : ""}
        ${d.error ? `<p class="bad">${esc(d.error)}</p>` : d.file ? `<article class="word-doc" id="doc-${i}">${wordPreview(i)}</article>` : `<article class="paper" id="doc-${i}">${d.html}</article>`}
      </section>`,
    )
    .join("");
  return `<div class="documents">
    <div class="section-head"><div><h1>Finished documents</h1><p class="hint">${docs.length} document${docs.length === 1 ? "" : "s"} from the current answers.</p></div></div>
    ${warning}${cards || `<p class="hint">No documents apply to these answers.</p>`}
  </div>`;
}
