// The Interview tab (answering questions) and the Documents tab (the result).
// Answer inputs carry `data-answer` (plus `data-item` / `data-field` inside
// lists); main.ts reads them back into the answers.

import { escapeHtml as esc, markdownToHtml } from "../engine/markdown.ts";
import type { Missing, RenderedDoc, Scope } from "../engine/session.ts";
import type { Answers, Field, Page, Question, Value, Workflow } from "../engine/types.ts";

type Answerable = Pick<Question, "id" | "type" | "options" | "label">;

function control(q: Answerable | Field, value: Value | undefined, attrs: string): string {
  const v = value ?? null;
  switch (q.type) {
    case "textarea":
      return `<textarea ${attrs} rows="3">${esc(typeof v === "string" ? v : "")}</textarea>`;
    case "number":
    case "currency":
      return `<div class="${q.type === "currency" ? "money" : ""}"><input type="number" step="any" data-kind="number" ${attrs} value="${typeof v === "number" ? v : ""}"></div>`;
    case "date":
      return `<input type="date" ${attrs} value="${esc(typeof v === "string" ? v : "")}">`;
    case "yesno":
      return `<div class="choices inline">
        <label><input type="radio" data-kind="bool" value="true" ${attrs}${v === true ? " checked" : ""}> Yes</label>
        <label><input type="radio" data-kind="bool" value="false" ${attrs}${v === false ? " checked" : ""}> No</label>
      </div>`;
    case "choice":
      return `<div class="choices">${(q.options ?? [])
        .map((o) => `<label><input type="radio" value="${esc(o.value)}" ${attrs}${v === o.value ? " checked" : ""}> ${esc(o.label)}</label>`)
        .join("")}</div>`;
    case "multichoice": {
      const picked = Array.isArray(v) ? v : [];
      return `<div class="choices">${(q.options ?? [])
        .map((o) => `<label><input type="checkbox" data-kind="multi" value="${esc(o.value)}" ${attrs}${picked.includes(o.value) ? " checked" : ""}> ${esc(o.label)}</label>`)
        .join("")}</div>`;
    }
    default:
      return `<input type="text" ${attrs} value="${esc(typeof v === "string" ? v : v === null ? "" : String(v))}">`;
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
          return `<label class="q">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ""}${control(f, record[f.id], attrs)}</label>`;
        })
        .join("");
      return `<div class="list-item"><div class="list-head">#${i + 1}<button class="icon" data-action="remove-item" data-q="${esc(q.id)}" data-index="${i}" title="Remove">✕</button></div>${fields}</div>`;
    })
    .join("");
  return `${cards}<button class="small" data-action="add-item" data-q="${esc(q.id)}">+ Add ${items.length ? "another" : "one"}</button>`;
}

function questionHtml(q: Question, answers: Answers, missing: Set<string>): string {
  const attrs = `name="${esc(q.id)}" data-answer="${esc(q.id)}"`;
  const body = q.type === "list" ? listControl(q, answers[q.id]) : control(q, answers[q.id], attrs);
  const flagged = missing.has(q.id);
  return `<div class="q${flagged ? " missing" : ""}">
    <div class="q-title">${esc(q.label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
    ${q.help ? `<div class="hint">${esc(q.help)}</div>` : ""}
    ${body}
  </div>`;
}

export function interviewHtml(
  wf: Workflow,
  pages: Page[],
  pageIndex: number,
  answers: Answers,
  scope: Scope,
  missing: Missing[],
  caseJson: string,
  showValues: boolean,
): string {
  const page = pages[pageIndex];
  const missingIds = new Set(missing.map((m) => m.questionId));
  const missingByPage = (p: Page) => p.questions.filter((q) => missingIds.has(q.id)).length;

  const steps = pages
    .map((p, i) => {
      const n = missingByPage(p);
      return `<li><button class="${i === pageIndex ? "current" : ""}" data-action="goto-page" data-index="${i}">${esc(p.title || `Page ${i + 1}`)}${n ? `<span class="count">${n}</span>` : ""}</button></li>`;
    })
    .join("");

  const questions = page ? page.questions.filter((q) => scope.questionVisible(q)) : [];
  const values = [...wf.pages.flatMap((p) => p.questions.map((q) => q.id)), ...wf.computed.map((c) => c.id)]
    .map((id) => `<tr><td><code>${esc(id)}</code></td><td>${esc(JSON.stringify(scope.lookup(id)))}</td></tr>`)
    .join("");

  return `<div class="interview">
    <nav class="steps"><ol>${steps}</ol>
      <button class="small" data-action="restart">Start over</button>
    </nav>
    <div class="main-col">
      <section class="card">
        ${page ? `<h2>${esc(page.title)}</h2>${questions.map((q) => questionHtml(q, answers, missingIds)).join("") || `<p class="hint">Nothing to ask on this page with the current answers.</p>`}` : `<p>This workflow has no pages.</p>`}
        <div class="row-actions nav">
          <button data-action="goto-page" data-index="${pageIndex - 1}"${pageIndex <= 0 ? " disabled" : ""}>Back</button>
          ${pageIndex < pages.length - 1
            ? `<button class="primary" data-action="goto-page" data-index="${pageIndex + 1}">Next</button>`
            : `<button class="primary" data-action="tab" data-tab="documents">Assemble documents</button>`}
        </div>
      </section>
    </div>
    <aside class="side-col">
      <section class="card">
        <h3>Case record</h3>
        <p class="hint">Stand-in for the case this interview runs against. Questions with a pre-fill rule start from these values.</p>
        <textarea id="case-json" class="code" rows="12" spellcheck="false">${esc(caseJson)}</textarea>
        <div class="row-actions"><button class="small" data-action="apply-case">Apply case record</button></div>
      </section>
      <section class="card">
        <h3><label class="check"><input type="checkbox" data-action="toggle-values"${showValues ? " checked" : ""}> Show live values</label></h3>
        ${showValues ? `<p class="hint">What rules and templates see. Hidden questions read as null.</p><table class="values">${values}</table>` : ""}
      </section>
    </aside>
  </div>`;
}

export function documentsHtml(docs: RenderedDoc[], missing: Missing[]): string {
  const warning = missing.length
    ? `<div class="banner">Some required answers are missing, so these drafts have gaps:
        <ul>${missing.map((m) => `<li>${esc(m.label)}</li>`).join("")}</ul>
        <button class="small" data-action="tab" data-tab="interview">Back to the interview</button></div>`
    : "";
  const cards = docs
    .map(
      (d, i) => `<section class="doc-out">
        <div class="doc-bar"><h2>${esc(d.doc.name)}</h2>
          <button data-action="print-doc" data-index="${i}">Print / Save as PDF</button>
          <button data-action="copy-doc" data-index="${i}">Copy text</button>
          <button data-action="download-doc" data-index="${i}">Download HTML</button>
        </div>
        ${d.error ? `<p class="bad">${esc(d.error)}</p>` : `<article class="paper" id="doc-${i}">${markdownToHtml(d.text)}</article>`}
      </section>`,
    )
    .join("");
  return `${warning}${cards || `<p class="hint">No documents apply to these answers.</p>`}`;
}
