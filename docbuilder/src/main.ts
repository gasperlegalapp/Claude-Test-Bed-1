import { casePaths } from "./data/samples.ts";
import { base64ToBytes, bytesToBase64, DOCX_MIME, isDocx } from "./engine/docx.ts";
import { escapeHtml as esc, markdownToHtml } from "./engine/markdown.ts";
import { assemble, createScope, missingRequired, prefillAnswers, renderDocument, type RenderedDoc } from "./engine/session.ts";
import { hasOptions, normalizeWorkflow, validateWorkflow, type Issue } from "./engine/validate.ts";
import type { Answers, DocTemplate, Question, Value, Workflow } from "./engine/types.ts";
import { calculationsHtml, issuesBadgeHtml, issuesHtml, outlineHtml, questionnaireHtml, slug, templatesHtml, textToOptions } from "./ui/builder.ts";
import { documentsHtml, runHtml } from "./ui/interview.ts";
import { icon } from "./ui/icons.ts";
import { load, resetAll, save, type Saved } from "./store.ts";
import { fitToWidth, renderWordPreview } from "./ui/wordPreview.ts";
import "./styles.css";

type Tab = "questions" | "templates" | "calculations" | "settings" | "run" | "documents";

const KEY_STORAGE = "docbuilder.apikey";

let data: Saved = load();
const ui = {
  tab: "questions" as Tab,
  // Questionnaire: the page being edited, the outline filters, and a question to scroll to.
  builderPage: 0,
  search: "",
  typeFilter: "",
  focusQuestion: null as string | null,
  // Run: the page being answered (pages.length is the Review step) and pages already seen.
  pageIndex: 0,
  visited: new Set<number>(),
  showTestData: false,
  showValues: false,
  jsonDraft: null as string | null,
  jsonError: "",
  ai: {
    open: false,
    busy: false,
    status: "",
    error: "",
    summary: "",
    issues: [] as Issue[],
    request: "",
    undo: null as Workflow | null,
  },
};
let renderedDocs: RenderedDoc[] = [];

const root = document.querySelector<HTMLDivElement>("#app")!;

// ------------------------------------------------------------------ state

function current(): Workflow {
  return data.workflows.find((w) => w.id === data.currentId) ?? data.workflows[0];
}

function caseFields(): string[] {
  return casePaths(data.caseData);
}

function answers(): Answers {
  const wf = current();
  if (!data.answers[wf.id]) data.answers[wf.id] = prefillAnswers(wf, data.caseData);
  return data.answers[wf.id];
}

let saveTimer = 0;
let storageFull = false;
function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const full = !save(data);
    if (full === storageFull) return;
    storageFull = full;
    render();
  }, 300);
}

function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function allNames(wf: Workflow): string[] {
  return [...wf.pages.flatMap((p) => p.questions.map((q) => q.id)), ...wf.computed.map((c) => c.id)];
}

function blankWorkflow(): Workflow {
  return {
    id: uniqueId("workflow", data.workflows.map((w) => w.id)),
    name: "New workflow",
    pages: [{ id: "page_1", title: "Page 1", questions: [] }],
    computed: [],
    documents: [],
  };
}

function addWorkflow(wf: Workflow): void {
  wf.id = uniqueId(slug(wf.id || wf.name), data.workflows.map((w) => w.id));
  data.workflows.push(wf);
  data.currentId = wf.id;
  resetPositions();
}

/** Back to the first page in the builder and in Run, e.g. after switching workflows. */
function resetPositions(): void {
  ui.builderPage = 0;
  ui.pageIndex = 0;
  ui.visited = new Set();
  ui.focusQuestion = null;
}

/** Writes `value` at a dotted path like `pages.0.questions.2.label`; undefined deletes. */
function setPath(target: unknown, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
  const last = parts[parts.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
}

/** Keeps options and fields consistent with a question's type after it changes. */
function fixShape(q: Question): void {
  const choice = hasOptions(q.type);
  if (choice && !q.options) q.options = [{ value: "option_1", label: "Option 1" }];
  if (!choice) delete q.options;
  if (q.type === "list" && !q.fields?.length) q.fields = [{ id: "name", label: "Name", type: "text" }];
  if (q.type !== "list") delete q.fields;
  for (const f of q.fields ?? []) {
    const fChoice = hasOptions(f.type);
    if (fChoice && !f.options) f.options = [{ value: "option_1", label: "Option 1" }];
    if (!fChoice) delete f.options;
  }
}

function previewDoc(wf: Workflow, doc: DocTemplate, index: number): string {
  try {
    const scope = createScope(wf, answers(), data.caseData);
    const out = renderDocument(doc, scope.lookup, { file: Boolean(doc.docx) });
    return out.file ? wordPreviewHost(`word-build-${index}`, out.file, out.html) : out.html;
  } catch (e) {
    return `<p class="bad">${esc((e as Error).message)}</p>`;
  }
}

function previews(wf: Workflow): Record<string, string> {
  return Object.fromEntries(wf.documents.map((d, i) => [d.id, previewDoc(wf, d, i)]));
}

// Word previews are drawn after render() puts their hosts in the page. Until
// then (or if drawing fails) each host shows the plain-text preview.
const pendingWord = new Map<string, Uint8Array>();

function wordPreviewHost(id: string, file: Uint8Array, fallback: string): string {
  pendingWord.set(id, file);
  return `<div class="word-preview" id="${id}"><div class="word-fallback">${fallback}</div></div>`;
}

function drawWordPreviews(): void {
  for (const [id, file] of pendingWord) {
    const host = root.querySelector<HTMLElement>(`#${id}`);
    if (host) renderWordPreview(host, file).catch(() => host.classList.add("word-failed"));
  }
  pendingWord.clear();
}

window.addEventListener("resize", () => root.querySelectorAll<HTMLElement>(".word-preview").forEach(fitToWidth));

// ----------------------------------------------------------------- render

function headerHtml(): string {
  const wf = current();
  const build: [Tab, string, string][] = [
    ["questions", "Questionnaire", "list"],
    ["templates", "Templates", "doc"],
    ["calculations", "Calculations", "calc"],
    ["settings", "Settings", "settings"],
  ];
  const use: [Tab, string, string][] = [
    ["run", "Run", "play"],
    ["documents", "Finished documents", "folder"],
  ];
  const tab = ([id, label, ic]: [Tab, string, string]) =>
    `<button class="${ui.tab === id ? "on" : ""}" data-action="tab" data-tab="${id}">${icon(ic, 14)}${label}</button>`;
  return `<header class="top">
    <div class="top-row">
      <div class="brand"><span class="brand-mark">${icon("doc", 16)}</span><span>DocBuilder</span></div>
      <select id="workflow-select" aria-label="Workflow">${data.workflows
        .map((w) => `<option value="${esc(w.id)}"${w.id === wf.id ? " selected" : ""}>${esc(w.name)}</option>`)
        .join("")}</select>
      <div class="top-actions">
        <button class="hbtn" data-action="new-workflow">${icon("plus", 14)} New</button>
        <label class="hbtn" title="Load a workflow file (.json)">${icon("upload", 14)} Import${importInput()}</label>
        <button class="hbtn" data-action="duplicate-workflow">${icon("copy", 14)} Duplicate</button>
        <button class="hbtn" data-action="delete-workflow"${data.workflows.length <= 1 ? " disabled" : ""}>${icon("trash", 14)} Delete</button>
      </div>
      <span class="spacer"></span>
      <button class="hbtn ai-btn${ui.ai.open ? " on" : ""}" data-action="ai-toggle">${icon("wand", 14)} Build with AI</button>
    </div>
    <nav class="tabs">${build.map(tab).join("")}<span class="sep"></span>${use.map(tab).join("")}</nav>
  </header>
  ${ui.ai.open ? aiHtml() : ""}
  ${storageFull ? `<div class="banner storage">This browser's storage is full, so recent changes won't survive a reload. Export your workflows from Settings, or remove Word files you no longer need.</div>` : ""}`;
}

function aiHtml(): string {
  const ai = ui.ai;
  let key = "";
  try {
    key = sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    // Session storage blocked; the key just isn't remembered.
  }
  const errors = ai.issues.filter((i) => i.level === "error").length;
  return `<section class="ai-panel">
    <textarea id="ai-request" class="textarea" rows="3" placeholder="Describe the workflow to build, or the change to make. e.g. &quot;Simple will for a married couple with minor children, guardian nomination and a pour-over trust option&quot; or &quot;Add a question for the retainer due date and mention it in the letter&quot;"${ai.busy ? " disabled" : ""}>${esc(ai.request)}</textarea>
    <div class="ai-row">
      <button class="btn btn-primary" data-action="ai-create"${ai.busy ? " disabled" : ""}>Create new workflow</button>
      <button class="btn" data-action="ai-modify"${ai.busy ? " disabled" : ""}>Change "${esc(current().name)}"</button>
      ${ai.undo ? `<button class="btn btn-sm" data-action="ai-undo">Undo AI change</button>` : ""}
      <span class="spacer"></span>
      <label class="key">Anthropic API key <input type="password" class="input" id="ai-key" value="${esc(key)}" autocomplete="off" placeholder="sk-ant-..."></label>
    </div>
    <p class="hint">Tip: add your Word template under Templates first, then ask to "build the questions this Word template needs". The key stays in this browser tab and is sent only to Anthropic. In the case app this call runs on your server instead.</p>
    ${ai.busy ? `<p class="status">${esc(ai.status)}</p>` : ""}
    ${ai.error ? `<p class="bad">${esc(ai.error)}</p>` : ""}
    ${ai.summary ? `<div class="ai-result"><strong>Done.</strong> ${esc(ai.summary)}${ai.issues.length ? ` <em>(${errors} error${errors === 1 ? "" : "s"}, ${ai.issues.length - errors} warning${ai.issues.length - errors === 1 ? "" : "s"}; see Problems)</em>` : ""}</div>` : ""}
  </section>`;
}

function settingsHtml(): string {
  const wf = current();
  const text = ui.jsonDraft ?? JSON.stringify(wf, null, 2);
  return `<div class="settings">
    <div class="section-head"><div><h1>Settings</h1></div></div>
    <section class="card">
      <div class="row-2">
        <label class="field"><span class="label">Workflow name</span><input type="text" class="input" data-bind="name" value="${esc(wf.name)}"></label>
        <label class="field"><span class="label">Description</span><input type="text" class="input" data-bind="description" data-kind="optional" value="${esc(wf.description ?? "")}"></label>
      </div>
    </section>
    <section class="card">
      <div class="panel-title">Workflow data</div>
      <p class="hint">The workflow is plain data. Edit it here, or move it between systems with export and import.</p>
      <textarea id="json-edit" class="textarea code" rows="24" spellcheck="false">${esc(text)}</textarea>
      ${ui.jsonError ? `<p class="bad">${esc(ui.jsonError)}</p>` : ""}
      <div class="card-actions">
        <button class="btn btn-primary" data-action="apply-json">Apply changes</button>
        <button class="btn" data-action="export-json">${icon("download")} Export file</button>
        <label class="btn">${icon("upload")} Import file${importInput()}</label>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-danger" data-action="reset-all">Reset everything to the sample</button>
      </div>
    </section>
  </div>`;
}

function bodyHtml(): string {
  const wf = current();
  if (ui.tab === "questions" || ui.tab === "templates" || ui.tab === "calculations") {
    const issues = validateWorkflow(wf, { caseFields: caseFields() });
    if (ui.tab === "questions") {
      ui.builderPage = Math.max(0, Math.min(ui.builderPage, wf.pages.length - 1));
      return questionnaireHtml(wf, outlineState(), issues);
    }
    if (ui.tab === "templates") return templatesHtml(wf, issues, caseFields(), previews(wf));
    return calculationsHtml(wf, issues, caseFields());
  }
  if (ui.tab === "settings") return settingsHtml();
  const ans = answers();
  const scope = createScope(wf, ans, data.caseData);
  const missing = missingRequired(wf, ans, scope);
  if (ui.tab === "run") {
    const pages = wf.pages.filter((p) => scope.pageVisible(p));
    ui.pageIndex = Math.max(0, Math.min(ui.pageIndex, pages.length));
    return runHtml(wf, pages, { pageIndex: ui.pageIndex, showTestData: ui.showTestData, showValues: ui.showValues, visited: ui.visited }, ans, scope, missing, JSON.stringify(data.caseData, null, 2));
  }
  renderedDocs = assemble(wf, ans, data.caseData);
  return documentsHtml(renderedDocs, missing, (i) => wordPreviewHost(`word-doc-${i}`, renderedDocs[i].file!, renderedDocs[i].html));
}

function outlineState() {
  return { page: ui.builderPage, search: ui.search, type: ui.typeFilter };
}

function render(): void {
  pendingWord.clear();
  // A Problems panel the user opened stays open through edits.
  const problemsOpen = root.querySelector<HTMLDetailsElement>("details.problems")?.open;
  root.innerHTML = `${headerHtml()}<main class="tab-${ui.tab}">${bodyHtml()}</main>`;
  const problems = root.querySelector<HTMLDetailsElement>("details.problems");
  if (problems && problemsOpen) problems.open = true;
  drawWordPreviews();
  if (ui.focusQuestion) {
    const card = root.querySelector<HTMLElement>(`#qcard-${ui.focusQuestion}`);
    ui.focusQuestion = null;
    if (card) {
      card.scrollIntoView({ block: "center" });
      card.classList.add("flash");
      card.querySelector<HTMLInputElement>(".q-text")?.focus({ preventScroll: true });
    }
  }
}

/** Identifies an input so focus can be put back after a re-render. */
function focusKey(el: Element | null): string | null {
  if (!(el instanceof HTMLElement)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const d = el.dataset;
  if (d.bind) return `[data-bind="${CSS.escape(d.bind)}"]`;
  if (d.answer) {
    let sel = `[data-answer="${CSS.escape(d.answer)}"]`;
    if (d.item) sel += `[data-item="${d.item}"][data-field="${CSS.escape(d.field ?? "")}"]`;
    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) sel += `[value="${CSS.escape(el.value)}"]`;
    return sel;
  }
  return null;
}

// A change event fires on blur, which can be the mousedown of a button click.
// Re-rendering then would replace the button before its click lands, so wait
// until the pointer is released.
let pointerDown = false;
let renderPending = false;
document.addEventListener("pointerdown", () => (pointerDown = true), true);
document.addEventListener(
  "pointerup",
  () => {
    pointerDown = false;
    if (renderPending) setTimeout(rerenderKeepingFocus);
  },
  true,
);

/** Re-renders after the browser has moved focus, then restores it. */
function rerenderKeepingFocus(): void {
  if (pointerDown) {
    renderPending = true;
    return;
  }
  renderPending = false;
  setTimeout(() => {
    const key = focusKey(document.activeElement);
    const sel = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      ? [document.activeElement.selectionStart, document.activeElement.selectionEnd]
      : null;
    render();
    if (!key) return;
    const el = root.querySelector<HTMLElement>(key);
    el?.focus();
    if (sel && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      try {
        el.setSelectionRange(sel[0], sel[1]);
      } catch {
        // Some input types (number, date) don't support selection ranges.
      }
    }
  });
}

// Light refresh while typing in the builder: problems list and previews only.
let refreshTimer = 0;
function refreshBuilder(): void {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    const wf = current();
    const found = validateWorkflow(wf, { caseFields: caseFields() });
    const issues = root.querySelector("#issues");
    if (issues) issues.innerHTML = issuesHtml(found);
    const badge = root.querySelector("#issues-badge");
    if (badge) badge.innerHTML = issuesBadgeHtml(found);
    // A new error opens the collapsed Problems panel so it isn't missed.
    const panel = issues?.closest("details");
    if (panel && found.some((i) => i.level === "error")) panel.open = true;
    // Typing here doesn't change a Word template, so its formatted preview is left alone.
    wf.documents.forEach((d, i) => {
      const el = root.querySelector(`#preview-${i}`);
      if (el && !d.docx) el.innerHTML = previewDoc(wf, d, i);
    });
  }, 250);
}

// ---------------------------------------------------------------- editing

function applyBinding(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  const wf = current();
  const path = el.dataset.bind!;
  const kind = el.dataset.kind;
  let value: unknown;
  if (kind === "bool") value = (el as HTMLInputElement).checked || undefined;
  else if (kind === "options") value = textToOptions(el.value);
  else if (kind === "optional") value = el.value.trim() ? el.value : undefined;
  else value = el.value;
  setPath(wf, path, value);
  const q = /^pages\.(\d+)\.questions\.(\d+)\./.exec(path);
  if (q && path.endsWith(".type")) fixShape(wf.pages[Number(q[1])].questions[Number(q[2])]);
  persist();
}

function applyAnswer(el: HTMLInputElement | HTMLTextAreaElement): void {
  const ans = answers();
  const id = el.dataset.answer!;
  const kind = el.dataset.kind;
  let value: Value;
  if (kind === "number") value = el.value === "" ? null : Number(el.value);
  else if (kind === "bool") value = el.value === "true";
  else if (kind === "multi") value = [...root.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape((el as HTMLInputElement).name)}"]:checked`)].map((c) => c.value);
  else value = el.value;

  if (el.dataset.item !== undefined) {
    const list = Array.isArray(ans[id]) ? (ans[id] as Value[]) : [];
    const item = list[Number(el.dataset.item)];
    if (item && typeof item === "object" && !Array.isArray(item)) item[el.dataset.field!] = value;
    ans[id] = list;
  } else if (value === null || value === "") delete ans[id];
  else ans[id] = value;
  persist();
}

function move<T>(list: T[], index: number, dir: number): void {
  const to = index + dir;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
}

function downloadFile(name: string, type: string, content: string | Uint8Array): void {
  // fflate's bytes are typed over ArrayBufferLike; they are always plain ArrayBuffers here.
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function standaloneHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.5;max-width:6.5in;margin:1in auto;color:#000}
h1{text-align:center;font-size:16pt}h2{font-size:13pt}.center{text-align:center}.page-break{page-break-after:always}
</style></head><body>${body}</body></html>`;
}

function importInput(): string {
  return `<input type="file" data-import-workflow accept=".json,application/json" hidden>`;
}

/** Loads a workflow file. One with the same id as an existing workflow can replace it, e.g. an updated version. */
async function importWorkflow(file: File): Promise<void> {
  let wf: Workflow;
  try {
    wf = normalizeWorkflow(JSON.parse(await file.text()));
  } catch {
    alert(`"${file.name}" isn't a workflow file.`);
    return render();
  }
  const existing = data.workflows.findIndex((w) => w.id === wf.id);
  if (existing !== -1 && confirm(`Replace your existing "${data.workflows[existing].name}" with the one in this file?\n\nChoose Cancel to keep both.`)) {
    data.workflows[existing] = wf;
    data.currentId = wf.id;
    resetPositions();
  } else {
    addWorkflow(wf);
  }
  ui.tab = "questions";
  ui.jsonDraft = null;
  persist();
  render();
}

/** Attaches an uploaded Word file to document `target` (an index), or adds a new document for "new". */
async function attachWordFile(file: File, target: string): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isDocx(bytes)) {
    alert(`"${file.name}" isn't a Word document. Save it from Word as .docx and try again.`);
    return render();
  }
  const docx = { fileName: file.name, data: bytesToBase64(bytes) };
  const wf = current();
  if (target === "new") {
    const id = uniqueId(slug(file.name.replace(/\.(docx|dotx)$/i, "")), wf.documents.map((d) => d.id));
    wf.documents.push({ id, name: file.name.replace(/\.(docx|dotx)$/i, ""), body: "", docx });
  } else {
    wf.documents[Number(target)].docx = docx;
  }
  persist();
  render();
}

async function runAi(modify: boolean): Promise<void> {
  const request = (root.querySelector<HTMLTextAreaElement>("#ai-request")?.value ?? "").trim();
  const apiKey = (root.querySelector<HTMLInputElement>("#ai-key")?.value ?? "").trim();
  ui.ai.request = request;
  ui.ai.error = "";
  ui.ai.summary = "";
  if (!request) {
    ui.ai.error = "Describe what you want first.";
    return render();
  }
  if (!apiKey) {
    ui.ai.error = "Paste an Anthropic API key to use AI.";
    return render();
  }
  try {
    sessionStorage.setItem(KEY_STORAGE, apiKey);
  } catch {
    // Not remembered; it still works for this call.
  }
  const before = current();
  ui.ai.busy = true;
  ui.ai.status = "Starting…";
  render();
  // Loaded on first use so the SDK isn't part of the initial page.
  const { generateWorkflow, describeError } = await import("./ai/generate.ts");
  try {
    const result = await generateWorkflow({
      apiKey,
      request,
      current: modify ? before : undefined,
      caseFields: caseFields(),
      onStatus: (s) => {
        ui.ai.status = s;
        render();
      },
    });
    if (modify) {
      ui.ai.undo = structuredClone(before);
      result.workflow.id = before.id;
      data.workflows[data.workflows.indexOf(before)] = result.workflow;
    } else {
      ui.ai.undo = null;
      addWorkflow(result.workflow);
    }
    ui.ai.summary = result.summary;
    ui.ai.issues = result.issues;
    ui.ai.request = "";
    ui.tab = "questions";
    persist();
  } catch (e) {
    ui.ai.error = describeError(e);
  } finally {
    ui.ai.busy = false;
    render();
  }
}

// ----------------------------------------------------------------- events

const actions: Record<string, (el: HTMLElement) => void> = {
  tab(el) {
    ui.tab = el.dataset.tab as Tab;
    ui.jsonDraft = null;
    ui.jsonError = "";
  },
  "builder-page"(el) {
    ui.builderPage = Number(el.dataset.index);
    window.scrollTo(0, 0);
  },
  "select-question"(el) {
    ui.builderPage = Number(el.dataset.page);
    ui.focusQuestion = `${el.dataset.page}-${el.dataset.q}`;
  },
  "add-page"() {
    const wf = current();
    const id = uniqueId(`page_${wf.pages.length + 1}`, wf.pages.map((p) => p.id));
    wf.pages.push({ id, title: `Page ${wf.pages.length + 1}`, questions: [] });
    ui.builderPage = wf.pages.length - 1;
  },
  "remove-page"(el) {
    const wf = current();
    const page = wf.pages[Number(el.dataset.page)];
    if (page.questions.length && !confirm(`Delete "${page.title}" and its ${page.questions.length} question(s)?`)) return;
    wf.pages.splice(Number(el.dataset.page), 1);
  },
  "move-page"(el) {
    const pi = Number(el.dataset.page);
    const dir = Number(el.dataset.dir);
    move(current().pages, pi, dir);
    ui.builderPage = pi + dir;
  },
  "add-question"(el) {
    const wf = current();
    const pi = Number(el.dataset.page);
    const qs = wf.pages[pi].questions;
    qs.push({ id: uniqueId("question", allNames(wf)), label: "New question", type: "text" });
    ui.builderPage = pi;
    ui.focusQuestion = `${pi}-${qs.length - 1}`;
  },
  "duplicate-question"(el) {
    const wf = current();
    const pi = Number(el.dataset.page);
    const qi = Number(el.dataset.q);
    const copy = structuredClone(wf.pages[pi].questions[qi]);
    copy.id = uniqueId(copy.id, allNames(wf));
    wf.pages[pi].questions.splice(qi + 1, 0, copy);
    ui.focusQuestion = `${pi}-${qi + 1}`;
  },
  "remove-question"(el) {
    const q = current().pages[Number(el.dataset.page)].questions[Number(el.dataset.q)];
    if (!confirm(`Delete the question "${q.label || q.id}"?`)) return;
    current().pages[Number(el.dataset.page)].questions.splice(Number(el.dataset.q), 1);
  },
  "move-question"(el) {
    const pi = Number(el.dataset.page);
    const qi = Number(el.dataset.q);
    const dir = Number(el.dataset.dir);
    move(current().pages[pi].questions, qi, dir);
    ui.focusQuestion = `${pi}-${qi + dir}`;
  },
  "add-field"(el) {
    const q = current().pages[Number(el.dataset.page)].questions[Number(el.dataset.q)];
    const fields = (q.fields ??= []);
    fields.push({ id: uniqueId("field", fields.map((f) => f.id)), label: "New field", type: "text" });
  },
  "remove-field"(el) {
    current().pages[Number(el.dataset.page)].questions[Number(el.dataset.q)].fields?.splice(Number(el.dataset.field), 1);
  },
  "add-computed"() {
    const wf = current();
    wf.computed.push({ id: uniqueId("value", allNames(wf)), expr: "" });
  },
  "remove-computed"(el) {
    current().computed.splice(Number(el.dataset.index), 1);
  },
  "add-document"() {
    const wf = current();
    const id = uniqueId(`doc_${wf.documents.length + 1}`, wf.documents.map((d) => d.id));
    wf.documents.push({ id, name: "New document", body: "# Title\n\nWrite the document here. Insert answers with {{ variable_name }}." });
  },
  "remove-document"(el) {
    const wf = current();
    const doc = wf.documents[Number(el.dataset.index)];
    if (!confirm(`Delete the document "${doc.name}"?`)) return;
    wf.documents.splice(Number(el.dataset.index), 1);
  },
  "goto-page"(el) {
    ui.visited.add(ui.pageIndex);
    ui.pageIndex = Number(el.dataset.index);
    window.scrollTo(0, 0);
  },
  restart() {
    if (!confirm("Clear all answers and start again from the case record?")) return;
    data.answers[current().id] = prefillAnswers(current(), data.caseData);
    ui.pageIndex = 0;
    ui.visited = new Set();
  },
  "toggle-test-data"() {
    ui.showTestData = !ui.showTestData;
  },
  "apply-case"() {
    const text = root.querySelector<HTMLTextAreaElement>("#case-json")!.value;
    try {
      data.caseData = JSON.parse(text);
    } catch {
      alert("The case record isn't valid JSON.");
      return;
    }
    Object.assign(answers(), prefillAnswers(current(), data.caseData));
  },
  "add-item"(el) {
    const ans = answers();
    const id = el.dataset.q!;
    ans[id] = [...(Array.isArray(ans[id]) ? (ans[id] as Value[]) : []), {}];
  },
  "remove-item"(el) {
    const list = answers()[el.dataset.q!];
    if (Array.isArray(list)) list.splice(Number(el.dataset.index), 1);
  },
  "print-doc"(el) {
    const article = root.querySelector(`#doc-${el.dataset.index}`);
    if (!article) return;
    article.classList.add("print-target");
    document.body.classList.add("printing");
    window.print();
    article.classList.remove("print-target");
    document.body.classList.remove("printing");
  },
  "copy-doc"(el) {
    const doc = renderedDocs[Number(el.dataset.index)];
    navigator.clipboard?.writeText(doc.text).then(
      () => {
        el.textContent = "Copied";
        setTimeout(() => (el.textContent = "Copy text"), 1200);
      },
      () => alert("Copying isn't allowed here."),
    );
  },
  "download-doc"(el) {
    const doc = renderedDocs[Number(el.dataset.index)];
    downloadFile(`${slug(doc.doc.name)}.html`, "text/html", standaloneHtml(doc.doc.name, markdownToHtml(doc.text)));
  },
  "download-docx"(el) {
    const doc = renderedDocs[Number(el.dataset.index)];
    if (doc.file) downloadFile(`${slug(doc.doc.name)}.docx`, DOCX_MIME, doc.file);
  },
  "download-template"(el) {
    const docx = current().documents[Number(el.dataset.index)].docx;
    if (docx) downloadFile(docx.fileName, DOCX_MIME, base64ToBytes(docx.data));
  },
  "remove-docx"(el) {
    const doc = current().documents[Number(el.dataset.index)];
    if (!confirm(`Stop using "${doc.docx?.fileName}" and write this document in the app instead?`)) return;
    delete doc.docx;
  },
  "new-workflow"() {
    addWorkflow(blankWorkflow());
    ui.tab = "questions";
  },
  "duplicate-workflow"() {
    const copy = structuredClone(current());
    copy.name = `${copy.name} (copy)`;
    addWorkflow(copy);
  },
  "delete-workflow"() {
    const wf = current();
    if (data.workflows.length <= 1 || !confirm(`Delete the workflow "${wf.name}"?`)) return;
    data.workflows = data.workflows.filter((w) => w !== wf);
    delete data.answers[wf.id];
    data.currentId = data.workflows[0].id;
    resetPositions();
  },
  "apply-json"() {
    const text = root.querySelector<HTMLTextAreaElement>("#json-edit")!.value;
    try {
      const wf = normalizeWorkflow(JSON.parse(text));
      wf.id = current().id;
      data.workflows[data.workflows.indexOf(current())] = wf;
      ui.jsonDraft = null;
      ui.jsonError = "";
    } catch (e) {
      ui.jsonDraft = text;
      ui.jsonError = `Not valid JSON: ${(e as Error).message}`;
    }
  },
  "export-json"() {
    const wf = current();
    downloadFile(`${slug(wf.name)}.json`, "application/json", JSON.stringify(wf, null, 2));
  },
  "reset-all"() {
    if (!confirm("Delete all workflows and answers and restore the sample?")) return;
    data = resetAll();
    ui.ai.undo = null;
    resetPositions();
  },
  "ai-toggle"() {
    ui.ai.open = !ui.ai.open;
  },
  "ai-create"() {
    void runAi(false);
  },
  "ai-modify"() {
    void runAi(true);
  },
  "ai-undo"() {
    const prev = ui.ai.undo;
    if (!prev) return;
    const i = data.workflows.findIndex((w) => w.id === prev.id);
    if (i !== -1) data.workflows[i] = prev;
    ui.ai.undo = null;
    ui.ai.summary = "";
    ui.ai.issues = [];
  },
};

const ASYNC_ACTIONS = new Set(["ai-create", "ai-modify", "copy-doc", "download-doc", "download-docx", "download-template", "print-doc"]);

root.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el || el instanceof HTMLInputElement) return;
  const name = el.dataset.action!;
  const action = actions[name];
  if (!action) return;
  e.preventDefault();
  action(el);
  if (ASYNC_ACTIONS.has(name)) return;
  persist();
  render();
});

root.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) return;
  if (el.dataset.bind) {
    applyBinding(el);
    refreshBuilder();
  } else if (el.dataset.answer) {
    applyAnswer(el);
  } else if (el.id === "ai-request") {
    ui.ai.request = el.value;
  } else if (el.id === "outline-search") {
    ui.search = el.value;
    const outline = root.querySelector("#outline");
    if (outline) outline.innerHTML = outlineHtml(current(), outlineState());
  }
});

root.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "workflow-select") {
    data.currentId = el.value;
    resetPositions();
    ui.jsonDraft = null;
    persist();
    return render();
  }
  if (el.id === "page-select") {
    ui.builderPage = Number(el.value);
    return render();
  }
  if (el.id === "outline-type") {
    ui.typeFilter = el.value;
    const outline = root.querySelector("#outline");
    if (outline) outline.innerHTML = outlineHtml(current(), outlineState());
    return;
  }
  if (el.dataset.docxFor !== undefined) {
    const file = (el as HTMLInputElement).files?.[0];
    if (file) void attachWordFile(file, el.dataset.docxFor);
    return;
  }
  if (el.dataset.importWorkflow !== undefined) {
    const file = (el as HTMLInputElement).files?.[0];
    if (file) void importWorkflow(file);
    return;
  }
  if (el.dataset.action === "toggle-values") {
    ui.showValues = (el as HTMLInputElement).checked;
    return render();
  }
  if (el.dataset.bind) {
    applyBinding(el);
    return rerenderKeepingFocus();
  }
  if (el.dataset.answer) {
    if (el instanceof HTMLSelectElement) return;
    applyAnswer(el);
    return rerenderKeepingFocus();
  }
});

// Typing saves after a short pause; flush it if the page goes away first.
window.addEventListener("pagehide", () => save(data));

render();
