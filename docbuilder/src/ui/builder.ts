// The Build tab: a form over the workflow's data. Inputs carry `data-bind`
// paths into the workflow (e.g. `pages.0.questions.2.label`) and buttons carry
// `data-action`; main.ts applies both generically.

import { FUNCTION_DOCS } from "../engine/expr.ts";
import { escapeHtml as esc } from "../engine/markdown.ts";
import { QUESTION_TYPES, type Issue } from "../engine/validate.ts";
import { loadDocx } from "../engine/docx.ts";
import type { DocTemplate, Field, Option, Question, Workflow } from "../engine/types.ts";

export const TYPE_LABELS: Record<string, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  currency: "Money",
  date: "Date",
  yesno: "Yes / No",
  choice: "Pick one",
  multichoice: "Pick any",
  list: "Repeating list",
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
  return `<select data-bind="${bind}" data-rerender>${types
    .map((t) => `<option value="${t}"${t === value ? " selected" : ""}>${TYPE_LABELS[t]}</option>`)
    .join("")}</select>`;
}

function input(bind: string, value: string | undefined, opts: { placeholder?: string; optional?: boolean; code?: boolean; cls?: string } = {}): string {
  return `<input type="text" data-bind="${bind}"${opts.optional ? ' data-kind="optional"' : ""} class="${opts.code ? "code " : ""}${opts.cls ?? ""}" value="${esc(value ?? "")}" placeholder="${esc(opts.placeholder ?? "")}" spellcheck="${opts.code ? "false" : "true"}">`;
}

function fieldRow(f: Field, base: string, pi: number, qi: number, fi: number): string {
  const b = `${base}.fields.${fi}`;
  const choice = f.type === "choice" || f.type === "multichoice";
  return `<div class="field-row">
    ${input(`${b}.label`, f.label, { placeholder: "Label" })}
    ${input(`${b}.id`, f.id, { placeholder: "name", code: true })}
    ${typeSelect(`${b}.type`, f.type, false)}
    <label class="check"><input type="checkbox" data-bind="${b}.required" data-kind="bool"${f.required ? " checked" : ""}> Required</label>
    <button class="icon" data-action="remove-field" data-page="${pi}" data-q="${qi}" data-field="${fi}" title="Remove field">✕</button>
    ${choice ? `<textarea class="options" data-bind="${b}.options" data-kind="options" rows="3" placeholder="value = Label, one per line">${esc(optionsToText(f.options))}</textarea>` : ""}
  </div>`;
}

function questionEditor(q: Question, pi: number, qi: number, open: boolean, last: boolean): string {
  const b = `pages.${pi}.questions.${qi}`;
  const key = `${pi}.${qi}`;
  const summary = `<button class="q-summary" data-action="toggle-question" data-key="${key}">
      <span class="q-label">${esc(q.label || "(no label)")}</span>
      <span class="q-meta"><code>${esc(q.id)}</code> · ${TYPE_LABELS[q.type] ?? esc(q.type)}${q.required ? " · required" : ""}</span>
      ${q.showIf ? `<span class="badge rule" title="Show if">if ${esc(q.showIf)}</span>` : ""}
      ${q.prefill ? `<span class="badge prefill" title="Pre-fill">from ${esc(q.prefill)}</span>` : ""}
    </button>`;
  if (!open) return `<div class="question">${summary}</div>`;
  const choice = q.type === "choice" || q.type === "multichoice";
  return `<div class="question open">${summary}
    <div class="q-body">
      <div class="grid">
        <label>Question<input type="text" data-bind="${b}.label" value="${esc(q.label)}"></label>
        <label>Variable name<input type="text" class="code" data-bind="${b}.id" value="${esc(q.id)}" spellcheck="false"></label>
        <label>Type${typeSelect(`${b}.type`, q.type, true)}</label>
        <label class="check"><input type="checkbox" data-bind="${b}.required" data-kind="bool"${q.required ? " checked" : ""}> Required</label>
      </div>
      <label>Help text${input(`${b}.help`, q.help, { optional: true, placeholder: "Shown under the question" })}</label>
      <div class="grid two">
        <label>Show only if${input(`${b}.showIf`, q.showIf, { optional: true, code: true, placeholder: 'e.g. fee_type == "hourly" and not waived' })}</label>
        <label>Pre-fill from case${input(`${b}.prefill`, q.prefill, { optional: true, code: true, placeholder: "e.g. case.client.name" })}</label>
      </div>
      ${choice ? `<label>Options <span class="hint">one per line, <code>value = Label</code></span><textarea data-bind="${b}.options" data-kind="options" rows="4">${esc(optionsToText(q.options))}</textarea></label>` : ""}
      ${q.type === "list"
        ? `<div class="fields"><div class="hint">Asked for each item. In templates: <code>{% for item in ${esc(q.id)} %}{{ item.${esc(q.fields?.[0]?.id ?? "name")} }}{% endfor %}</code></div>
          ${(q.fields ?? []).map((f, fi) => fieldRow(f, b, pi, qi, fi)).join("")}
          <button class="small" data-action="add-field" data-page="${pi}" data-q="${qi}">+ Field</button></div>`
        : ""}
      <div class="row-actions">
        <button class="small" data-action="move-question" data-page="${pi}" data-q="${qi}" data-dir="-1"${qi === 0 ? " disabled" : ""}>Move up</button>
        <button class="small" data-action="move-question" data-page="${pi}" data-q="${qi}" data-dir="1"${last ? " disabled" : ""}>Move down</button>
        <button class="small danger" data-action="remove-question" data-page="${pi}" data-q="${qi}">Delete question</button>
      </div>
    </div>
  </div>`;
}

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
    <div class="word-file"><strong>${esc(docx.fileName)}</strong> <span class="hint">${kb} KB Word template</span></div>
    <div class="row-actions">
      <button class="small" data-action="download-template" data-index="${di}">Download template</button>
      <label class="button small">Replace file${wordInput(String(di))}</label>
      <button class="small danger" data-action="remove-docx" data-index="${di}">Stop using this file</button>
    </div>
    <pre class="word-text">${esc(text)}</pre>
  </div>`;
}

export function issuesHtml(issues: Issue[]): string {
  if (issues.length === 0) return `<p class="ok">No problems found.</p>`;
  const errors = issues.filter((i) => i.level === "error").length;
  const head = `<p class="${errors ? "bad" : "warnline"}">${errors} error${errors === 1 ? "" : "s"}, ${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}</p>`;
  return head + `<ul class="issues">${issues.map((i) => `<li class="${i.level}"><strong>${esc(i.where)}</strong> ${esc(i.message)}</li>`).join("")}</ul>`;
}

export function builderHtml(wf: Workflow, openQuestion: string | null, issues: Issue[], caseFields: string[], previews: Record<string, string>): string {
  const pages = wf.pages
    .map((page, pi) => {
      const b = `pages.${pi}`;
      return `<section class="card page">
        <div class="page-head">
          <span class="step">Page ${pi + 1}</span>
          ${input(`${b}.title`, page.title, { placeholder: "Page title", cls: "title" })}
          <button class="icon" data-action="move-page" data-page="${pi}" data-dir="-1" title="Move up"${pi === 0 ? " disabled" : ""}>↑</button>
          <button class="icon" data-action="move-page" data-page="${pi}" data-dir="1" title="Move down"${pi === wf.pages.length - 1 ? " disabled" : ""}>↓</button>
          <button class="icon" data-action="remove-page" data-page="${pi}" title="Delete page">✕</button>
        </div>
        <label class="inline">Show page only if${input(`${b}.showIf`, page.showIf, { optional: true, code: true, placeholder: "always" })}</label>
        ${page.questions.map((q, qi) => questionEditor(q, pi, qi, openQuestion === `${pi}.${qi}`, qi === page.questions.length - 1)).join("")}
        <button class="small" data-action="add-question" data-page="${pi}">+ Question</button>
      </section>`;
    })
    .join("");

  const computed = wf.computed
    .map(
      (c, ci) => `<div class="computed-row">
        ${input(`computed.${ci}.id`, c.id, { code: true, placeholder: "name" })}
        <span class="eq">=</span>
        ${input(`computed.${ci}.expr`, c.expr, { code: true, placeholder: "expression", cls: "grow" })}
        ${input(`computed.${ci}.label`, c.label, { optional: true, placeholder: "What it means" })}
        <button class="icon" data-action="remove-computed" data-index="${ci}" title="Delete">✕</button>
      </div>`,
    )
    .join("");

  const docs = wf.documents
    .map(
      (d, di) => `<section class="card doc">
        <div class="page-head">
          ${input(`documents.${di}.name`, d.name, { placeholder: "Document name", cls: "title" })}
          <button class="icon" data-action="remove-document" data-index="${di}" title="Delete document">✕</button>
        </div>
        <label class="inline">Generate only if${input(`documents.${di}.showIf`, d.showIf, { optional: true, code: true, placeholder: "always" })}</label>
        <div class="doc-edit">
          ${d.docx ? wordSource(d, di) : `<textarea class="code body" data-bind="documents.${di}.body" rows="18" spellcheck="false">${esc(d.body)}</textarea>`}
          <div class="paper mini" id="preview-${di}">${previews[d.id] ?? ""}</div>
        </div>
        ${d.docx ? "" : `<div class="row-actions"><label class="button small">Use a Word file instead${wordInput(String(di))}</label></div>`}
      </section>`,
    )
    .join("");

  const vars = wf.pages.flatMap((p) => p.questions);
  return `<div class="build">
    <div class="main-col">
      <section class="card">
        <div class="grid two">
          <label>Workflow name<input type="text" data-bind="name" value="${esc(wf.name)}"></label>
          <label>Description${input("description", wf.description, { optional: true })}</label>
        </div>
      </section>
      <h2>Interview</h2>
      ${pages}
      <button data-action="add-page">+ Page</button>
      <h2>Computed values <span class="hint">derived from answers, usable anywhere</span></h2>
      <section class="card">${computed || `<p class="hint">None yet.</p>`}<button class="small" data-action="add-computed">+ Computed value</button></section>
      <h2>Documents <span class="hint">preview uses the current interview answers</span></h2>
      ${docs}
      <div class="row-actions">
        <button data-action="add-document">+ Document</button>
        <label class="button">+ Word template${wordInput("new")}</label>
        <span class="hint">Type the same tags in Word. Try the <a href="samples/engagement-letter.docx" download>sample Word template</a>, made for the sample Engagement Letter.</span>
      </div>
    </div>
    <aside class="side-col">
      <section class="card sticky">
        <h3>Problems</h3>
        <div id="issues">${issuesHtml(issues)}</div>
        <h3>Variables</h3>
        <ul class="vars">
          ${vars.map((q) => `<li><code>${esc(q.id)}</code> <span>${TYPE_LABELS[q.type] ?? ""}</span></li>`).join("")}
          ${wf.computed.map((c) => `<li><code>${esc(c.id)}</code> <span>computed</span></li>`).join("")}
          ${caseFields.map((f) => `<li><code>case.${esc(f)}</code></li>`).join("")}
        </ul>
        <details>
          <summary>Rule and template syntax</summary>
          <div class="syntax">
            <p><code>and or not == != &lt; &gt; + - * /</code><br><code>x in ["a","b"]</code> · <code>list contains x</code></p>
            <p><code>{{ expr }}</code><br><code>{% if expr %} … {% elif expr %} … {% else %} … {% endif %}</code><br><code>{% for item in list %} … {% endfor %}</code></p>
            <p><code># Heading</code> · <code>**bold**</code> · <code>- bullet</code> · <code>-&gt; centered &lt;-</code> · <code>---pagebreak---</code></p>
            <p><strong>In Word:</strong> a block tag alone on its line includes, removes or repeats whole paragraphs, and the tag lines disappear. Put <code>{% for x in list %}</code> in the first cell of a table row and <code>{% endfor %}</code> in the last cell to repeat the row. Values keep the formatting they were typed in.</p>
            <ul>${Object.values(FUNCTION_DOCS).map((d) => `<li><code>${esc(d)}</code></li>`).join("")}</ul>
          </div>
        </details>
      </section>
    </aside>
  </div>`;
}
