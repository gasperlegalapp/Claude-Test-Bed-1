// The account as filed with the probate court: every receipt and disbursement
// by date under each bank account, opening with the balance carried from the
// prior account, then the recapitulation, the itemized statement of assets
// remaining, and the signature blocks. Laid out like the Franklin County
// guardian's account the firm files. One model feeds both the editable Excel
// file and the PDF (courtFormPdf.ts), so they always agree.

import { addDays, beginningBalance, periodTxns, summarize, sum, type Accounting, type AccountingKind } from "./accounting.ts";
import type { Cell, CellValue, Sheet } from "./xlsx.ts";

export interface FormLine {
  date: string;
  payee: string;
  description: string;
  checkNumber: string;
  disbursement: number | null;
  receipt: number | null;
}

export interface FormSection {
  /** e.g. "Example Bank Guardianship checking #xx4321". */
  account: string;
  lines: FormLine[];
}

export interface Signer {
  role: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  registration?: string;
}

export interface CourtForm {
  caption: { left: string[]; center: string[] };
  title: string;
  /** e.g. "Seventh Partial". */
  accountTitle: string;
  from: string;
  to: string;
  sections: FormSection[];
  totals: { receipts: number; disbursements: number; remaining: number };
  assets: { item: string; value: number | null }[];
  totalAssets: number;
  signers: [Signer, Signer];
}

const TITLES: Record<AccountingKind, string> = { guardianship: "GUARDIAN'S ACCOUNT", estate: "FIDUCIARY'S ACCOUNT", trust: "TRUSTEE'S ACCOUNT", other: "ACCOUNT" };
const ROLES: Record<AccountingKind, string> = { guardianship: "Guardian", estate: "Fiduciary", trust: "Trustee", other: "Fiduciary" };

/** 2025-01-22 → 1/22/2025, as the court's forms write dates. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : iso;
}

export function courtForm(a: Accounting): CourtForm {
  const d = a.details;
  const s = summarize(a);
  const txns = periodTxns(a)
    .map((t, i) => ({ t, i }))
    .sort((x, y) => x.t.date.localeCompare(y.t.date) || x.i - y.i)
    .map((x) => x.t);

  const sections = a.accounts.map((acct): FormSection => {
    const begin = beginningBalance(a, acct).amount ?? 0;
    const carried: FormLine = {
      date: d.periodStart ? addDays(d.periodStart, -1) : "",
      payee: d.priorFiledOn ? `Balance from prior account filed ${shortDate(d.priorFiledOn)}` : "Balance from prior account",
      description: "",
      checkNumber: "",
      disbursement: null,
      receipt: begin,
    };
    const lines = txns
      .filter((t) => t.accountId === acct.id)
      .map((t): FormLine => {
        // Money out is a disbursement and money in a receipt; transfers too, so each account's column still adds up.
        const out = t.amount < 0;
        return {
          date: t.date,
          payee: t.payee || t.description,
          description: t.purpose ?? "",
          checkNumber: t.checkNumber ?? "",
          disbursement: out ? -t.amount : null,
          receipt: out ? null : t.amount,
        };
      });
    return { account: accountName(a, acct.id), lines: [carried, ...lines] };
  });

  const all = sections.flatMap((x) => x.lines);
  const receipts = sum(all.map((l) => l.receipt ?? 0));
  const disbursements = sum(all.map((l) => l.disbursement ?? 0));
  const assets = [
    ...s.accounts.map((line) => ({ item: `Balance of ${accountName(a, line.account.id, true)} Balance ${shortDate(d.periodEnd)}`, value: line.end })),
    ...a.assets.map((x) => ({ item: x.description, value: x.end })),
  ];
  const role = ROLES[d.kind];
  return {
    caption: {
      left: [d.subject.toUpperCase(), "", "", d.caseNumber ? `CASE NO. ${d.caseNumber}` : ""],
      center: [d.court.toUpperCase(), d.judge ? `${d.judge.toUpperCase()}, JUDGE` : ""].filter(Boolean),
    },
    title: TITLES[d.kind],
    accountTitle: d.title,
    from: shortDate(d.periodStart),
    to: shortDate(d.periodEnd),
    sections,
    totals: { receipts, disbursements, remaining: sum([receipts, -disbursements]) },
    assets,
    totalAssets: sum(assets.map((x) => x.value ?? 0)),
    signers: [
      { role: `Attorney for ${role}`, name: d.attorneyName, address: d.attorneyAddress, city: d.attorneyCity, phone: d.attorneyPhone, registration: d.attorneyRegistration },
      { role, name: d.fiduciary, address: d.fiduciaryAddress, city: d.fiduciaryCity, phone: d.fiduciaryPhone },
    ],
  };
}

function accountName(a: Accounting, id: string, short = false): string {
  const acct = a.accounts.find((x) => x.id === id)!;
  const last4 = acct.last4 ? (short ? ` xx${acct.last4}` : ` #xx${acct.last4}`) : "";
  return `${[acct.institution, acct.name].filter(Boolean).join(" ")}${last4}`;
}

// ------------------------------------------------------------------ Excel

const COLS = [10.6, 17, 18.7, 9.5, 15.6, 17.4];

/**
 * The form as an editable workbook: one sheet per bank account, the
 * recapitulation and signatures after the last. The court caption and page
 * number print at the top of each page, and the title block repeats on every
 * page, as on the firm's sheet. Totals are formulas, so edits keep adding up.
 */
export function courtFormSheets(form: CourtForm): Sheet[] {
  const pageHeader = { left: form.caption.left.join("\n"), center: form.caption.center.join("\n"), right: "\n\n\nPage &P" };
  const margins = { left: 0.7, right: 0.7, top: 1.3, bottom: 0.75, header: 0.3, footer: 0.3 };
  const ranges: { sheet: string; first: number; last: number }[] = [];
  const sheetName = (i: number) => (form.sections.length === 1 ? "Account" : `Account ${i + 1}`);

  const sheets: Sheet[] = form.sections.map((section, i) => {
    const rows: (Cell | CellValue)[][] = [
      [{ v: form.title, style: "formTitle" }],
      [],
      ["Account", null, null, null, { v: form.accountTitle, style: "ruled" }, "Account"],
      [section.account, null, null, null, `From ${form.from}`, `To ${form.to}`],
      [],
      [
        { v: "DATE", style: "ruled" },
        { v: "PAYEE", style: "ruled" },
        { v: "DESCRIPTION", style: "ruled" },
        { v: "Check No.", style: "ruled" },
        { v: "DISBURSEMENT", style: "ruledCenter" },
        { v: "RECEIPT", style: "ruledCenter" },
      ],
    ];
    const first = rows.length + 1;
    for (const l of section.lines) {
      rows.push([
        { v: l.date, style: "shortDate" },
        l.payee,
        l.description,
        l.checkNumber ? (/^\d+$/.test(l.checkNumber) ? Number(l.checkNumber) : l.checkNumber) : null,
        { v: l.disbursement, style: "accounting" },
        { v: l.receipt, style: "accounting" },
      ]);
    }
    ranges.push({ sheet: sheetName(i), first, last: rows.length });
    return { name: sheetName(i), cols: COLS, rows, merges: ["A1:F1"], pageHeader, printTitleRows: [1, 6], margins };
  });

  // Recapitulation, itemized statement and signatures after the last account.
  const last = sheets[sheets.length - 1];
  const rows = last.rows;
  const ref = (col: string) =>
    ranges.map((r) => `${form.sections.length === 1 ? "" : `'${r.sheet}'!`}${col}${r.first}:${col}${r.last}`).join(",");
  const merges = last.merges!;
  const at = () => rows.length + 1;
  rows.push([], []);
  merges.push(`A${at()}:F${at()}`);
  rows.push([{ v: "RECAPITULATION", style: "formTitle" }]);
  rows.push([]);
  const receiptsRow = at();
  rows.push([{ v: "Total Receipts", style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: form.totals.receipts, f: `SUM(${ref("F")})`, style: "accountingRuled" }]);
  const disbRow = at();
  rows.push([{ v: "Total Disbursements", style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: form.totals.disbursements, f: `SUM(${ref("E")})`, style: "accountingRuled" }]);
  rows.push([{ v: "Balance Remaining", style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: form.totals.remaining, f: `E${receiptsRow}-E${disbRow}`, style: "accountingRuled" }]);
  merges.push(`A${receiptsRow}:D${receiptsRow}`, `A${disbRow}:D${disbRow}`, `A${disbRow + 1}:D${disbRow + 1}`);
  rows.push([]);
  merges.push(`A${at()}:F${at()}`);
  rows.push([{ v: "ITEMIZED STATEMENT OF ALL FUNDS, ASSETS, and INVESTMENTS", style: "boldCenter" }]);
  rows.push([{ v: "Item", style: "bold" }]);
  const firstAsset = at();
  for (const asset of form.assets) {
    merges.push(`A${at()}:D${at()}`);
    rows.push([{ v: asset.item, style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: null, style: "ruled" }, { v: asset.value, style: "accountingRuled" }]);
  }
  const lastAsset = at() - 1;
  rows.push([]);
  merges.push(`A${at()}:D${at()}`);
  rows.push([
    { v: "TOTAL ASSETS REMAINING:", style: "bold" },
    null,
    null,
    null,
    { v: form.totalAssets, f: lastAsset >= firstAsset ? `SUM(E${firstAsset}:E${lastAsset})` : undefined, style: "accountingRuled" },
  ]);
  rows.push([], [], []);

  // Signature blocks: a line to sign on, then each detail over its caption.
  const [left, right] = form.signers;
  const pair = (l: string, r: string, style: "ruled" | "small") => {
    const cells: (Cell | CellValue)[] = [{ v: l, style }, { v: null, style }, null, { v: r, style }, { v: null, style }, { v: null, style }];
    merges.push(`A${at()}:B${at()}`, `D${at()}:F${at()}`);
    rows.push(cells);
  };
  pair("", "", "ruled");
  pair(left.role, right.role, "small");
  pair(left.name, right.name, "ruled");
  pair("Typed or Printed Name", "Typed or Printed Name", "small");
  pair(left.address, right.address, "ruled");
  pair("Address", "Address", "small");
  pair(left.city, right.city, "ruled");
  pair("City, State, Zip", "City, State, Zip", "small");
  pair(left.phone, right.phone, "ruled");
  pair("Telephone Number", "Telephone Number", "small");
  if (left.registration !== undefined) {
    merges.push(`A${at()}:B${at()}`);
    rows.push([{ v: left.registration, style: "ruled" }, { v: null, style: "ruled" }]);
    merges.push(`A${at()}:B${at()}`);
    rows.push([{ v: "Attorney Registration No.", style: "small" }]);
  }
  return sheets;
}

