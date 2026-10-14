// The builder: Questionnaire (one page at a time, with an outline to organize
// and search), Templates and Calculations. Inputs carry `data-bind` paths into
// the workflow (e.g. `pages.0.questions.2.label`) and buttons carry
// `data-action`; main.ts applies both generically.

import { FUNCTION_DOCS } from "../engine/expr.ts";
import { escapeHtml as esc } from "../engine/markdown.ts";
import { hasOptions, QUESTION_TYPES, type Issue } from "../engine/validate.ts";
import { loadDocx } from "../engine/docx.ts";
import type { DocTemplate, Field, Option, Question, Workflow } from "../engine/types.ts";
import { icon } from "./icons.ts";

export const TYPE_LABELS: Record<string, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  currency: "Money",
  date: "Date",
  yesno: "Yes / No",
  choice: "Pick one",
  multichoice: "Pick any",
  combobox: "Pick or type",
  list: "Repeating list",
};

/** A short badge for each type in the outline, like Gavel's type chips. */
const TYPE_CHIPS: Record<string, string> = {
  text: "T",
  textarea: "¶",
  number: "#",
  currency: "$",
  date: "D",
  yesno: "Y/N",
  choice: "1",
  multichoice: "✓",
  combobox: "1+",
  list: "≡",
};

export function optionsToText(options: Option[] | undefined): string {
  return (options ?? []).map((o) => (o.value === o.label ? o.value : `${o.value} = ${o.label}`)).join("\n");
}

export function textToOptions(text: string): Option[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf("=");
      if (eq === -1) return { value: slug(line), label: line };
      const value = line.slice(0, eq).trim();
      return { value, label: line.slice(eq + 1).trim() || value };
    });
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "option";
}

function typeSelect(bind: string, value: string, allowList: boolean): string {
  const types = allowList ? QUESTION_TYPES : QUESTION_TYPES.filter((t) => t !== "list");
  return `<select class="select" data-bind="${bind}" data-rerender>${types
    .map((t) => `<option value="${t}"${t === value ? " selected" : ""}>${TYPE_LABELS[t]}</option>`)
    .join("")}</select>`;
}

function input(bind: string, value: string | undefined, opts: { placeholder?: string; optional?: boolean; code?: boolean; cls?: string } = {}): string {
  return `<input type="text" data-bind="${bind}"${opts.optional ? ' data-kind="optional"' : ""} class="input ${opts.code ? "code " : ""}${opts.cls ?? ""}" value="${esc(value ?? "")}" placeholder="${esc(opts.placeholder ?? "")}" spellcheck="${opts.code ? "false" : "true"}">`;
}

function requiredSwitch(bind: string, on: boolean | undefined): string {
  return `<label class="switch"><input type="checkbox" data-bind="${bind}" data-kind="bool"${on ? " checked" : ""}><span class="track"></span> Required</label>`;
}

function fieldRow(f: Field, base: string, pi: number, qi: number, fi: number): string {
  const b = `${base}.fields.${fi}`;
  const choice = hasOptions(f.type);
  return `<div class="field-row">
    ${input(`${b}.label`, f.label, { placeholder: "Label" })}
    ${input(`${b}.id`, f.id, { placeholder: "name", code: true })}
    ${typeSelect(`${b}.type`, f.type, false)}
    ${requiredSwitch(`${b}.required`, f.required)}
    <button class="btn btn-ghost btn-icon" data-action="remove-field" data-page="${pi}" data-q="${qi}" data-field="${fi}" title="Remove field">${icon("x")}</button>
    ${choice ? `<textarea class="textarea options" data-bind="${b}.options" data-kind="options" rows="3" placeholder="value = Label, one per line">${esc(optionsToText(f.options))}</textarea>` : ""}
  </div>`;
}

function questionCard(q: Question, pi: number, qi: number, count: number): string {
  const b = `pages.${pi}.questions.${qi}`;
  const choice = hasOptions(q.type);
  return `<section class="card q-card" id="qcard-${pi}-${qi}">
    <div class="q-card-head">
      <span class="num">${qi + 1}</span>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-icon" data-action="move-question" data-page="${pi}" data-q="${qi}" data-dir="-1" title="Move up"${qi === 0 ? " disabled" : ""}>${icon("up")}</button>
      <button class="btn btn-ghost btn-icon" data-action="move-question" data-page="${pi}" data-q="${qi}" data-dir="1" title="Move down"${qi === count - 1 ? " disabled" : ""}>${icon("down")}</button>
      <button class="btn btn-ghost btn-icon" data-action="duplicate-question" data-page="${pi}" data-q="${qi}" title="Duplicate">${icon("copy")}</button>
      <button class="btn btn-ghost btn-icon danger" data-action="remove-question" data-page="${pi}" data-q="${qi}" title="Delete question">${icon("trash")}</button>
    </div>
    <label class="field"><span class="label">Question</span><input type="text" class="input q-text" data-bind="${b}.label" value="${esc(q.label)}"></label>
    <div class="row-2">
      <label class="field"><span class="label">Variable name</span><input type="text" class="input code" data-bind="${b}.id" value="${esc(q.id)}" spellcheck="false"></label>
      <label class="field"><span class="label">Question type</span>${typeSelect(`${b}.type`, q.type, true)}</label>
    </div>
    <div class="row-2">
      <label class="field"><span class="label">Help text</span>${input(`${b}.help`, q.help, { optional: true, placeholder: "Shown under the question (optional)" })}</label>
      <div class="field switch-cell">${requiredSwitch(`${b}.required`, q.required)}</div>
    </div>
    ${choice ? `<label class="field"><span class="label">Options <span class="hint">one per line, <code>value = Label</code></span></span><textarea class="textarea" data-bind="${b}.options" data-kind="options" rows="4">${esc(optionsToText(q.options))}</textarea></label>` : ""}
    ${q.type === "list"
      ? `<div class="fields"><div class="hint">Asked for each item. In templates: <code>{% for item in ${esc(q.id)} %}{{ item.${esc(q.fields?.[0]?.id ?? "name")} }}{% endfor %}</code></div>
        ${(q.fields ?? []).map((f, fi) => fieldRow(f, b, pi, qi, fi)).join("")}
        <button class="btn btn-sm" data-action="add-field" data-page="${pi}" data-q="${qi}">${icon("plus")} Field</button></div>`
      : ""}
    <div class="logic">
      <div class="logic-title">${icon("logic")} Logic</div>
      <div class="row-2">
        <label class="field"><span class="label">Show only if</span>${input(`${b}.showIf`, q.showIf, { optional: true, code: true, placeholder: 'e.g. fee_type == "hourly" and not waived' })}</label>
        <label class="field"><span class="label">Pre-fill from case</span>${input(`${b}.prefill`, q.prefill, { optional: true, code: true, placeholder: "e.g. case.client.name" })}</label>
      </div>
    </div>
  </section>`;
}

export function issuesHtml(issues: Issue[]): string {
  if (issues.length === 0) return `<p class="ok">${icon("check")} No problems found.</p>`;
  const errors = issues.filter((i) => i.level === "error").length;
  const head = `<p class="${errors ? "bad" : "warnline"}">${errors} error${errors === 1 ? "" : "s"}, ${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}</p>`;
  return head + `<ul class="issues">${issues.map((i) => `<li class="${i.level}"><strong>${esc(i.where)}</strong> ${esc(i.message)}</li>`).join("")}</ul>`;
}

/** The count beside "Problems" in the questionnaire sidebar. */
export function issuesBadgeHtml(issues: Issue[]): string {
  const errors = issues.filter((i) => i.level === "error").length;
  return `<span class="badge ${errors ? "bad" : issues.length ? "warn" : "ok"}">${issues.length}</span>`;
}

// ------------------------------------------------------------ questionnaire

export interface OutlineState {
  page: number;
  search: string;
  type: string;
}

/** The sidebar list of pages and questions; filtered when searching. */
export function outlineHtml(wf: Workflow, s: OutlineState): string {
  const term = s.search.trim().toLowerCase();
  const matches = (q: Question) =>
    (!term || q.label.toLowerCase().includes(term) || q.id.toLowerCase().includes(term)) && (!s.type || q.type === s.type);
  const filtering = Boolean(term || s.type);
  const rows = wf.pages
    .map((page, pi) => {
      const qs = page.questions.map((q, qi) => ({ q, qi })).filter(({ q }) => matches(q));
      if (filtering && qs.length === 0) return "";
      const open = filtering || pi === s.page;
      return `<div class="outline-page${pi === s.page ? " current" : ""}">
        <button class="outline-page-head" data-action="builder-page" data-index="${pi}">
          ${icon(open ? "chevron-down" : "chevron-right")}<span class="name">${esc(page.title || `Page ${pi + 1}`)}</span>
          ${page.showIf ? `<span class="chip rule" title="Shown only if ${esc(page.showIf)}">if</span>` : ""}
          <span class="count">${page.questions.length}</span>
        </button>
        ${open
          ? `<ul class="outline-qs">${qs
              .map(
                ({ q, qi }) => `<li><button data-action="select-question" data-page="${pi}" data-q="${qi}" title="${esc(TYPE_LABELS[q.type] ?? q.type)}">
                  <span class="type-chip">${TYPE_CHIPS[q.type] ?? "?"}</span><span class="label-text">${esc(q.label || "(no label)")}</span><span class="var">${esc(q.id)}</span>
                </button></li>`,
              )
              .join("") || `<li class="empty">No questions yet.</li>`}</ul>`
          : ""}
      </div>`;
    })
    .join("");
  return rows || `<p class="hint pad">Nothing matches.</p>`;
}

export function questionnaireHtml(wf: Workflow, s: OutlineState, issues: Issue[]): string {
  const pi = Math.min(s.page, wf.pages.length - 1);
  const page = wf.pages[pi];
  const errors = issues.filter((i) => i.level === "error").length;
  const sidebar = `<aside class="sidebar">
    <div class="sidebar-section">
      <div class="panel-title">Organize and search</div>
      <div class="search">${icon("search")}<input type="search" id="outline-search" class="input" placeholder="Search questions and variables" value="${esc(s.search)}"></div>
      <select id="outline-type" class="select" aria-label="Filter by question type">
        <option value="">All question types</option>
        ${Object.entries(TYPE_LABELS).map(([t, l]) => `<option value="${t}"${s.type === t ? " selected" : ""}>${l}</option>`).join("")}
      </select>
      <div class="sidebar-buttons">
        <button class="btn btn-sm" data-action="add-question" data-page="${pi}"${page ? "" : " disabled"}>${icon("plus")} Question</button>
        <button class="btn btn-sm" data-action="add-page">${icon("plus")} Page</button>
      </div>
    </div>
    <div class="outline" id="outline">${outlineHtml(wf, { ...s, page: pi })}</div>
    <details class="sidebar-section problems"${errors ? " open" : ""}>
      <summary><span class="panel-title">Problems</span><span id="issues-badge">${issuesBadgeHtml(issues)}</span></summary>
      <div id="issues">${issuesHtml(issues)}</div>
    </details>
  </aside>`;

  if (!page) {
    return `<div class="builder">${sidebar}<div class="builder-main"><section class="card empty-card"><p>This workflow has no pages yet.</p><button class="btn btn-primary" data-action="add-page">${icon("plus")} Add the first page</button></section></div></div>`;
  }

  const last = wf.pages.length - 1;
  const b = `pages.${pi}`;
  const toolbar = `<div class="page-toolbar">
    <select id="page-select" class="select" aria-label="Page">${wf.pages
      .map((p, i) => `<option value="${i}"${i === pi ? " selected" : ""}>${i + 1}. ${esc(p.title || `Page ${i + 1}`)}</option>`)
      .join("")}</select>
    <span class="spacer"></span>
    <span class="page-count">Page ${pi + 1} of ${wf.pages.length}</span>
    <button class="btn btn-ghost btn-icon" data-action="builder-page" data-index="0" title="First page"${pi === 0 ? " disabled" : ""}>${icon("first")}</button>
    <button class="btn btn-ghost btn-icon" data-action="builder-page" data-index="${pi - 1}" title="Previous page"${pi === 0 ? " disabled" : ""}>${icon("left")}</button>
    <button class="btn btn-ghost btn-icon" data-action="builder-page" data-index="${pi + 1}" title="Next page"${pi === last ? " disabled" : ""}>${icon("right")}</button>
    <button class="btn btn-ghost btn-icon" data-action="builder-page" data-index="${last}" title="Last page"${pi === last ? " disabled" : ""}>${icon("last")}</button>
    <button class="btn btn-sm" data-action="add-page">${icon("plus")} Add page</button>
  </div>`;

  const pageCard = `<section class="card page-card">
    <label class="field"><span class="label">Page title</span>${input(`${b}.title`, page.title, { placeholder: "Page title", cls: "title" })}<span class="hint">Shown to the person answering.</span></label>
    <label class="field"><span class="label">Show this page only if</span>${input(`${b}.showIf`, page.showIf, { optional: true, code: true, placeholder: "always" })}</label>
    <div class="card-actions">
      <button class="btn btn-sm" data-action="move-page" data-page="${pi}" data-dir="-1"${pi === 0 ? " disabled" : ""}>${icon("left")} Move earlier</button>
      <button class="btn btn-sm" data-action="move-page" data-page="${pi}" data-dir="1"${pi === last ? " disabled" : ""}>Move later ${icon("right")}</button>
      <span class="spacer"></span>
      <button class="btn btn-sm btn-danger" data-action="remove-page" data-page="${pi}">${icon("trash")} Delete page</button>
    </div>
  </section>`;

  const cards = page.questions.map((q, qi) => questionCard(q, pi, qi, page.questions.length)).join("");
  return `<div class="builder">
    ${sidebar}
    <div class="builder-main">
      ${toolbar}
      ${pageCard}
      ${cards}
      <button class="add-question" data-action="add-question" data-page="${pi}">${icon("plus")} Add question</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ templates

function wordInput(target: string): string {
  return `<input type="file" data-docx-for="${target}" accept=".docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>`;
}

function wordSource(d: DocTemplate, di: number): string {
  const docx = d.docx!;
  let text: string;
  try {
    text = loadDocx(docx.data).text;
  } catch (e) {
    text = `Couldn't read this file: ${(e as Error).message}`;
  }
  const kb = Math.round((docx.data.length * 3) / 4 / 1024);
  return `<div class="word-source">
    <div class="word-file">${icon("file")}<strong>${esc(docx.fileName)}</strong> <span class="hint">${kb} KB Word template</span></div>
    <div class="card-actions">
      <button class="btn btn-sm" data-action="download-template" data-index="${di}">${icon("download")} Download template</button>
      <label class="btn btn-sm">${icon("upload")} Replace file${wordInput(String(di))}</label>
      <button class="btn btn-sm btn-danger" data-action="remove-docx" data-index="${di}">Stop using this file</button>
    </div>
    <pre class="word-text">${esc(text)}</pre>
  </div>`;
}

function referenceHtml(wf: Workflow, caseFields: string[], issues: Issue[]): string {
  const vars = wf.pages.flatMap((p) => p.questions);
  return `<aside class="side-col">
    <section class="card sticky">
      <div class="panel-title">Problems</div>
      <div id="issues">${issuesHtml(issues)}</div>
      <div class="panel-title">Variables</div>
      <ul class="vars">
        ${vars.map((q) => `<li><code>${esc(q.id)}</code> <span>${TYPE_LABELS[q.type] ?? ""}</span></li>`).join("")}
        ${wf.computed.map((c) => `<li><code>${esc(c.id)}</code> <span>calculation</span></li>`).join("")}
        ${caseFields.map((f) => `<li><code>case.${esc(f)}</code> <span>case</span></li>`).join("")}
      </ul>
      <details>
        <summary>Rule and template syntax</summary>
        <div class="syntax">
          <p><code>and or not == != &lt; &gt; + - * /</code><br><code>x in ["a","b"]</code> · <code>list contains x</code> · filters: <code>x | upper</code></p>
          <p><code>{{ expr }}</code><br><code>{% if expr %} … {% elif expr %} … {% else %} … {% endif %}</code><br><code>{% for item in list %} … {% endfor %}</code></p>
          <p><code># Heading</code> · <code>**bold**</code> · <code>- bullet</code> · <code>-&gt; centered &lt;-</code> · <code>---pagebreak---</code></p>
          <p><strong>In Word:</strong> a block tag alone on its line includes, removes or repeats whole paragraphs, and the tag lines disappear. Put <code>{% for x in list %}</code> in the first cell of a table row and <code>{% endfor %}</code> in the last cell to repeat the row. Values keep the formatting they were typed in.</p>
          <ul>${Object.values(FUNCTION_DOCS).map((d) => `<li><code>${esc(d)}</code></li>`).join("")}</ul>
        </div>
      </details>
    </section>
  </aside>`;
}

export function templatesHtml(wf: Workflow, issues: Issue[], caseFields: string[], previews: Record<string, string>): string {
  const docs = wf.documents
    .map(
      (d, di) => `<section class="card doc">
        <div class="doc-head">
          <span class="doc-icon">${icon(d.docx ? "file-word" : "file")}</span>
          ${input(`documents.${di}.name`, d.name, { placeholder: "Document name", cls: "title" })}
          <button class="btn btn-ghost btn-icon danger" data-action="remove-document" data-index="${di}" title="Delete document">${icon("trash")}</button>
        </div>
        <label class="field inline"><span class="label">Generate only if</span>${input(`documents.${di}.showIf`, d.showIf, { optional: true, code: true, placeholder: "always" })}</label>
        <div class="doc-edit">
          ${d.docx ? wordSource(d, di) : `<textarea class="textarea code body" data-bind="documents.${di}.body" rows="18" spellcheck="false">${esc(d.body)}</textarea>`}
          <div class="paper mini" id="preview-${di}">${previews[d.id] ?? ""}</div>
        </div>
        ${d.docx ? "" : `<div class="card-actions"><label class="btn btn-sm">${icon("upload")} Use a Word file instead${wordInput(String(di))}</label></div>`}
      </section>`,
    )
    .join("");

  return `<div class="two-col">
    <div class="main-col">
      <div class="section-head">
        <div><h1>Document templates</h1><p class="hint">Previews use the answers from Run.</p></div>
        <span class="spacer"></span>
        <button class="btn" data-action="add-document">${icon("plus")} Written here</button>
        <label class="btn btn-primary">${icon("upload")} Word template${wordInput("new")}</label>
      </div>
      ${docs || `<section class="card empty-card"><p>No documents yet. Upload a Word template with tags, or write one here.</p></section>`}
      <p class="hint">Type the same tags in Word. Try the <a href="samples/engagement-letter.docx" download>sample Word template</a>, made for the sample Engagement Letter.</p>
    </div>
    ${referenceHtml(wf, caseFields, issues)}
  </div>`;
}

// --------------------------------------------------------------- calculations

export function calculationsHtml(wf: Workflow, issues: Issue[], caseFields: string[]): string {
  const rows = wf.computed
    .map(
      (c, ci) => `<div class="computed-row">
        ${input(`computed.${ci}.id`, c.id, { code: true, placeholder: "name" })}
        <span class="eq">=</span>
        ${input(`computed.${ci}.expr`, c.expr, { code: true, placeholder: "expression", cls: "grow" })}
        ${input(`computed.${ci}.label`, c.label, { optional: true, placeholder: "What it means" })}
        <button class="btn btn-ghost btn-icon danger" data-action="remove-computed" data-index="${ci}" title="Delete">${icon("trash")}</button>
      </div>`,
    )
    .join("");
  return `<div class="two-col">
    <div class="main-col">
      <div class="section-head">
        <div><h1>Calculations</h1><p class="hint">Values worked out from answers, such as totals or a name to print. Use them in rules and templates like any question.</p></div>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-action="add-computed">${icon("plus")} Calculation</button>
      </div>
      <section class="card">
        <div class="computed-head"><span class="label">Name</span><span></span><span class="label">Formula</span><span class="label">What it means</span><span></span></div>
        ${rows || `<p class="hint">None yet.</p>`}
      </section>
    </div>
    ${referenceHtml(wf, caseFields, issues)}
  </div>`;
}
