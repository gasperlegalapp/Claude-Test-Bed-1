// The Accountings side of DocBuilder: state, editing, reading bank records,
// and downloads. main.ts owns the page and hands events here.

import { zipSync } from "fflate";
import {
  accountFor,
  addDays,
  addStatement,
  blankAccounting,
  findings,
  matchChecks,
  newId,
  normalizeAccounting,
  removeStatement,
  type Accounting,
  type AttachmentKind,
} from "./engine/accounting.ts";
import { accountingWorkbook } from "./engine/accountingExport.ts";
import { readBankCsv } from "./engine/bankCsv.ts";
import { courtForm, courtFormSheets } from "./engine/courtForm.ts";
import { escapeHtml as esc } from "./engine/markdown.ts";
import { writeXlsx, XLSX_MIME } from "./engine/xlsx.ts";
import { loadAccountings, resetAccountings, saveAccountings, type SavedAccountings } from "./store.ts";
import { clearFiles, deleteFiles, getFile, hasFile, putFile } from "./fileStore.ts";
import { ACCT_TABS, entriesHtml, formHtml, packetHtml, recordsHtml, reviewHtml, setupHtml, type AcctTab, type AcctView, type EntryFilter, type Job } from "./ui/accounting.ts";
import { icon } from "./ui/icons.ts";
import type { FileInput } from "./ai/extract.ts";

export interface Host {
  root: HTMLElement;
  render(): void;
  /** Re-render after a field changed, keeping focus where it was. */
  rerender(): void;
  download(name: string, type: string, content: string | Uint8Array): void;
  apiKey(): string;
  setApiKey(key: string): void;
}

/** Requests over this size are refused by the API; base64 adds a third. */
const MAX_FILE_BYTES = 22 * 1024 * 1024;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "accounting";
}

/** Sets `value` at a dotted path like `accounts.0.begin`; undefined deletes. */
function setPath(target: unknown, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
  const last = parts[parts.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
}

function moneyValue(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function createAccountingApp(host: Host) {
  let data: SavedAccountings = loadAccountings();
  const view: AcctView = {
    tab: "setup",
    filter: "all",
    search: "",
    account: "",
    focus: null,
    jobs: [],
    busy: false,
    reasons: {},
    apiKey: host.apiKey(),
    packet: { missing: new Set(), building: false, status: "", error: "", built: [], previewing: false, previewNote: "" },
  };
  let storageFull = false;
  let saveTimer = 0;
  let previewUrl = "";
  let previewRun = 0;

  const current = (): Accounting => data.accountings.find((a) => a.id === data.currentId) ?? data.accountings[0];

  function persist(): void {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const full = !saveAccountings(data);
      if (full !== storageFull) {
        storageFull = full;
        host.render();
      }
    }, 300);
  }

  function select(id: string): void {
    data.currentId = id;
    view.focus = null;
    view.search = "";
    view.account = "";
    view.filter = "all";
    view.reasons = {};
    view.packet = { missing: new Set(), building: false, status: "", error: "", built: [], previewing: false, previewNote: "" };
  }

  function job(fileName: string, what: string): Job {
    const j: Job = { id: newId("job"), fileName, what, status: "working", message: "" };
    view.jobs.unshift(j);
    view.jobs = view.jobs.slice(0, 12);
    return j;
  }

  async function asInput(file: File): Promise<FileInput> {
    const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.xlsx$/i.test(file.name) ? XLSX_MIME : "");
    return { name: file.name, type, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  /** Photos other than PNG and JPEG are redrawn as PNG, which PDFs can hold. */
  async function pdfReady(file: File, bytes: Uint8Array): Promise<{ type: string; bytes: Uint8Array }> {
    const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
    if (type === "application/pdf" || type === "image/png" || type === "image/jpeg") return { type, bytes };
    if (!type.startsWith("image/")) throw new Error("Only PDFs and photos (PNG, JPEG, WebP) can be filed.");
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The photo couldn't be converted."))), "image/png"));
    return { type: "image/png", bytes: new Uint8Array(await blob.arrayBuffer()) };
  }

  const KIND_ORDER: Record<AttachmentKind, number> = { statement: 0, checks: 1, other: 2 };

  /** Keeps a file to be filed behind the account. Returns a note for the person, or "" when all went well. */
  async function attach(a: Accounting, file: File, bytes: Uint8Array, kind: AttachmentKind): Promise<string> {
    if (a.attachments.some((x) => x.name === file.name && x.size === file.size)) return "";
    const ready = await pdfReady(file, bytes);
    const { countPages } = await import("./engine/packet.ts");
    const pages = await countPages({ name: file.name, type: ready.type, bytes: ready.bytes });
    const id = newId("file");
    const kept = await putFile(id, ready.bytes);
    // Statements before check copies before anything else, keeping the order they were added.
    const at = a.attachments.findIndex((x) => KIND_ORDER[x.kind] > KIND_ORDER[kind]);
    const entry = { id, name: file.name, kind, type: ready.type, pages, size: file.size, include: true };
    if (at === -1) a.attachments.push(entry);
    else a.attachments.splice(at, 0, entry);
    return kept ? "" : "This browser won't keep the file after the page is closed, so add it again to the packet next time.";
  }

  function needKey(): string | null {
    const key = view.apiKey.trim();
    if (key) return key;
    alert("Paste an Anthropic API key on the Bank records tab to use the AI readers.");
    return null;
  }

  async function readFiles(kind: string, files: File[]): Promise<void> {
    const a = current();
    if (kind === "attachment") {
      for (const file of files) {
        const j = job(file.name, "Filing packet");
        try {
          const note = await attach(a, file, new Uint8Array(await file.arrayBuffer()), "other");
          j.status = "done";
          j.message = note || "Added to the filing packet.";
        } catch (e) {
          j.status = "error";
          j.message = (e as Error).message;
          alert(j.message);
        }
      }
      persist();
      return host.render();
    }
    if (kind === "csv") {
      for (const file of files) {
        const j = job(file.name, "Bank download");
        try {
          const { statement, warnings } = readBankCsv(await file.text());
          const target = (host.root.querySelector<HTMLSelectElement>("#csv-account")?.value ?? "") || accountFor(a, { institution: "", accountName: file.name.replace(/\.csv$/i, ""), last4: "" }).id;
          addStatement(a, statement, file.name, target);
          j.status = "done";
          j.message = [`${statement.transactions.length} lines, ${statement.start} to ${statement.end}.`, ...warnings].join(" ");
        } catch (e) {
          j.status = "error";
          j.message = (e as Error).message;
        }
      }
      persist();
      return host.render();
    }

    const key = needKey();
    if (!key) return;
    view.busy = true;
    host.render();
    // Loaded on first use so the SDK isn't part of the initial page.
    const ai = await import("./ai/extract.ts");
    const { describeError } = await import("./ai/generate.ts");
    for (const file of files) {
      const j = job(file.name, { statement: "Statement", checks: "Check copies", prior: "Prior account" }[kind] ?? kind);
      host.render();
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error("This file is too large to send in one piece. Split it into smaller files (e.g. a few months each).");
        const input = await asInput(file);
        if (kind === "statement") {
          const { statements, notes } = await ai.readStatements({ apiKey: key, file: input, onStatus: (s) => ((j.what = s), host.render()) });
          const added = statements.map((s) => addStatement(a, s, file.name));
          const lines = statements.reduce((n, s) => n + s.transactions.length, 0);
          const off = findings(a).filter((f) => f.level === "error" && added.some((s) => s.id === f.statementId));
          j.what = "Statement";
          j.message = `${lines} lines in ${statements.length} statement${statements.length === 1 ? "" : "s"}. ${off.length ? `Not balanced yet: ${off.map((f) => f.title).join("; ")}.` : "It balances."}${notes ? ` Note: ${notes}` : ""}`;
          j.message += await keepForPacket(a, file, input.bytes, "statement");
        } else if (kind === "checks") {
          const { checks, notes } = await ai.readChecks({ apiKey: key, file: input });
          for (const c of checks) a.checks.push({ id: newId("chk"), fileName: file.name, number: c.number, date: c.date, payee: c.payee, amount: c.amount, memo: c.memo, ...(c.doubt ? { doubt: c.doubt } : {}) });
          const matched = matchChecks(a);
          j.message = `${checks.length} check${checks.length === 1 ? "" : "s"} read, ${matched} matched to statement lines.${notes ? ` Note: ${notes}` : ""}`;
          j.message += await keepForPacket(a, file, input.bytes, "checks");
        } else if (kind === "prior") {
          const prior = await ai.readPriorAccount({ apiKey: key, file: input });
          for (const p of prior.accounts) {
            const acct = accountFor(a, { institution: p.institution, accountName: p.name, last4: p.last4 });
            if (p.balance !== null) acct.begin = p.balance;
          }
          for (const x of prior.assets) {
            if (!a.assets.some((y) => y.description.toLowerCase() === x.description.toLowerCase())) a.assets.push({ id: newId("asset"), description: x.description, begin: x.value, end: x.value });
          }
          if (prior.periodEnd && !a.details.periodStart) a.details.periodStart = addDays(prior.periodEnd, 1);
          j.message = `${prior.accounts.length} account${prior.accounts.length === 1 ? "" : "s"} and ${prior.assets.length} other asset${prior.assets.length === 1 ? "" : "s"} carried over${prior.periodEnd ? ` from ${prior.periodEnd}` : ""}. Check them under Setup.${prior.notes ? ` Note: ${prior.notes}` : ""}`;
        }
        j.status = "done";
      } catch (e) {
        j.status = "error";
        j.message = describeError(e);
      }
      persist();
      host.render();
    }
    view.busy = false;
    host.render();
  }

  async function keepForPacket(a: Accounting, file: File, bytes: Uint8Array, kind: AttachmentKind): Promise<string> {
    try {
      const note = await attach(a, file, bytes, kind);
      return note ? ` ${note}` : " Added to the filing packet.";
    } catch (e) {
      return ` It couldn't be added to the filing packet: ${(e as Error).message}`;
    }
  }

  /** Notes which attachments' files this browser no longer has. */
  async function checkFiles(): Promise<void> {
    const a = current();
    const missing = new Set<string>();
    for (const x of a.attachments) if (!(await hasFile(x.id))) missing.add(x.id);
    const before = [...view.packet.missing].sort().join();
    view.packet.missing = missing;
    if ([...missing].sort().join() !== before) host.render();
  }

  function packetBase(a: Accounting): string {
    return slug(`${a.details.subject} ${a.details.title} account`);
  }

  async function buildPacketFiles(): Promise<{ name: string; bytes: Uint8Array }[] | null> {
    const a = current();
    const p = view.packet;
    p.building = true;
    p.error = "";
    p.status = "Drawing the account…";
    p.built = [];
    host.render();
    try {
      const [{ courtFormPdf }, { buildPacket }] = await Promise.all([import("./engine/courtFormPdf.ts"), import("./engine/packet.ts")]);
      const account = await courtFormPdf(courtForm(a));
      const files = [];
      const skipped: string[] = [];
      for (const x of a.attachments.filter((y) => y.include)) {
        const bytes = await getFile(x.id);
        if (bytes) files.push({ name: x.name, type: x.type, bytes });
        else skipped.push(x.name);
      }
      p.status = `Adding ${files.length} document${files.length === 1 ? "" : "s"}…`;
      host.render();
      const form = courtForm(a);
      const parts = await buildPacket(account, files, { ...a.packet, title: `${form.title} — ${a.details.subject}`.trim() });
      const base = packetBase(a);
      const out = parts.map((x) => ({ name: `${base}-${x.suffix}.pdf`, bytes: x.bytes, pages: x.pages }));
      p.built = out.map((x) => ({ name: x.name, pages: x.pages }));
      p.status = skipped.length ? `Left out because the file is missing: ${skipped.join(", ")}.` : "";
      return out;
    } catch (e) {
      p.error = (e as Error).message;
      p.status = "";
      return null;
    } finally {
      p.building = false;
      host.render();
    }
  }

  let packetUrl = "";

  /** A change to the contents or options makes the last preview out of date. */
  function packetChanged(): void {
    view.packet.previewing = false;
    view.packet.previewNote = "";
    view.packet.built = [];
    view.packet.status = "";
    view.packet.error = "";
  }
  async function previewPacket(): Promise<void> {
    const p = view.packet;
    p.previewing = true;
    p.previewNote = "";
    if (packetUrl) URL.revokeObjectURL(packetUrl);
    packetUrl = "";
    const out = await buildPacketFiles();
    if (!out) {
      p.previewing = false;
      return;
    }
    // Without a built-in PDF viewer (some phone browsers), a framed PDF downloads instead of showing.
    if (!navigator.pdfViewerEnabled) {
      p.previewNote = "This browser can't show PDFs on the page. Use Download packet to open it.";
      return;
    }
    if (out.length > 1) p.previewNote = `Showing ${out[0].name}, the first of ${out.length} files.`;
    packetUrl = URL.createObjectURL(new Blob([out[0].bytes as BlobPart], { type: "application/pdf" }));
  }

  async function downloadPacket(): Promise<void> {
    const out = await buildPacketFiles();
    if (!out) return;
    if (out.length === 1) host.download(out[0].name, "application/pdf", out[0].bytes);
    else host.download(`${packetBase(current())}-filing.zip`, "application/zip", zipSync(Object.fromEntries(out.map((x) => [x.name, x.bytes]))));
  }

  async function suggest(): Promise<void> {
    const key = needKey();
    if (!key) return;
    const a = current();
    const wanted = a.transactions.filter((t) => !t.payee || (a.useCategories && !t.category));
    if (!wanted.length) {
      alert("Every entry already has a payee" + (a.useCategories ? " and a category." : "."));
      return;
    }
    view.busy = true;
    const j = job(`${wanted.length} entries`, "Suggesting payees");
    view.tab = "records";
    host.render();
    const ai = await import("./ai/extract.ts");
    const { describeError } = await import("./ai/generate.ts");
    try {
      const out = await ai.suggestEntries({
        apiKey: key,
        txns: wanted.map((t) => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, ...(t.payee ? { payee: t.payee } : {}), ...(t.memo ? { memo: t.memo } : {}) })),
        categories: a.useCategories ? a.categories : [],
        accounts: a.accounts,
        rules: a.rules,
        onStatus: (s) => ((j.what = s), host.render()),
      });
      let changed = 0;
      for (const t of wanted) {
        const s = out.get(t.id);
        if (!s) continue;
        if (!t.payee && s.payee) t.payee = s.payee;
        if (!t.purpose && s.description) t.purpose = s.description;
        if (!t.category && s.category && (s.category !== "transfer" || a.accounts.length > 1)) t.category = s.category;
        view.reasons[t.id] = s.reason;
        changed++;
      }
      j.status = "done";
      j.what = "Suggesting payees";
      j.message = `${changed} entries filled in. They're marked with a wand on Entries; review each one.`;
      view.tab = "entries";
      view.filter = "unreviewed";
      persist();
    } catch (e) {
      j.status = "error";
      j.message = describeError(e);
    } finally {
      view.busy = false;
      host.render();
    }
  }

  async function drawPreview(): Promise<void> {
    const host$ = host.root.querySelector<HTMLElement>("#form-preview");
    if (!host$) return;
    const run = ++previewRun;
    // Without a built-in PDF viewer (some phone browsers), a framed PDF downloads on every visit.
    if (!navigator.pdfViewerEnabled) {
      host$.innerHTML = `<div class="pad"><p>This browser can't show PDFs on the page. Use <strong>PDF</strong> above to download the form and open it.</p></div>`;
      return;
    }
    try {
      const { courtFormPdf } = await import("./engine/courtFormPdf.ts");
      const bytes = await courtFormPdf(courtForm(current()));
      if (run !== previewRun) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      host$.innerHTML = `<iframe title="Court form preview" src="${previewUrl}#view=FitH"></iframe>`;
    } catch (e) {
      host$.innerHTML = `<p class="bad pad">${(e as Error).message}</p>`;
    }
  }

  const actions: Record<string, (el: HTMLElement) => void | Promise<void>> = {
    "acct-tab"(el) {
      view.tab = el.dataset.tab as AcctTab;
      window.scrollTo(0, 0);
    },
    "acct-new"() {
      const a = blankAccounting(newId("acctg"));
      data.accountings.push(a);
      select(a.id);
      view.tab = "setup";
    },
    "acct-delete"() {
      const a = current();
      if (!confirm(`Delete the accounting "${a.name}" and everything read into it?`)) return;
      void deleteFiles(a.attachments.map((x) => x.id));
      data.accountings = data.accountings.filter((x) => x !== a);
      if (!data.accountings.length) data.accountings.push(blankAccounting(newId("acctg")));
      select(data.accountings[0].id);
    },
    "acct-add-account"() {
      current().accounts.push({ id: newId("acct"), name: "Bank account", begin: null });
    },
    "acct-remove-account"(el) {
      const a = current();
      const acct = a.accounts[Number(el.dataset.index)];
      const lines = a.transactions.filter((t) => t.accountId === acct.id).length;
      if (lines && !confirm(`Remove "${acct.name}" and its ${lines} entries?`)) return;
      a.accounts.splice(Number(el.dataset.index), 1);
      for (const s of a.statements.filter((x) => x.accountId === acct.id)) removeStatement(a, s.id);
      a.transactions = a.transactions.filter((t) => t.accountId !== acct.id);
    },
    "acct-add-asset"() {
      current().assets.push({ id: newId("asset"), description: "", begin: null, end: null });
    },
    "acct-remove-asset"(el) {
      current().assets.splice(Number(el.dataset.index), 1);
    },
    "acct-add-category"() {
      current().categories.push({ id: newId("cat"), label: "New category", flow: "disbursement" });
    },
    "acct-remove-category"(el) {
      const a = current();
      const [c] = a.categories.splice(Number(el.dataset.index), 1);
      for (const t of a.transactions) if (t.category === c.id) delete t.category;
    },
    "acct-remove-statement"(el) {
      const a = current();
      const s = a.statements.find((x) => x.id === el.dataset.id)!;
      if (!confirm(`Remove "${s.fileName}" and the entries read from it?`)) return;
      removeStatement(a, s.id);
    },
    "acct-remove-check"(el) {
      const a = current();
      a.checks = a.checks.filter((c) => c.id !== el.dataset.id);
    },
    "acct-add-entry"() {
      const a = current();
      if (!a.accounts.length) a.accounts.push({ id: newId("acct"), name: "Bank account", begin: null });
      const t = { id: newId("txn"), accountId: view.account || a.accounts[0].id, date: a.details.periodEnd || new Date().toISOString().slice(0, 10), description: "Entered by hand", amount: 0 };
      a.transactions.push(t);
      view.focus = { title: "The new entry. Fill it in, then show all entries.", ids: [t.id] };
    },
    "acct-remove-entry"(el) {
      const a = current();
      const t = a.transactions.find((x) => x.id === el.dataset.id)!;
      if (!confirm(`Delete the entry "${t.payee || t.description}" on ${t.date}?${t.statementId ? "\n\nIt was read from a bank record, so that record won't balance without it." : ""}`)) return;
      a.transactions = a.transactions.filter((x) => x !== t);
      matchChecks(a);
    },
    "acct-mark-reviewed"() {
      const shown = [...host.root.querySelectorAll<HTMLInputElement>('input[data-field="reviewed"]')].map((x) => x.dataset.txn);
      const a = current();
      for (const t of a.transactions) if (shown.includes(t.id)) t.reviewed = true;
    },
    "acct-show-lines"(el) {
      const f = findings(current())[Number(el.dataset.index)];
      view.focus = { title: f.title, ids: f.txnIds ?? [] };
      view.tab = "entries";
      window.scrollTo(0, 0);
    },
    "acct-att-move"(el) {
      packetChanged();
      const list = current().attachments;
      const i = Number(el.dataset.index);
      const to = i + Number(el.dataset.dir);
      if (to < 0 || to >= list.length) return;
      [list[i], list[to]] = [list[to], list[i]];
    },
    "acct-att-remove"(el) {
      packetChanged();
      const a = current();
      const [x] = a.attachments.splice(Number(el.dataset.index), 1);
      void deleteFiles([x.id]);
    },
    "acct-packet-preview"() {
      return previewPacket();
    },
    "acct-packet-download"() {
      return downloadPacket();
    },
    "acct-clear-focus"() {
      view.focus = null;
    },
    "acct-suggest"() {
      return suggest();
    },
    async "acct-download-pdf"() {
      const a = current();
      const { courtFormPdf } = await import("./engine/courtFormPdf.ts");
      host.download(`${slug(`${a.details.subject} ${a.details.title} account`)}.pdf`, "application/pdf", await courtFormPdf(courtForm(a)));
    },
    "acct-download-form-xlsx"() {
      const a = current();
      host.download(`${slug(`${a.details.subject} ${a.details.title} account`)}.xlsx`, XLSX_MIME, writeXlsx(courtFormSheets(courtForm(a))));
    },
    "acct-download-review-xlsx"() {
      const a = current();
      host.download(`${slug(`${a.details.subject} ${a.details.title} review`)}.xlsx`, XLSX_MIME, writeXlsx(accountingWorkbook(a)));
    },
    "acct-export"() {
      const a = current();
      host.download(`${slug(a.name)}.json`, "application/json", JSON.stringify(a, null, 2));
    },
    "acct-reset"() {
      if (!confirm("Delete every accounting in this browser and restore the samples?")) return;
      data = resetAccountings();
      void clearFiles();
      select(data.currentId);
    },
  };

  const ASYNC = new Set(["acct-suggest", "acct-download-pdf", "acct-download-form-xlsx", "acct-download-review-xlsx", "acct-export", "acct-packet-preview", "acct-packet-download"]);

  function applyBinding(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    const a = current();
    const kind = el.dataset.kind;
    const value =
      kind === "bool"
        ? (el as HTMLInputElement).checked
        : kind === "boolstr"
          ? el.value === "true"
          : kind === "money"
            ? moneyValue(el.value)
            : kind === "int"
              ? Number.parseInt(el.value, 10) > 0
                ? Number.parseInt(el.value, 10)
                : null
              : el.value;
    setPath(a, el.dataset.abind!, value);
    if (el.dataset.abind!.endsWith(".last4")) a.accounts.forEach((x) => x.last4 && (x.last4 = x.last4.replace(/\D/g, "").slice(-4)));
    persist();
  }

  function applyTxn(el: HTMLInputElement | HTMLSelectElement): void {
    const a = current();
    const t = a.transactions.find((x) => x.id === el.dataset.txn);
    if (!t) return;
    const f = el.dataset.field!;
    if (f === "reviewed") t.reviewed = (el as HTMLInputElement).checked || undefined;
    else if (f === "amount") t.amount = moneyValue(el.value) ?? 0;
    else if (f === "date") t.date = el.value || t.date;
    else if (f === "category") {
      if (el.value) t.category = el.value;
      else delete t.category;
    } else {
      const text = el.value.trim();
      const key = f as "payee" | "purpose" | "checkNumber";
      if (text) t[key] = el.value;
      else delete t[key];
      if (f === "checkNumber") matchChecks(a);
    }
    persist();
  }

  function applyStatement(el: HTMLInputElement): void {
    const s = current().statements.find((x) => x.id === el.dataset.stmt);
    if (!s) return;
    s[el.dataset.field as "opening" | "closing"] = moneyValue(el.value);
    persist();
  }

  return {
    picker(): string {
      const a = current();
      return `<select id="accounting-select" aria-label="Accounting">${data.accountings.map((x) => `<option value="${esc(x.id)}"${x.id === a.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <div class="top-actions">
          <button class="hbtn" data-action="acct-new">${icon("plus", 14)} New</button>
          <button class="hbtn" data-action="acct-delete">${icon("trash", 14)} Delete</button>
        </div>`;
    },
    tabs(): string {
      const a = current();
      const found = findings(a);
      const errors = found.filter((f) => f.level === "error").length;
      return ACCT_TABS.map(([id, label, ic]) => {
        const badge = id === "review" && found.length ? `<span class="tab-badge ${errors ? "bad" : "warn"}">${found.length}</span>` : "";
        return `<button class="${view.tab === id ? "on" : ""}" data-action="acct-tab" data-tab="${id}">${icon(ic, 14)}${label}${badge}</button>`;
      }).join("");
    },
    body(): string {
      const a = current();
      const banner = storageFull ? `<div class="banner storage">This browser's storage is full, so recent changes won't survive a reload. Export the accounting from Setup.</div>` : "";
      switch (view.tab) {
        case "records":
          return banner + recordsHtml(a, view);
        case "entries":
          return banner + entriesHtml(a, view);
        case "review":
          return banner + reviewHtml(a);
        case "packet":
          return banner + packetHtml(a, view);
        case "form":
          return banner + formHtml(a);
        default:
          return banner + setupHtml(a);
      }
    },
    afterRender(): void {
      if (view.tab === "form") void drawPreview();
      if (view.tab === "packet") {
        void checkFiles();
        const frame = host.root.querySelector<HTMLElement>("#packet-preview");
        if (frame && packetUrl && !view.packet.building) frame.insertAdjacentHTML("beforeend", `<iframe title="Filing packet preview" src="${packetUrl}#view=FitH"></iframe>`);
      }
    },
    /** Runs an accounting action; true when it re-renders by itself later. */
    run(name: string, el: HTMLElement): boolean | undefined {
      const action = actions[name];
      if (!action) return undefined;
      const result = action(el);
      if (result instanceof Promise) {
        result.then(() => host.render(), (e) => alert((e as Error).message));
      }
      if (!ASYNC.has(name)) persist();
      return ASYNC.has(name);
    },
    onInput(el: HTMLInputElement | HTMLTextAreaElement): boolean {
      if (el.id === "acct-key") {
        view.apiKey = el.value.trim();
        host.setApiKey(view.apiKey);
        return true;
      }
      if (el.id === "acct-search") {
        view.search = el.value;
        clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => host.rerender(), 200);
        return true;
      }
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return Boolean(el.dataset.abind || el.dataset.txn || el.dataset.att);
      if (el.dataset.abind) {
        applyBinding(el);
        return true;
      }
      if (el.dataset.txn) {
        applyTxn(el as HTMLInputElement);
        return true;
      }
      if (el.dataset.stmt) {
        applyStatement(el as HTMLInputElement);
        return true;
      }
      return false;
    },
    onChange(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
      if (el.id === "accounting-select") {
        select(el.value);
        persist();
        host.render();
        return true;
      }
      if (el.id === "acct-filter" || el.id === "acct-account") {
        if (el.id === "acct-filter") view.filter = el.value as EntryFilter;
        else view.account = el.value;
        host.render();
        return true;
      }
      if (el.dataset.acctUpload !== undefined) {
        const files = [...((el as HTMLInputElement).files ?? [])];
        if (files.length) void readFiles(el.dataset.acctUpload, files);
        return true;
      }
      if (el.dataset.acctImport !== undefined) {
        const file = (el as HTMLInputElement).files?.[0];
        if (file) void importFile(file);
        return true;
      }
      if (el.dataset.abind) {
        applyBinding(el);
        if (el.dataset.abind.startsWith("packet.")) packetChanged();
        host.rerender();
        return true;
      }
      if (el.dataset.txn) {
        applyTxn(el as HTMLInputElement);
        host.rerender();
        return true;
      }
      if (el.dataset.att) {
        const x = current().attachments.find((y) => y.id === el.dataset.att);
        if (x && el.dataset.field === "include") x.include = (el as HTMLInputElement).checked;
        if (x && el.dataset.field === "kind") x.kind = el.value as AttachmentKind;
        packetChanged();
        persist();
        host.render();
        return true;
      }
      if (el.dataset.stmt) {
        applyStatement(el as HTMLInputElement);
        host.rerender();
        return true;
      }
      return false;
    },
    flush(): void {
      saveAccountings(data);
    },
  };

  async function importFile(file: File): Promise<void> {
    try {
      const a = normalizeAccounting(JSON.parse(await file.text()));
      if (!a.accounts.length && !a.transactions.length && !a.details.subject) throw new Error();
      if (data.accountings.some((x) => x.id === a.id)) a.id = newId("acctg");
      data.accountings.push(a);
      select(a.id);
      persist();
    } catch {
      alert(`"${file.name}" isn't an accounting file.`);
    }
    host.render();
  }
}

let searchTimer = 0;
