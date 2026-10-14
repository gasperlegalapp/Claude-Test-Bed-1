// Fiduciary accountings built from bank records.
//
// An accounting is plain data: the bank accounts, the statements read from
// bank records, their transactions, copies of checks, and other assets held.
// Everything here is plain arithmetic and checks; nothing guesses. Reading the
// records (src/ai/extract.ts, bankCsv.ts) fills the data, and this module says
// whether it balances and what still needs a person's attention.

export type Flow = "receipt" | "disbursement";

/** Optional grouping for receipts and disbursements; whether money came in or went out decides which it is. */
export interface Category {
  id: string;
  label: string;
  flow: Flow;
  /** Needs a court entry (e.g. fees); a disbursement in it without an approval date is flagged. */
  approval?: boolean;
}

/** Category id for money moved between the fiduciary's own accounts: neither a receipt nor a disbursement. */
export const TRANSFER = "transfer";

export interface BankAccount {
  id: string;
  name: string;
  institution?: string;
  last4?: string;
  /** Balance at the start of the period, e.g. from the inventory or last account. Null: take it from the statements. */
  begin: number | null;
}

export interface Statement {
  id: string;
  accountId: string;
  fileName: string;
  start: string;
  end: string;
  opening: number | null;
  closing: number | null;
}

export interface Txn {
  id: string;
  accountId: string;
  /** The statement it was read from; none for entries added by hand. */
  statementId?: string;
  date: string;
  description: string;
  /** Money in is positive (a receipt), money out negative (a disbursement). */
  amount: number;
  /** The bank's running balance after this line, when the record shows one. */
  balance?: number;
  checkNumber?: string;
  /** Who was paid or where the money came from, as it reads on the account. */
  payee?: string;
  /** The account's description column, e.g. "rent". */
  purpose?: string;
  /** From the check copy. */
  memo?: string;
  category?: string;
  voucher?: string;
  /** Date of the court entry approving it, for categories that need one. */
  approvedOn?: string;
  note?: string;
  reviewed?: boolean;
  /** What the reader wasn't sure about, e.g. a smudged amount. */
  doubt?: string;
}

export interface CheckCopy {
  id: string;
  fileName: string;
  number: string;
  date: string;
  payee: string;
  amount: number | null;
  memo: string;
  doubt?: string;
  /** The statement line it was matched to. */
  txnId?: string;
}

/** Property other than bank balances, e.g. real estate or a vehicle. */
export interface HeldAsset {
  id: string;
  description: string;
  begin: number | null;
  end: number | null;
}

export type AccountingKind = "estate" | "guardianship" | "trust" | "other";

export type AttachmentKind = "statement" | "checks" | "other";

/** A document filed behind the account, e.g. bank statements or check copies. The file itself is kept separately (fileStore.ts). */
export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  type: string;
  pages: number;
  size: number;
  include: boolean;
}

export interface PacketOptions {
  /** File the account and the attachments as separate PDFs. */
  separate: boolean;
  /** Split into parts of at most this many pages; null for no limit. */
  maxPages: number | null;
}

export interface Accounting {
  id: string;
  name: string;
  details: {
    court: string;
    caseNumber: string;
    kind: AccountingKind;
    /** Decedent, ward, or trust. */
    subject: string;
    fiduciary: string;
    judge: string;
    /** e.g. "Seventh Partial"; the form adds "Account". */
    title: string;
    periodStart: string;
    periodEnd: string;
    /** When the prior account was filed, for the opening "Balance from prior account" line. */
    priorFiledOn: string;
    fiduciaryAddress: string;
    fiduciaryCity: string;
    fiduciaryPhone: string;
    attorneyName: string;
    attorneyAddress: string;
    attorneyCity: string;
    attorneyPhone: string;
    attorneyRegistration: string;
  };
  /** Sort every receipt and disbursement into a category. Off for forms that just list them by date. */
  useCategories: boolean;
  accounts: BankAccount[];
  statements: Statement[];
  transactions: Txn[];
  checks: CheckCopy[];
  assets: HeldAsset[];
  categories: Category[];
  /** The firm's instructions for sorting transactions, given to the AI. */
  rules: string;
  /** Documents filed behind the account, in filing order. */
  attachments: Attachment[];
  packet: PacketOptions;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "income", label: "Income (interest, dividends)", flow: "receipt" },
  { id: "benefits", label: "Social Security, pension and benefits", flow: "receipt" },
  { id: "asset_sale", label: "Sale of assets", flow: "receipt" },
  { id: "refunds", label: "Refunds", flow: "receipt" },
  { id: "other_receipts", label: "Other receipts", flow: "receipt" },
  { id: "care", label: "Care and living expenses", flow: "disbursement" },
  { id: "medical", label: "Medical", flow: "disbursement" },
  { id: "housing", label: "Housing and utilities", flow: "disbursement" },
  { id: "taxes", label: "Taxes", flow: "disbursement" },
  { id: "court_costs", label: "Court costs and bond", flow: "disbursement" },
  { id: "attorney_fees", label: "Attorney fees", flow: "disbursement", approval: true },
  { id: "fiduciary_fees", label: "Fiduciary fees", flow: "disbursement", approval: true },
  { id: "distributions", label: "Distributions", flow: "disbursement" },
  { id: "bank_fees", label: "Bank fees", flow: "disbursement" },
  { id: "other_disbursements", label: "Other disbursements", flow: "disbursement" },
];

export function blankAccounting(id: string): Accounting {
  return {
    id,
    name: "New accounting",
    details: {
      court: "",
      caseNumber: "",
      kind: "guardianship",
      subject: "",
      fiduciary: "",
      judge: "",
      title: "",
      periodStart: "",
      periodEnd: "",
      priorFiledOn: "",
      fiduciaryAddress: "",
      fiduciaryCity: "",
      fiduciaryPhone: "",
      attorneyName: "",
      attorneyAddress: "",
      attorneyCity: "",
      attorneyPhone: "",
      attorneyRegistration: "",
    },
    useCategories: false,
    accounts: [],
    statements: [],
    transactions: [],
    checks: [],
    assets: [],
    categories: structuredClone(DEFAULT_CATEGORIES),
    rules: "",
    attachments: [],
    packet: { separate: false, maxPages: null },
  };
}

// ------------------------------------------------------------------ money

/** Money is added in whole cents so sums don't drift. */
export function cents(n: number): number {
  return Math.round(n * 100);
}

export function sum(amounts: number[]): number {
  return amounts.reduce((total, n) => total + cents(n), 0) / 100;
}

export function same(a: number, b: number): boolean {
  return cents(a) === cents(b);
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export function money(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : USD.format(n);
}

// ------------------------------------------------------------------ dates

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function inPeriod(a: Accounting, date: string): boolean {
  const { periodStart, periodEnd } = a.details;
  return (!periodStart || date >= periodStart) && (!periodEnd || date <= periodEnd);
}

// ------------------------------------------------------------------ queries

export function categoryOf(a: Accounting, t: Txn): Category | undefined {
  return a.categories.find((c) => c.id === t.category);
}

export function periodTxns(a: Accounting): Txn[] {
  return a.transactions.filter((t) => inPeriod(a, t.date));
}

/** Receipt or disbursement by direction of the money; null for transfers between the fiduciary's own accounts. */
export function flowOf(t: Txn): Flow | null {
  if (t.category === TRANSFER) return null;
  return t.amount >= 0 ? "receipt" : "disbursement";
}

function byDate<T extends { date: string }>(list: T[]): T[] {
  return [...list].sort((x, y) => x.date.localeCompare(y.date));
}

export function statementsOf(a: Accounting, accountId: string): Statement[] {
  return a.statements.filter((s) => s.accountId === accountId).sort((x, y) => x.start.localeCompare(y.start));
}

/** Opening balance plus every line on the statement. */
export function statementComputedClosing(a: Accounting, s: Statement): number | null {
  if (s.opening === null) return null;
  return sum([s.opening, ...a.transactions.filter((t) => t.statementId === s.id).map((t) => t.amount)]);
}

/** Balance at the start of the period: as entered, or worked out from the statement that covers that day. */
export function beginningBalance(a: Accounting, account: BankAccount): { amount: number | null; from: "entered" | "statement" | "none" } {
  if (account.begin !== null) return { amount: account.begin, from: "entered" };
  const start = a.details.periodStart;
  const stmts = statementsOf(a, account.id);
  const first = start ? stmts.find((s) => s.start <= start && s.end >= start) : stmts[0];
  if (!first || first.opening === null) return { amount: null, from: "none" };
  const before = a.transactions.filter((t) => t.statementId === first.id && start && t.date < start);
  return { amount: sum([first.opening, ...before.map((t) => t.amount)]), from: "statement" };
}

/** Balance the bank shows at the end of the period, from the statement covering that day. */
export function statementBalanceAtEnd(a: Accounting, account: BankAccount): number | null {
  const end = a.details.periodEnd;
  const stmts = statementsOf(a, account.id);
  const last = end ? stmts.find((s) => s.start <= end && s.end >= end) : stmts[stmts.length - 1];
  if (!last || last.closing === null) return null;
  const after = a.transactions.filter((t) => t.statementId === last.id && end && t.date > end);
  return sum([last.closing, ...after.map((t) => -t.amount)]);
}

// ------------------------------------------------------------------ summary

export interface CategoryTotal {
  id: string;
  label: string;
  total: number;
  count: number;
}

export interface AccountLine {
  account: BankAccount;
  begin: number | null;
  receipts: number;
  disbursements: number;
  transfers: number;
  end: number | null;
  /** What the bank shows at the end of the period. */
  bank: number | null;
}

export interface Summary {
  beginCash: number;
  receipts: number;
  disbursements: number;
  endCash: number;
  /** Only filled when the accounting uses categories. */
  receiptsByCategory: CategoryTotal[];
  disbursementsByCategory: CategoryTotal[];
  transfersNet: number;
  accounts: AccountLine[];
  assetsBegin: number;
  assetsEnd: number;
  /** Cash plus other assets at the end: what remains in the fiduciary's hands. */
  held: number;
}

function totals(a: Accounting, txns: Txn[], flow: Flow): CategoryTotal[] {
  const mine = txns.filter((t) => flowOf(t) === flow);
  const groups = [...a.categories.filter((c) => c.flow === flow), ...a.categories.filter((c) => c.flow !== flow), { id: "", label: "Not categorized" }];
  return groups
    .map((c) => {
      const inGroup = mine.filter((t) => (c.id ? t.category === c.id : !categoryOf(a, t)));
      // Disbursements are shown as positive amounts paid out.
      return { id: c.id, label: c.label, total: sum(inGroup.map((t) => Math.abs(t.amount))), count: inGroup.length };
    })
    .filter((c) => c.count > 0);
}

export function summarize(a: Accounting): Summary {
  const txns = periodTxns(a);
  const receiptTxns = txns.filter((t) => flowOf(t) === "receipt");
  const disbursementTxns = txns.filter((t) => flowOf(t) === "disbursement");
  const transferTxns = txns.filter((t) => t.category === TRANSFER);

  const accounts = a.accounts.map((account): AccountLine => {
    const mine = txns.filter((t) => t.accountId === account.id);
    const begin = beginningBalance(a, account).amount;
    return {
      account,
      begin,
      receipts: sum(mine.filter((t) => flowOf(t) === "receipt").map((t) => t.amount)),
      disbursements: sum(mine.filter((t) => flowOf(t) === "disbursement").map((t) => -t.amount)),
      transfers: sum(mine.filter((t) => t.category === TRANSFER).map((t) => t.amount)),
      end: begin === null ? null : sum([begin, ...mine.map((t) => t.amount)]),
      bank: statementBalanceAtEnd(a, account),
    };
  });

  const beginCash = sum(accounts.map((l) => l.begin ?? 0));
  const receipts = sum(receiptTxns.map((t) => t.amount));
  const disbursements = sum(disbursementTxns.map((t) => -t.amount));
  const transfersNet = sum(transferTxns.map((t) => t.amount));
  const endCash = sum([beginCash, receipts, -disbursements, transfersNet]);
  const assetsEnd = sum(a.assets.map((x) => x.end ?? 0));
  return {
    beginCash,
    receipts,
    disbursements,
    endCash,
    receiptsByCategory: a.useCategories ? totals(a, txns, "receipt") : [],
    disbursementsByCategory: a.useCategories ? totals(a, txns, "disbursement") : [],
    transfersNet,
    accounts,
    assetsBegin: sum(a.assets.map((x) => x.begin ?? 0)),
    assetsEnd,
    held: sum([endCash, assetsEnd]),
  };
}

// ------------------------------------------------------------------ checks

export interface Finding {
  level: "error" | "warning";
  title: string;
  detail: string;
  txnIds?: string[];
  statementId?: string;
}

function normalizeCheck(n: string | undefined): string {
  return (n ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function accountName(a: Accounting, id: string): string {
  const acct = a.accounts.find((x) => x.id === id);
  return acct ? `${acct.name}${acct.last4 ? ` …${acct.last4}` : ""}` : "an unknown account";
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Everything that keeps the accounting from being ready, worst first. Empty means it balances and nothing is open. */
export function findings(a: Accounting): Finding[] {
  const out: Finding[] = [];
  const { periodStart, periodEnd } = a.details;
  if (!periodStart || !periodEnd) out.push({ level: "error", title: "Accounting period not set", detail: "Enter the start and end dates of the period this accounting covers." });
  else if (periodStart > periodEnd) out.push({ level: "error", title: "Accounting period is backwards", detail: "The period ends before it starts." });

  for (const account of a.accounts) {
    const name = accountName(a, account.id);
    const stmts = statementsOf(a, account.id);

    for (const s of stmts) {
      const computed = statementComputedClosing(a, s);
      if (computed === null || s.closing === null) {
        out.push({ level: "warning", title: `Statement can't be checked: ${s.fileName}`, detail: `The opening or closing balance is missing for ${name}, ${s.start} to ${s.end}. Enter it from the statement.`, statementId: s.id });
      } else if (!same(computed, s.closing)) {
        const off = sum([s.closing, -computed]);
        out.push({
          level: "error",
          title: `Statement doesn't balance: ${s.fileName}`,
          detail: `${name}, ${s.start} to ${s.end}: the opening balance plus the transactions comes to ${money(computed)}, but the statement closes at ${money(s.closing)} (${money(Math.abs(off))} ${off > 0 ? "more" : "less"}). A line is probably missing, doubled or misread.`,
          statementId: s.id,
        });
      }
    }

    for (const s of stmts) {
      const off = runningBalanceMisses(a, s);
      if (off.length) {
        out.push({
          level: "error",
          title: `${plural(off.length, "line")} off from the bank's running balance: ${s.fileName}`,
          detail: "Each line's amount should take the previous balance to the balance the bank printed next to it. Compare these lines with the record: an amount, a sign or the order is probably wrong.",
          txnIds: off,
          statementId: s.id,
        });
      }
    }

    for (let i = 1; i < stmts.length; i++) {
      const prev = stmts[i - 1];
      const next = stmts[i];
      if (prev.closing !== null && next.opening !== null && !same(prev.closing, next.opening)) {
        out.push({ level: "error", title: `Balances don't carry over: ${name}`, detail: `The statement ending ${prev.end} closes at ${money(prev.closing)}, but the next one opens at ${money(next.opening)}.`, statementId: next.id });
      }
      if (next.start > addDays(prev.end, 1)) {
        out.push({ level: "warning", title: `Missing statement: ${name}`, detail: `Nothing covers ${addDays(prev.end, 1)} to ${addDays(next.start, -1)}.` });
      } else if (next.start <= prev.end) {
        out.push({ level: "warning", title: `Statements overlap: ${name}`, detail: `${prev.fileName} and ${next.fileName} both cover ${next.start} to ${prev.end}. Check for transactions counted twice.` });
      }
    }

    if (periodStart && periodEnd) {
      if (!stmts.length) {
        if (a.transactions.some((t) => t.accountId === account.id)) out.push({ level: "warning", title: `No statements: ${name}`, detail: "Its transactions were entered by hand, so nothing can check them against the bank." });
      } else {
        if (stmts[0].start > periodStart) out.push({ level: "warning", title: `Statements start late: ${name}`, detail: `The first statement starts ${stmts[0].start}, after the period starts (${periodStart}).` });
        if (stmts[stmts.length - 1].end < periodEnd) out.push({ level: "warning", title: `Statements end early: ${name}`, detail: `The last statement ends ${stmts[stmts.length - 1].end}, before the period ends (${periodEnd}).` });
      }
    }

    const begin = beginningBalance(a, account);
    if (begin.amount === null) {
      out.push({ level: "error", title: `No beginning balance: ${name}`, detail: "Enter it from the inventory or the last account, or add the statement that covers the first day of the period." });
    } else if (begin.from === "entered") {
      const fromStmt = beginningBalance(a, { ...account, begin: null });
      if (fromStmt.amount !== null && !same(fromStmt.amount, begin.amount)) {
        out.push({ level: "error", title: `Beginning balance doesn't match the bank: ${name}`, detail: `Entered as ${money(begin.amount)} (from the inventory or last account), but the statements show ${money(fromStmt.amount)} on ${periodStart}.` });
      }
    }
  }

  const summary = summarize(a);
  for (const line of summary.accounts) {
    if (line.end !== null && line.bank !== null && !same(line.end, line.bank)) {
      out.push({ level: "error", title: `Ending balance doesn't match the bank: ${accountName(a, line.account.id)}`, detail: `The accounting ends at ${money(line.end)}, but the bank shows ${money(line.bank)} on ${periodEnd}.` });
    }
  }

  const txns = periodTxns(a);
  if (a.useCategories) {
    const known = new Set([TRANSFER, ...a.categories.map((c) => c.id)]);
    const uncategorized = txns.filter((t) => !t.category || !known.has(t.category));
    if (uncategorized.length) out.push({ level: "error", title: `${plural(uncategorized.length, "transaction")} without a category`, detail: "This accounting groups receipts and disbursements by category, so each one needs a category.", txnIds: uncategorized.map((t) => t.id) });
  }

  if (!same(summary.transfersNet, 0)) {
    out.push({ level: "error", title: "Transfers don't net to zero", detail: `Money marked as transfers between the fiduciary's accounts comes to ${money(summary.transfersNet)}. Each transfer needs both sides, or the other account isn't in this accounting yet.`, txnIds: txns.filter((t) => t.category === TRANSFER).map((t) => t.id) });
  }

  const needApproval = txns.filter((t) => categoryOf(a, t)?.approval && !t.approvedOn);
  if (needApproval.length) out.push({ level: "warning", title: `${plural(needApproval.length, "payment")} without a court approval date`, detail: "These categories need a court entry. Add the date of the entry approving each one.", txnIds: needApproval.map((t) => t.id) });

  const checksWithoutCopy = txns.filter((t) => t.amount < 0 && normalizeCheck(t.checkNumber) && !t.payee);
  if (checksWithoutCopy.length) out.push({ level: "warning", title: `${plural(checksWithoutCopy.length, "check")} without a payee`, detail: "Add the check copies, or type in who each check was paid to.", txnIds: checksWithoutCopy.map((t) => t.id) });

  const doubts = txns.filter((t) => t.doubt && !t.reviewed);
  if (doubts.length) out.push({ level: "warning", title: `${plural(doubts.length, "line")} the reader wasn't sure about`, detail: "Compare each with the statement and mark it reviewed.", txnIds: doubts.map((t) => t.id) });

  const seen = new Map<string, Txn>();
  const dupes: string[] = [];
  for (const t of a.transactions) {
    const key = [t.accountId, t.date, cents(t.amount), t.description.toLowerCase().replace(/\s+/g, " ").trim()].join("|");
    const first = seen.get(key);
    if (first && first.statementId !== t.statementId) dupes.push(first.id, t.id);
    else seen.set(key, t);
  }
  if (dupes.length) out.push({ level: "warning", title: "Possible duplicates", detail: "The same date, amount and description appear on two statements. Delete one if it was counted twice.", txnIds: [...new Set(dupes)] });

  for (const c of a.checks) {
    const t = a.transactions.find((x) => x.id === c.txnId);
    if (!t) out.push({ level: "warning", title: `Check copy not matched: #${c.number || "?"}`, detail: `${c.fileName}: no statement line has check number ${c.number || "(unreadable)"}${c.amount !== null ? ` for ${money(c.amount)}` : ""}. Add the statement it cleared on, or fix the number.` });
    else if (c.amount !== null && !same(-t.amount, c.amount)) out.push({ level: "error", title: `Check #${c.number} amount differs`, detail: `The check copy says ${money(c.amount)}, the bank paid ${money(-t.amount)}.`, txnIds: [t.id] });
  }

  const order = { error: 0, warning: 1 };
  return out.sort((x, y) => order[x.level] - order[y.level]);
}

// ------------------------------------------------------------------ check copies

/** Links check copies to the statement lines with the same check number and fills in payee and memo. Returns how many were newly matched. */
export function matchChecks(a: Accounting): number {
  let matched = 0;
  const taken = new Set(a.checks.map((c) => c.txnId).filter(Boolean));
  for (const c of a.checks) {
    if (c.txnId && a.transactions.some((t) => t.id === c.txnId)) continue;
    delete c.txnId;
    const number = normalizeCheck(c.number);
    if (!number) continue;
    const candidates = a.transactions.filter((t) => !taken.has(t.id) && normalizeCheck(t.checkNumber) === number);
    const t = candidates.find((x) => c.amount !== null && same(-x.amount, c.amount)) ?? candidates[0];
    if (!t) continue;
    c.txnId = t.id;
    taken.add(t.id);
    if (!t.payee && c.payee) t.payee = c.payee;
    if (!t.memo && c.memo) t.memo = c.memo;
    matched++;
  }
  return matched;
}

// ------------------------------------------------------------------ imports

export interface ImportedLine {
  date: string;
  description: string;
  amount: number;
  checkNumber?: string;
  doubt?: string;
  /** Running balance after the line, if the record prints one. */
  balance?: number | null;
}

export interface ImportedStatement {
  institution: string;
  accountName: string;
  last4: string;
  start: string;
  end: string;
  opening: number | null;
  closing: number | null;
  transactions: ImportedLine[];
}

/** How many lines agree with the running balance when read in this order. */
function balanceFits(lines: ImportedLine[]): number {
  let fits = 0;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].balance;
    const cur = lines[i].balance;
    if (prev != null && cur != null && same(sum([prev, lines[i].amount]), cur)) fits++;
  }
  return fits;
}

/**
 * Puts the lines in the order they happened and fills in missing opening and
 * closing balances from the running balance. Online banking histories list
 * newest first and print no opening or closing balance.
 */
export function normalizeImported(s: ImportedStatement): ImportedStatement {
  let lines = [...s.transactions];
  const reversed = [...lines].reverse();
  const hasBalances = lines.filter((l) => l.balance != null).length >= 2;
  const newestFirst = hasBalances && balanceFits(reversed) !== balanceFits(lines)
    ? balanceFits(reversed) > balanceFits(lines)
    : lines.length > 1 && lines[0].date > lines[lines.length - 1].date;
  if (newestFirst) lines = reversed;
  lines = lines.map((l, i) => ({ l, i })).sort((x, y) => x.l.date.localeCompare(y.l.date) || x.i - y.i).map((x) => x.l);

  let { opening, closing, start, end } = s;
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (opening === null && first?.balance != null) opening = sum([first.balance, -first.amount]);
  if (closing === null && last?.balance != null) closing = last.balance;
  if (!start && first) start = first.date;
  if (!end && last) end = last.date;
  return { ...s, start, end, opening, closing, transactions: lines };
}

/** Lines whose amount doesn't take the previous balance to the bank's printed balance. */
export function runningBalanceMisses(a: Accounting, s: Statement): string[] {
  const misses: string[] = [];
  let prev = s.opening;
  for (const t of a.transactions) {
    if (t.statementId !== s.id) continue;
    if (t.balance === undefined) {
      prev = prev === null ? null : sum([prev, t.amount]);
      continue;
    }
    if (prev !== null && !same(sum([prev, t.amount]), t.balance)) misses.push(t.id);
    prev = t.balance;
  }
  return misses;
}

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Finds the account a statement belongs to by its last four digits (or name), adding one if it's new. */
export function accountFor(a: Accounting, s: Pick<ImportedStatement, "institution" | "accountName" | "last4">): BankAccount {
  const last4 = s.last4.replace(/\D/g, "").slice(-4);
  const found =
    (last4 && a.accounts.find((x) => x.last4 === last4)) ||
    (!last4 && s.accountName && a.accounts.find((x) => x.name.toLowerCase() === s.accountName.toLowerCase()));
  if (found) {
    if (!found.institution && s.institution) found.institution = s.institution;
    return found;
  }
  const account: BankAccount = {
    id: newId("acct"),
    name: s.accountName || (s.institution ? `${s.institution} account` : "Bank account"),
    institution: s.institution || undefined,
    last4: last4 || undefined,
    begin: null,
  };
  a.accounts.push(account);
  return account;
}

/** Adds a statement and its lines to the accounting. */
export function addStatement(a: Accounting, s: ImportedStatement, fileName: string, accountId?: string): Statement {
  s = normalizeImported(s);
  const account = accountId ? a.accounts.find((x) => x.id === accountId)! : accountFor(a, s);
  const statement: Statement = { id: newId("stmt"), accountId: account.id, fileName, start: s.start, end: s.end, opening: s.opening, closing: s.closing };
  a.statements.push(statement);
  for (const t of s.transactions) {
    a.transactions.push({
      id: newId("txn"),
      accountId: account.id,
      statementId: statement.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      ...(t.checkNumber ? { checkNumber: t.checkNumber } : {}),
      ...(t.doubt ? { doubt: t.doubt } : {}),
      ...(t.balance != null ? { balance: t.balance } : {}),
    });
  }
  matchChecks(a);
  return statement;
}

export function removeStatement(a: Accounting, statementId: string): void {
  a.statements = a.statements.filter((s) => s.id !== statementId);
  a.transactions = a.transactions.filter((t) => t.statementId !== statementId);
  matchChecks(a);
}

/** Transactions in date order, newest statement lines last. */
export function sortedTxns(a: Accounting): Txn[] {
  return byDate(a.transactions);
}

/** An accounting loaded from storage or a file, with anything missing filled in. */
export function normalizeAccounting(raw: unknown): Accounting {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Accounting>;
  const base = blankAccounting(typeof r.id === "string" && r.id ? r.id : newId("acctg"));
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    ...base,
    name: typeof r.name === "string" ? r.name : base.name,
    details: { ...base.details, ...(r.details && typeof r.details === "object" ? r.details : {}) },
    useCategories: r.useCategories === true,
    accounts: list<BankAccount>(r.accounts).map((x) => ({ ...x, begin: num(x.begin) })),
    statements: list<Statement>(r.statements).map((x) => ({ ...x, opening: num(x.opening), closing: num(x.closing) })),
    transactions: list<Txn>(r.transactions).filter((t) => typeof t.amount === "number" && typeof t.date === "string"),
    checks: list<CheckCopy>(r.checks).map((x) => ({ ...x, amount: num(x.amount) })),
    assets: list<HeldAsset>(r.assets).map((x) => ({ ...x, begin: num(x.begin), end: num(x.end) })),
    categories: Array.isArray(r.categories) ? (r.categories as Category[]) : base.categories,
    rules: typeof r.rules === "string" ? r.rules : "",
    attachments: list<Attachment>(r.attachments).filter((x) => typeof x.id === "string" && typeof x.name === "string").map((x) => ({ ...x, pages: num(x.pages) ?? 0, size: num(x.size) ?? 0, include: x.include !== false })),
    packet: {
      separate: r.packet?.separate === true,
      maxPages: typeof r.packet?.maxPages === "number" && r.packet.maxPages > 0 ? Math.floor(r.packet.maxPages) : null,
    },
  };
}
