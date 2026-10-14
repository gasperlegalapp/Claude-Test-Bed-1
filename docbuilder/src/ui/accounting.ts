// Accountings: set up the case, add bank records, review the entries, see
// what still needs attention, and produce the court form. Inputs carry
// `data-abind` paths into the accounting (or `data-txn` / `data-stmt` /
// `data-check` with `data-field` for rows that are found by id); buttons carry
// `data-action`. accountingApp.ts applies both.

import {
  beginningBalance,
  findings,
  inPeriod,
  money,
  runningBalanceMisses,
  same,
  statementComputedClosing,
  sum,
  summarize,
  TRANSFER,
  type Accounting,
  type Finding,
  type Txn,
} from "../engine/accounting.ts";
import { courtForm, shortDate } from "../engine/courtForm.ts";
import type { AttachmentKind } from "../engine/accounting.ts";
import { escapeHtml as esc } from "../engine/markdown.ts";
import { icon } from "./icons.ts";

export type AcctTab = "setup" | "records" | "entries" | "review" | "form" | "packet";
export type EntryFilter = "all" | "attention" | "unreviewed" | "receipts" | "disbursements" | "transfers";

export interface Job {
  id: string;
  fileName: string;
  what: string;
  status: "working" | "done" | "error";
  message: string;
}

export interface AcctView {
  tab: AcctTab;
  filter: EntryFilter;
  search: string;
  account: string;
  /** Lines picked from a finding on the Review tab. */
  focus: { title: string; ids: string[] } | null;
  jobs: Job[];
  busy: boolean;
  /** Why the AI suggested what it did, by transaction id. */
  reasons: Record<string, string>;
  apiKey: string;
  packet: PacketView;
}

export interface PacketView {
  /** Attachment ids whose file is no longer kept in this browser. */
  missing: Set<string>;
  building: boolean;
  status: string;
  error: string;
  /** Pages in each file of the last packet built. */
  built: { name: string; pages: number }[];
  previewing: boolean;
  /** Shown in place of the preview, e.g. when the browser can't show PDFs. */
  previewNote: string;
}

export const ACCT_TABS: [AcctTab, string, string][] = [
  ["setup", "Setup", "settings"],
  ["records", "Bank records", "upload"],
  ["entries", "Entries", "list"],
  ["review", "Review", "check-circle"],
  ["form", "Court form", "doc"],
  ["packet", "Filing packet", "folder"],
];

const KIND_SUBJECT = { guardianship: "Ward", estate: "Decedent", trust: "Trust", other: "Subject" } as const;

function input(path: string, value: string | number | null | undefined, o: { type?: string; kind?: string; placeholder?: string; cls?: string; step?: string } = {}): string {
  return `<input type="${o.type ?? "text"}" class="input${o.cls ? ` ${o.cls}` : ""}" data-abind="${path}"${o.kind ? ` data-kind="${o.kind}"` : ""}${o.step ? ` step="${o.step}"` : ""} value="${esc(value === null || value === undefined ? "" : typeof value === "number" && o.kind === "money" ? value.toFixed(2) : String(value))}"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}>`;
}

function field(label: string, control: string, hint = ""): string {
  return `<label class="field"><span class="label">${label}</span>${control}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
}

// ------------------------------------------------------------------ setup

export function setupHtml(a: Accounting): string {
  const d = a.details;
  const subject = KIND_SUBJECT[d.kind];
  const accounts = a.accounts
    .map((acct, i) => {
      const fromStatements = beginningBalance(a, { ...acct, begin: null });
      return `<div class="grid-row accounts-row">
        ${input(`accounts.${i}.institution`, acct.institution, { placeholder: "Bank" })}
        ${input(`accounts.${i}.name`, acct.name, { placeholder: "Account name" })}
        ${input(`accounts.${i}.last4`, acct.last4, { placeholder: "Last 4", cls: "code" })}
        <div>${input(`accounts.${i}.begin`, acct.begin, { type: "number", kind: "money", step: "0.01", placeholder: fromStatements.amount !== null ? `${fromStatements.amount.toFixed(2)} (statements)` : "From prior account" })}</div>
        <button class="btn btn-ghost btn-icon danger" data-action="acct-remove-account" data-index="${i}" title="Remove account">${icon("trash")}</button>
      </div>`;
    })
    .join("");
  const assets = a.assets
    .map(
      (x, i) => `<div class="grid-row assets-row">
        ${input(`assets.${i}.description`, x.description, { placeholder: "e.g. Residence, 12 Elm Street" })}
        ${input(`assets.${i}.begin`, x.begin, { type: "number", kind: "money", step: "0.01", placeholder: "At start" })}
        ${input(`assets.${i}.end`, x.end, { type: "number", kind: "money", step: "0.01", placeholder: "At end" })}
        <button class="btn btn-ghost btn-icon danger" data-action="acct-remove-asset" data-index="${i}" title="Remove">${icon("trash")}</button>
      </div>`,
    )
    .join("");
  const categories = a.categories
    .map(
      (c, i) => `<div class="grid-row categories-row">
        ${input(`categories.${i}.label`, c.label)}
        <select class="select" data-abind="categories.${i}.flow"><option value="receipt"${c.flow === "receipt" ? " selected" : ""}>Receipt</option><option value="disbursement"${c.flow === "disbursement" ? " selected" : ""}>Disbursement</option></select>
        <label class="switch"><input type="checkbox" data-abind="categories.${i}.approval" data-kind="bool"${c.approval ? " checked" : ""}><span class="track"></span> Needs court approval</label>
        <button class="btn btn-ghost btn-icon danger" data-action="acct-remove-category" data-index="${i}" title="Remove">${icon("trash")}</button>
      </div>`,
    )
    .join("");

  return `<div class="acct-page">
    <div class="section-head"><div><h1>Setup</h1><p class="hint">The case, the period, and what the fiduciary held when it began. These fill the court form.</p></div></div>
    <section class="card">
      <div class="panel-title">Case</div>
      <div class="row-3">
        ${field("Name in DocBuilder", input("name", a.name))}
        ${field("Type of account", `<select class="select" data-abind="details.kind">${(["guardianship", "estate", "trust", "other"] as const).map((k) => `<option value="${k}"${d.kind === k ? " selected" : ""}>${{ guardianship: "Guardianship", estate: "Estate", trust: "Trust", other: "Other" }[k]}</option>`).join("")}</select>`)}
        ${field(subject, input("details.subject", d.subject))}
        ${field("Case number", input("details.caseNumber", d.caseNumber))}
        ${field("Court", input("details.court", d.court, { placeholder: "Probate Court of Franklin County, Ohio" }))}
        ${field("Judge", input("details.judge", d.judge))}
        ${field(d.kind === "guardianship" ? "Guardian" : "Fiduciary", input("details.fiduciary", d.fiduciary))}
      </div>
    </section>
    <section class="card">
      <div class="panel-title">This account</div>
      <div class="row-4">
        ${field("Which account", input("details.title", d.title, { placeholder: "Seventh Partial" }), "The form adds “Account”.")}
        ${field("From", input("details.periodStart", d.periodStart, { type: "date" }))}
        ${field("To", input("details.periodEnd", d.periodEnd, { type: "date" }))}
        ${field("Prior account filed", input("details.priorFiledOn", d.priorFiledOn, { type: "date" }), "For the opening “Balance from prior account” line.")}
      </div>
    </section>
    <section class="card">
      <div class="panel-title">Bank accounts</div>
      <p class="hint">Beginning balance: what the inventory or the last account shows. Leave it blank to take it from the statements; when both are there, Review checks they agree.</p>
      ${a.accounts.length ? `<div class="grid-row accounts-row head"><span class="label">Bank</span><span class="label">Account</span><span class="label">Last 4</span><span class="label">Beginning balance</span><span></span></div>${accounts}` : `<p class="hint">None yet. Accounts are added when statements are read, or add one here.</p>`}
      <div class="card-actions"><button class="btn btn-sm" data-action="acct-add-account">${icon("plus")} Bank account</button></div>
    </section>
    <section class="card">
      <div class="panel-title">Other assets held</div>
      <p class="hint">Real estate, vehicles and the like. Listed in the itemized statement of assets remaining at their value at the end.</p>
      ${a.assets.length ? `<div class="grid-row assets-row head"><span class="label">Item</span><span class="label">Value at start</span><span class="label">Value at end</span><span></span></div>${assets}` : ""}
      <div class="card-actions"><button class="btn btn-sm" data-action="acct-add-asset">${icon("plus")} Asset</button></div>
    </section>
    <section class="card">
      <div class="panel-title">Signatures</div>
      <div class="row-2">
        <div>
          ${field("Attorney", input("details.attorneyName", d.attorneyName))}
          ${field("Address", input("details.attorneyAddress", d.attorneyAddress))}
          ${field("City, State, Zip", input("details.attorneyCity", d.attorneyCity))}
          <div class="row-2">${field("Telephone", input("details.attorneyPhone", d.attorneyPhone))}${field("Registration No.", input("details.attorneyRegistration", d.attorneyRegistration))}</div>
        </div>
        <div>
          ${field(d.kind === "guardianship" ? "Guardian" : "Fiduciary", `<input class="input" value="${esc(d.fiduciary)}" disabled>`, "Set under Case.")}
          ${field("Address", input("details.fiduciaryAddress", d.fiduciaryAddress))}
          ${field("City, State, Zip", input("details.fiduciaryCity", d.fiduciaryCity))}
          ${field("Telephone", input("details.fiduciaryPhone", d.fiduciaryPhone))}
        </div>
      </div>
    </section>
    <section class="card">
      <div class="panel-title">Sorting entries</div>
      <label class="switch"><input type="checkbox" data-abind="useCategories" data-kind="bool"${a.useCategories ? " checked" : ""}><span class="track"></span> Group receipts and disbursements by category</label>
      <p class="hint">Off: entries are listed by date, as on a guardian's account. On: every entry needs a category, and Review totals them.</p>
      ${a.useCategories ? `<div class="categories">${categories}</div><div class="card-actions"><button class="btn btn-sm" data-action="acct-add-category">${icon("plus")} Category</button></div>` : ""}
      ${field("Firm rules for the AI", `<textarea class="textarea" data-abind="rules" rows="4" placeholder="e.g. Transfers to the ward's prepaid card are disbursements, payee “Prepaid card transfer”.">${esc(a.rules)}</textarea>`, "Used when suggesting payees, descriptions and categories.")}
    </section>
    <section class="card">
      <div class="panel-title">Data</div>
      <p class="hint">This accounting is kept in this browser only. Export it to keep a copy or move it to another computer.</p>
      <div class="card-actions">
        <button class="btn" data-action="acct-export">${icon("download")} Export file</button>
        <label class="btn">${icon("upload")} Import file<input type="file" data-acct-import accept=".json,application/json" hidden></label>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-danger" data-action="acct-reset">Reset accountings to the samples</button>
      </div>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ records

function uploadCard(kind: string, title: string, text: string, accept: string, ai: boolean, busy: boolean, extra = ""): string {
  return `<section class="card upload-card">
    <div class="upload-head">${icon(kind === "csv" ? "file" : kind === "checks" ? "copy" : kind === "prior" ? "folder" : "doc", 18)}<h2>${title}</h2>${ai ? '<span class="badge">AI</span>' : '<span class="badge ok">Exact</span>'}</div>
    <p class="hint">${text}</p>
    ${extra}
    <label class="btn${busy && ai ? " disabled" : ""}">${icon("upload")} Choose files<input type="file" data-acct-upload="${kind}" accept="${accept}" multiple hidden${busy && ai ? " disabled" : ""}></label>
  </section>`;
}

export function recordsHtml(a: Accounting, v: AcctView): string {
  const statements = [...a.statements]
    .sort((x, y) => x.accountId.localeCompare(y.accountId) || x.start.localeCompare(y.start))
    .map((s) => {
      const lines = a.transactions.filter((t) => t.statementId === s.id);
      const computed = statementComputedClosing(a, s);
      const misses = runningBalanceMisses(a, s).length;
      const acct = a.accounts.find((x) => x.id === s.accountId);
      let status: string;
      if (computed === null || s.closing === null) status = `<span class="badge warn">Enter balances</span>`;
      else if (!same(computed, s.closing)) status = `<span class="badge bad">Off by ${money(Math.abs(sum([s.closing, -computed])))}</span>`;
      else if (misses) status = `<span class="badge bad">${misses} line${misses === 1 ? "" : "s"} off</span>`;
      else status = `<span class="badge ok">${icon("check", 12)} Balances</span>`;
      return `<tr>
        <td>${esc(acct ? `${acct.name}${acct.last4 ? ` …${acct.last4}` : ""}` : "?")}</td>
        <td>${esc(s.fileName)}</td>
        <td>${esc(shortDate(s.start))} – ${esc(shortDate(s.end))}</td>
        <td><input type="number" step="0.01" class="input num" data-stmt="${esc(s.id)}" data-field="opening" value="${s.opening?.toFixed(2) ?? ""}"></td>
        <td><input type="number" step="0.01" class="input num" data-stmt="${esc(s.id)}" data-field="closing" value="${s.closing?.toFixed(2) ?? ""}"></td>
        <td class="num">${lines.length}</td>
        <td>${status}</td>
        <td><button class="btn btn-ghost btn-icon danger" data-action="acct-remove-statement" data-id="${esc(s.id)}" title="Remove this record and its lines">${icon("trash")}</button></td>
      </tr>`;
    })
    .join("");
  const checks = a.checks
    .map((c) => {
      const t = a.transactions.find((x) => x.id === c.txnId);
      return `<tr>
        <td class="code">${esc(c.number || "?")}</td>
        <td>${c.date ? esc(shortDate(c.date)) : ""}</td>
        <td>${esc(c.payee)}</td>
        <td class="num">${money(c.amount)}</td>
        <td>${esc(c.memo)}</td>
        <td>${t ? `<span class="badge ok">${icon("check", 12)} ${esc(shortDate(t.date))}, ${money(-t.amount)}</span>` : `<span class="badge warn">Not matched</span>`}${c.doubt ? ` <span class="flag" title="${esc(c.doubt)}">${icon("search", 13)}</span>` : ""}</td>
        <td><button class="btn btn-ghost btn-icon danger" data-action="acct-remove-check" data-id="${esc(c.id)}" title="Remove">${icon("trash")}</button></td>
      </tr>`;
    })
    .join("");
  const jobs = v.jobs
    .map((j) => `<li class="job ${j.status}">${j.status === "working" ? '<span class="spinner"></span>' : j.status === "done" ? icon("check-circle") : icon("x")}<span><strong>${esc(j.fileName)}</strong> · ${esc(j.what)}${j.message ? `<br><span class="hint">${esc(j.message)}</span>` : ""}</span></li>`)
    .join("");

  return `<div class="acct-page">
    <div class="section-head"><div><h1>Bank records</h1><p class="hint">Add statements, online-banking histories or bank downloads, and copies of checks. Every line is checked against the bank's balances.</p></div></div>
    <div class="upload-grid">
      ${uploadCard("statement", "Statements or online history", "PDF or photos. Claude reads every line, then the app checks each against the running balance and the closing balance.", ".pdf,image/png,image/jpeg,image/webp", true, v.busy)}
      ${uploadCard(
        "csv",
        "Bank download (CSV)",
        "Read exactly, without AI. Most banks offer a CSV download of transactions.",
        ".csv,text/csv",
        false,
        v.busy,
        `<label class="field inline"><span class="label">Account</span><select class="select" id="csv-account"><option value="">New account</option>${a.accounts.map((x) => `<option value="${esc(x.id)}"${a.accounts.length === 1 ? " selected" : ""}>${esc(x.name)}${x.last4 ? ` …${esc(x.last4)}` : ""}</option>`).join("")}</select></label>`,
      )}
      ${uploadCard("checks", "Check copies", "Check images from the bank. Payees and memos are matched to the statement lines by check number.", ".pdf,image/png,image/jpeg,image/webp", true, v.busy)}
      ${uploadCard("prior", "Prior account or inventory", "PDF or Excel. Sets the beginning balances and the other assets carried over.", ".pdf,.xlsx,image/png,image/jpeg", true, v.busy)}
    </div>
    <section class="card key-card">
      <label class="field inline"><span class="label">Anthropic API key</span><input type="password" class="input" id="acct-key" value="${esc(v.apiKey)}" autocomplete="off" placeholder="sk-ant-..."></label>
      <p class="hint">Needed for the AI readers. Records are sent to Anthropic to be read and are not kept in this browser. In Case Control this runs on the firm's server under its own API account.</p>
    </section>
    ${jobs ? `<section class="card"><div class="panel-title">Reading</div><ul class="jobs">${jobs}</ul></section>` : ""}
    <section class="card">
      <div class="panel-title">Statements and histories</div>
      ${statements ? `<div class="table-wrap"><table class="grid"><thead><tr><th>Account</th><th>File</th><th>Covers</th><th>Opening</th><th>Closing</th><th class="num">Lines</th><th>Check</th><th></th></tr></thead><tbody>${statements}</tbody></table></div>` : `<p class="hint">None yet.</p>`}
    </section>
    <section class="card">
      <div class="panel-title">Check copies</div>
      ${checks ? `<div class="table-wrap"><table class="grid"><thead><tr><th>No.</th><th>Date</th><th>Payee</th><th class="num">Amount</th><th>Memo</th><th>Statement line</th><th></th></tr></thead><tbody>${checks}</tbody></table></div>` : `<p class="hint">None yet.</p>`}
    </section>
  </div>`;
}

// ------------------------------------------------------------------ entries

export function attentionIds(list: Finding[]): Set<string> {
  return new Set(list.flatMap((f) => f.txnIds ?? []));
}

function typeSelect(a: Accounting, t: Txn): string {
  const opts = [`<option value="">${t.amount < 0 ? "Disbursement" : "Receipt"}</option>`, `<option value="${TRANSFER}"${t.category === TRANSFER ? " selected" : ""}>Transfer between accounts</option>`];
  if (a.useCategories) {
    const flow = t.amount < 0 ? "disbursement" : "receipt";
    const ordered = [...a.categories.filter((c) => c.flow === flow), ...a.categories.filter((c) => c.flow !== flow)];
    opts.push(...ordered.map((c) => `<option value="${esc(c.id)}"${t.category === c.id ? " selected" : ""}>${esc(c.label)}</option>`));
  }
  return `<select class="select" data-txn="${esc(t.id)}" data-field="category">${opts.join("")}</select>`;
}

function flagsFor(a: Accounting, t: Txn, misses: Set<string>, reason: string | undefined): string {
  const out: string[] = [];
  if (misses.has(t.id)) out.push(`<span class="flag bad" title="Doesn't fit the bank's running balance${t.balance !== undefined ? ` (${money(t.balance)})` : ""}">${icon("x", 13)}</span>`);
  if (t.doubt && !t.reviewed) out.push(`<span class="flag warn" title="${esc(t.doubt)}">${icon("search", 13)}</span>`);
  if (t.amount < 0 && t.checkNumber && !t.payee) out.push(`<span class="flag warn" title="No payee: add the check copy or type it in">${icon("copy", 13)}</span>`);
  if (reason) out.push(`<span class="flag ai" title="AI: ${esc(reason)}">${icon("wand", 13)}</span>`);
  if (!inPeriod(a, t.date)) out.push(`<span class="chip">outside period</span>`);
  return out.join("");
}

export function entriesHtml(a: Accounting, v: AcctView): string {
  const found = findings(a);
  const attention = attentionIds(found);
  const misses = new Set(a.statements.flatMap((s) => runningBalanceMisses(a, s)));
  const term = v.search.trim().toLowerCase();
  const focus = v.focus ? new Set(v.focus.ids) : null;
  const rows = a.transactions
    .map((t, i) => ({ t, i }))
    .sort((x, y) => x.t.date.localeCompare(y.t.date) || x.i - y.i)
    .map((x) => x.t)
    .filter((t) => {
      if (focus) return focus.has(t.id);
      if (v.account && t.accountId !== v.account) return false;
      if (term && ![t.description, t.payee, t.purpose, t.checkNumber, t.memo, String(Math.abs(t.amount))].some((s) => s?.toLowerCase().includes(term))) return false;
      switch (v.filter) {
        case "attention":
          return attention.has(t.id) || misses.has(t.id);
        case "unreviewed":
          return !t.reviewed;
        case "receipts":
          return t.amount >= 0 && t.category !== TRANSFER;
        case "disbursements":
          return t.amount < 0 && t.category !== TRANSFER;
        case "transfers":
          return t.category === TRANSFER;
        default:
          return true;
      }
    });

  const reviewed = a.transactions.filter((t) => t.reviewed).length;
  const body = rows
    .map((t) => {
      const cls = [t.category === TRANSFER ? "transfer" : t.amount < 0 ? "out" : "in", attention.has(t.id) || misses.has(t.id) ? "attention" : "", inPeriod(a, t.date) ? "" : "outside", t.reviewed ? "reviewed" : ""].filter(Boolean).join(" ");
      const acct = a.accounts.length > 1 ? `<span class="hint"> · ${esc(a.accounts.find((x) => x.id === t.accountId)?.name ?? "")}</span>` : "";
      return `<tr class="${cls}">
        <td><input type="checkbox" class="check" data-txn="${esc(t.id)}" data-field="reviewed" title="Reviewed"${t.reviewed ? " checked" : ""}></td>
        <td><input type="date" class="input" data-txn="${esc(t.id)}" data-field="date" value="${esc(t.date)}"></td>
        <td class="payee-cell"><input type="text" class="input" data-txn="${esc(t.id)}" data-field="payee" value="${esc(t.payee ?? "")}" placeholder="${esc(t.description)}"><div class="bank-text" title="As the bank shows it">${esc(t.description)}${t.memo ? ` · memo: ${esc(t.memo)}` : ""}${acct}</div></td>
        <td><input type="text" class="input" data-txn="${esc(t.id)}" data-field="purpose" value="${esc(t.purpose ?? "")}"></td>
        <td><input type="text" class="input code check-no" data-txn="${esc(t.id)}" data-field="checkNumber" value="${esc(t.checkNumber ?? "")}"></td>
        <td>${typeSelect(a, t)}</td>
        <td><input type="number" step="0.01" class="input num amount" data-txn="${esc(t.id)}" data-field="amount" value="${t.amount.toFixed(2)}"></td>
        <td class="flags">${flagsFor(a, t, misses, v.reasons[t.id])}</td>
        <td><button class="btn btn-ghost btn-icon danger" data-action="acct-remove-entry" data-id="${esc(t.id)}" title="Delete this entry">${icon("trash")}</button></td>
      </tr>`;
    })
    .join("");
  const totalIn = sum(rows.filter((t) => t.amount > 0).map((t) => t.amount));
  const totalOut = sum(rows.filter((t) => t.amount < 0).map((t) => t.amount));
  const filters: [EntryFilter, string][] = [
    ["all", "All entries"],
    ["attention", `Needs attention (${a.transactions.filter((t) => attention.has(t.id) || misses.has(t.id)).length})`],
    ["unreviewed", `Not reviewed (${a.transactions.length - reviewed})`],
    ["receipts", "Receipts"],
    ["disbursements", "Disbursements"],
    ["transfers", "Transfers"],
  ];

  return `<div class="acct-page wide">
    <div class="section-head">
      <div><h1>Entries</h1><p class="hint">${a.transactions.length} entries, ${reviewed} reviewed. Payee and Description are what the court form prints; the bank's own text is shown underneath.</p></div>
      <span class="spacer"></span>
      <button class="btn" data-action="acct-suggest"${v.busy || !a.transactions.length ? " disabled" : ""}>${icon("wand")} Suggest payees${a.useCategories ? " and categories" : ""}</button>
      <button class="btn" data-action="acct-add-entry">${icon("plus")} Entry</button>
    </div>
    ${v.focus ? `<div class="banner focus">${esc(v.focus.title)} <button class="btn btn-sm" data-action="acct-clear-focus">Show all entries</button></div>` : ""}
    <div class="entries-toolbar">
      <select class="select" id="acct-filter"${v.focus ? " disabled" : ""}>${filters.map(([id, label]) => `<option value="${id}"${v.filter === id ? " selected" : ""}>${label}</option>`).join("")}</select>
      ${a.accounts.length > 1 ? `<select class="select" id="acct-account"${v.focus ? " disabled" : ""}><option value="">All accounts</option>${a.accounts.map((x) => `<option value="${esc(x.id)}"${v.account === x.id ? " selected" : ""}>${esc(x.name)}${x.last4 ? ` …${esc(x.last4)}` : ""}</option>`).join("")}</select>` : ""}
      <div class="search">${icon("search")}<input type="search" id="acct-search" class="input" placeholder="Search payee, text, check no. or amount" value="${esc(v.search)}"${v.focus ? " disabled" : ""}></div>
      <span class="spacer"></span>
      <span class="hint">${rows.length} shown · in ${money(totalIn)} · out ${money(-totalOut)}</span>
      <button class="btn btn-sm" data-action="acct-mark-reviewed"${rows.some((t) => !t.reviewed) ? "" : " disabled"}>${icon("check")} Mark shown reviewed</button>
    </div>
    ${a.statements.length || a.transactions.length
      ? `<div class="card table-card"><div class="table-wrap"><table class="grid entries">
          <thead><tr><th title="Reviewed">${icon("check", 14)}</th><th>Date</th><th>Payee</th><th>Description</th><th>Check No.</th><th>Type</th><th class="num">Amount</th><th></th><th></th></tr></thead>
          <tbody>${body || `<tr><td colspan="9" class="hint pad">Nothing matches.</td></tr>`}</tbody>
        </table></div></div>`
      : `<div class="card empty-card"><p>No entries yet. Add bank records first.</p><button class="btn btn-primary" data-action="acct-tab" data-tab="records">${icon("upload")} Bank records</button></div>`}
  </div>`;
}

// ------------------------------------------------------------------ review

export function reviewHtml(a: Accounting): string {
  const found = findings(a);
  const s = summarize(a);
  const form = courtForm(a);
  const errors = found.filter((f) => f.level === "error").length;
  const list = found
    .map(
      (f, i) => `<li class="finding ${f.level}">
        <span class="finding-icon">${f.level === "error" ? icon("x") : icon("search")}</span>
        <div><strong>${esc(f.title)}</strong><p>${esc(f.detail)}</p></div>
        ${f.txnIds?.length ? `<button class="btn btn-sm" data-action="acct-show-lines" data-index="${i}">Show ${f.txnIds.length === 1 ? "line" : `${f.txnIds.length} lines`}</button>` : ""}
      </li>`,
    )
    .join("");
  const recon = s.accounts
    .map((l) => {
      const diff = l.end !== null && l.bank !== null ? sum([l.bank, -l.end]) : null;
      return `<tr>
        <td>${esc(`${l.account.institution ? `${l.account.institution} ` : ""}${l.account.name}${l.account.last4 ? ` …${l.account.last4}` : ""}`)}</td>
        <td class="num">${money(l.begin)}<div class="hint">${beginningBalance(a, l.account).from === "entered" ? "entered" : "from statements"}</div></td>
        <td class="num">${money(l.receipts)}</td>
        <td class="num">${money(l.disbursements)}</td>
        <td class="num">${l.transfers ? money(l.transfers) : ""}</td>
        <td class="num"><strong>${money(l.end)}</strong></td>
        <td class="num">${l.bank === null ? '<span class="hint">no statement</span>' : money(l.bank)}</td>
        <td class="num">${diff === null ? "" : same(diff, 0) ? `<span class="ok">${icon("check", 13)}</span>` : `<span class="bad">${money(diff)}</span>`}</td>
      </tr>`;
    })
    .join("");
  const groups = (title: string, items: { label: string; total: number; count: number }[]) =>
    items.length ? `<div class="panel-title">${title}</div><table class="grid compact"><tbody>${items.map((c) => `<tr><td>${esc(c.label)} <span class="hint">(${c.count})</span></td><td class="num">${money(c.total)}</td></tr>`).join("")}</tbody></table>` : "";

  return `<div class="acct-page">
    <div class="section-head"><div><h1>Review</h1><p class="hint">Plain arithmetic over the bank records: nothing here is guessed.</p></div></div>
    <section class="card status-card ${errors ? "bad" : found.length ? "warn" : "ok"}">
      ${errors ? `${icon("x", 20)}<div><strong>${errors} problem${errors === 1 ? "" : "s"} to fix</strong><p class="hint">The account doesn't balance yet.</p></div>`
        : found.length ? `${icon("search", 20)}<div><strong>It balances.</strong><p class="hint">${found.length} item${found.length === 1 ? "" : "s"} to check before filing.</p></div>`
        : `${icon("check-circle", 20)}<div><strong>It balances, and nothing is open.</strong><p class="hint">Ready for the lawyer's final review.</p></div>`}
    </section>
    ${list ? `<section class="card"><div class="panel-title">To do</div><ul class="findings">${list}</ul></section>` : ""}
    <section class="card">
      <div class="panel-title">Bank reconciliation</div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Account</th><th class="num">Beginning</th><th class="num">Receipts</th><th class="num">Disbursements</th><th class="num">Transfers</th><th class="num">Ending</th><th class="num">Bank shows</th><th class="num">Difference</th></tr></thead>
        <tbody>${recon || `<tr><td colspan="8" class="hint">No accounts yet.</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="panel-title">Recapitulation, as on the court form</div>
      <table class="grid compact recap"><tbody>
        <tr><td>Total receipts <span class="hint">(beginning balance of ${money(s.beginCash)} plus ${money(s.receipts)} received${s.transfersNet || form.sections.length > 1 ? ", and transfers in" : ""})</span></td><td class="num">${money(form.totals.receipts)}</td></tr>
        <tr><td>Total disbursements</td><td class="num">${money(form.totals.disbursements)}</td></tr>
        <tr class="total"><td>Balance remaining</td><td class="num">${money(form.totals.remaining)}</td></tr>
        ${a.assets.length ? `<tr><td>Other assets held</td><td class="num">${money(s.assetsEnd)}</td></tr><tr class="total"><td>Total assets remaining</td><td class="num">${money(form.totalAssets)}</td></tr>` : ""}
      </tbody></table>
      ${groups("Receipts by category", s.receiptsByCategory)}
      ${groups("Disbursements by category", s.disbursementsByCategory)}
    </section>
  </div>`;
}

// ------------------------------------------------------------------ form

export function formHtml(a: Accounting): string {
  const found = findings(a);
  const errors = found.filter((f) => f.level === "error").length;
  const form = courtForm(a);
  const lines = form.sections.reduce((n, x) => n + x.lines.length, 0);
  return `<div class="acct-page wide">
    <div class="section-head">
      <div><h1>Court form</h1><p class="hint">${esc(form.title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}, ${lines} lines. Edit entries in the app and this updates; or download the Excel version to adjust by hand.</p></div>
      <span class="spacer"></span>
      <button class="btn btn-primary" data-action="acct-download-pdf">${icon("download")} PDF</button>
      <button class="btn" data-action="acct-download-form-xlsx">${icon("download")} Excel (editable)</button>
      <button class="btn" data-action="acct-download-review-xlsx" title="Summary, schedules, reconciliation and open items">${icon("download")} Review workbook</button>
    </div>
    ${errors ? `<div class="banner">This draft doesn't balance yet: ${errors} problem${errors === 1 ? "" : "s"} on Review. <button class="btn btn-sm" data-action="acct-tab" data-tab="review">See Review</button></div>` : found.length ? `<div class="banner soft">${found.length} item${found.length === 1 ? "" : "s"} still to check on Review.</div>` : ""}
    <div class="pdf-frame" id="form-preview"><p class="hint pad">Drawing the form…</p></div>
  </div>`;
}

// ------------------------------------------------------------------ header

export function accountingPicker(list: Accounting[], current: Accounting): string {
  return `<select id="accounting-select" aria-label="Accounting">${list.map((x) => `<option value="${esc(x.id)}"${x.id === current.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`;
}

// ------------------------------------------------------------------ packet

const KIND_LABELS: Record<AttachmentKind, string> = { statement: "Bank statements", checks: "Check copies (vouchers)", other: "Other" };

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function packetHtml(a: Accounting, v: AcctView): string {
  const p = v.packet;
  const list = a.attachments;
  const included = list.filter((x) => x.include && !p.missing.has(x.id));
  const pages = included.reduce((n, x) => n + x.pages, 0);
  const rows = list
    .map((x, i) => {
      const missing = p.missing.has(x.id);
      return `<tr class="${x.include && !missing ? "" : "excluded"}">
        <td><input type="checkbox" class="check" data-att="${esc(x.id)}" data-field="include" title="Include in the packet"${x.include ? " checked" : ""}${missing ? " disabled" : ""}></td>
        <td class="att-name">${icon(x.type === "application/pdf" ? "file" : "copy", 15)} <span>${esc(x.name)}</span>${missing ? ` <span class="badge bad">File missing: add it again</span>` : ""}</td>
        <td><select class="select" data-att="${esc(x.id)}" data-field="kind">${(Object.keys(KIND_LABELS) as AttachmentKind[]).map((k) => `<option value="${k}"${x.kind === k ? " selected" : ""}>${KIND_LABELS[k]}</option>`).join("")}</select></td>
        <td class="num">${x.pages}</td>
        <td class="num">${size(x.size)}</td>
        <td class="nowrap">
          <button class="btn btn-ghost btn-icon" data-action="acct-att-move" data-index="${i}" data-dir="-1" title="Earlier"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
          <button class="btn btn-ghost btn-icon" data-action="acct-att-move" data-index="${i}" data-dir="1" title="Later"${i === list.length - 1 ? " disabled" : ""}>${icon("down")}</button>
          <button class="btn btn-ghost btn-icon danger" data-action="acct-att-remove" data-index="${i}" title="Remove from the packet">${icon("trash")}</button>
        </td>
      </tr>`;
    })
    .join("");
  const errors = findings(a).filter((f) => f.level === "error").length;
  return `<div class="acct-page">
    <div class="section-head">
      <div><h1>Filing packet</h1><p class="hint">The account, followed by the documents filed behind it, in this order.</p></div>
      <span class="spacer"></span>
      <button class="btn" data-action="acct-packet-preview"${p.building ? " disabled" : ""}>${icon("play")} Preview</button>
      <button class="btn btn-primary" data-action="acct-packet-download"${p.building ? " disabled" : ""}>${icon("download")} Download packet</button>
    </div>
    ${errors ? `<div class="banner">The account doesn't balance yet: ${errors} problem${errors === 1 ? "" : "s"} on Review. <button class="btn btn-sm" data-action="acct-tab" data-tab="review">See Review</button></div>` : ""}
    <section class="card">
      <div class="panel-title">Contents</div>
      <div class="table-wrap"><table class="grid packet-list">
        <thead><tr><th></th><th>Document</th><th>Filed as</th><th class="num">Pages</th><th class="num">Size</th><th></th></tr></thead>
        <tbody>
          <tr class="fixed"><td>${icon("check", 14)}</td><td class="att-name">${icon("doc", 15)} <span>${esc(courtForm(a).title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</span></td><td>The account</td><td class="num"></td><td></td><td></td></tr>
          ${rows}
        </tbody>
      </table></div>
      ${list.length ? "" : `<p class="hint">Statements and check copies read on Bank records are added here automatically. Add anything else to file with it below.</p>`}
      <div class="card-actions">
        <label class="btn btn-sm">${icon("plus")} Add documents<input type="file" data-acct-upload="attachment" accept=".pdf,image/png,image/jpeg,image/webp" multiple hidden></label>
        <span class="spacer"></span>
        <span class="hint">${included.length} document${included.length === 1 ? "" : "s"}, ${pages} page${pages === 1 ? "" : "s"} after the account</span>
      </div>
      <p class="hint">Files are kept in this browser only, and aren't part of the accounting's export file.</p>
    </section>
    <section class="card">
      <div class="panel-title">How to file it</div>
      <div class="choices packet-choices">
        <label class="choice"><input type="radio" name="packet-separate" data-abind="packet.separate" data-kind="boolstr" value="false"${a.packet.separate ? "" : " checked"}><span>One PDF: the account, then the attachments</span></label>
        <label class="choice"><input type="radio" name="packet-separate" data-abind="packet.separate" data-kind="boolstr" value="true"${a.packet.separate ? " checked" : ""}><span>The account and the attachments as separate PDFs</span></label>
      </div>
      <label class="field inline split-field"><span class="label">Split into parts of at most</span><input type="number" min="1" step="1" class="input num" data-abind="packet.maxPages" data-kind="int" value="${a.packet.maxPages ?? ""}" placeholder="No limit"><span class="hint">pages</span></label>
      <p class="hint">For an e-filing size limit. Parts download together in a .zip.</p>
    </section>
    ${p.status || p.error || p.built.length
      ? `<section class="card">
          ${p.building ? `<p class="status"><span class="spinner"></span> ${esc(p.status)}</p>` : ""}
          ${p.error ? `<p class="bad">${esc(p.error)}</p>` : ""}
          ${!p.building && p.built.length ? `<p class="ok">${icon("check-circle")} ${p.built.map((b) => `${esc(b.name)} (${b.pages} pages)`).join(", ")}</p>` : ""}
          ${!p.building && p.status ? `<p class="hint">${esc(p.status)}</p>` : ""}
        </section>`
      : ""}
    ${p.previewing ? `<div class="pdf-frame" id="packet-preview">${p.building ? `<p class="hint pad">Putting the packet together…</p>` : p.previewNote ? `<div class="pad"><p>${esc(p.previewNote)}</p></div>` : ""}</div>` : ""}
  </div>`;
}
