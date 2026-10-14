// Transactions from a bank's CSV download. Exact data with no AI: the columns
// are recognized by their headings, which differ from bank to bank.

import { normalizeImported, sum, type ImportedLine, type ImportedStatement } from "./accounting.ts";

/** Splits CSV text into rows of cells, honoring quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "$1,234.56", "(12.00)", "-12.00", "12.00 DR" → a signed number; null if it isn't one. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\s*(DR|DB)$/i.test(s)) {
    sign = -sign;
    s = s.replace(/\s*(DR|DB)$/i, "");
  }
  s = s.replace(/\s*CR$/i, "").replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return sign * Number(s);
}

/** "01/31/2026", "1/31/26", "2026-01-31", "01-31-2026" → "2026-01-31"; null if it isn't a date. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, Number(m[1]), Number(m[2]));
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface CsvColumns {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  check?: number;
  balance?: number;
}

/** Finds the columns by their headings; null if there's no date, description and amount. */
export function detectColumns(header: string[]): CsvColumns | null {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...tests: RegExp[]) => {
    for (const test of tests) {
      const i = h.findIndex((x) => test.test(x));
      if (i !== -1) return i;
    }
    return undefined;
  };
  const date = find(/^(post(ing|ed)?|transaction|trans\.?)\s*date$/, /^date\s*posted$/, /^date$/, /date/);
  const description = find(/^description$/, /description|details|narrative/, /payee|name|memo/);
  const amount = find(/^(transaction\s*)?amount$/, /^amount/);
  const debit = find(/debit|withdrawal|money out|^payments?$/);
  const credit = find(/credit|deposit|money in/);
  const check = find(/^(check|cheque|chk)\b/, /\b(check|cheque|chk)\s*(no|num|#)/, /serial/);
  const balance = find(/balance/);
  if (date === undefined || description === undefined) return null;
  if (amount === undefined && debit === undefined && credit === undefined) return null;
  return { date, description, amount, debit, credit, check, balance };
}

export interface CsvResult {
  statement: ImportedStatement;
  warnings: string[];
}

/** Reads a bank CSV. Opening and closing balances come from a running-balance column when there is one. */
export function readBankCsv(text: string): CsvResult {
  const rows = parseCsv(text);
  // Some banks put account details above the table; the heading row is the first one we recognize.
  const headerIndex = rows.slice(0, 15).findIndex((r) => detectColumns(r) !== null);
  if (headerIndex === -1) throw new Error("No date, description and amount columns found. Is this a bank transaction download?");
  const cols = detectColumns(rows[headerIndex])!;
  const warnings: string[] = [];
  const lines: ImportedLine[] = [];

  rows.slice(headerIndex + 1).forEach((r, i) => {
    const date = parseDate(r[cols.date] ?? "");
    let amount: number | null = null;
    if (cols.amount !== undefined) amount = parseAmount(r[cols.amount] ?? "");
    if (amount === null && (cols.debit !== undefined || cols.credit !== undefined)) {
      const out = cols.debit !== undefined ? parseAmount(r[cols.debit] ?? "") : null;
      const inn = cols.credit !== undefined ? parseAmount(r[cols.credit] ?? "") : null;
      if (out !== null || inn !== null) amount = sum([Math.abs(inn ?? 0), -Math.abs(out ?? 0)]);
    }
    if (!date || amount === null) {
      if (r.some((c) => c.trim())) warnings.push(`Row ${headerIndex + i + 2} skipped: no date or amount.`);
      return;
    }
    const description = (r[cols.description] ?? "").trim();
    const checkCell = cols.check !== undefined ? (r[cols.check] ?? "").replace(/\D/g, "") : "";
    const checkNumber = checkCell || /\b(?:check|chk|ck)\s*#?\s*(\d{2,})\b/i.exec(description)?.[1];
    const balance = cols.balance !== undefined ? parseAmount(r[cols.balance] ?? "") : null;
    lines.push({ date, description, amount, ...(checkNumber ? { checkNumber } : {}), balance });
  });
  if (!lines.length) throw new Error("No transactions found in this file.");

  const statement = normalizeImported({ institution: "", accountName: "", last4: "", start: "", end: "", opening: null, closing: null, transactions: lines });
  if (lines.some((l) => l.balance === null)) {
    warnings.push("No running balance in this file: enter the opening and closing balances from the statement so it can be checked.");
    statement.opening = null;
    statement.closing = null;
  }
  return { statement, warnings };
}
