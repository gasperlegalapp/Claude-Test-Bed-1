// The accounting as an Excel workbook for review and filing: a summary with
// the recapitulation, schedules of receipts and disbursements, the bank
// reconciliation, and the items still open. Totals are formulas, so edits made
// in Excel keep adding up.

import {
  categoryOf,
  findings,
  periodTxns,
  statementComputedClosing,
  sum,
  summarize,
  TRANSFER,
  type Accounting,
  type Txn,
} from "./accounting.ts";
import { columnName, type Cell, type CellValue, type Sheet } from "./xlsx.ts";

const KIND_LABEL = { estate: "Estate of", guardianship: "Guardianship of", trust: "Trust:", other: "Matter:" } as const;

const money = (v: number | null): Cell => ({ v, style: "money" });
const date = (v: string): Cell => ({ v, style: "date" });
const header = (...labels: string[]): Cell[] => labels.map((v) => ({ v, style: "header" }));

/** A total row: a SUM over rows `from`..`to` (1-based) of column `col`, labelled in the first column. */
function totalRow(width: number, col: number, from: number, to: number, value: number, label = "Total"): Cell[] {
  const row: Cell[] = Array.from({ length: width }, () => ({ v: null }));
  row[0] = { v: label, style: "bold" };
  const c = columnName(col);
  row[col] = { v: value, f: to >= from ? `SUM(${c}${from}:${c}${to})` : undefined, style: "total" };
  return row;
}

function accountLabel(a: Accounting, id: string): string {
  const acct = a.accounts.find((x) => x.id === id);
  if (!acct) return "";
  return [acct.institution, acct.name, acct.last4 ? `…${acct.last4}` : ""].filter(Boolean).join(" ");
}

function described(t: Txn): string {
  return [t.description, t.memo ? `Memo: ${t.memo}` : ""].filter(Boolean).join(" · ");
}

export function accountingWorkbook(a: Accounting): Sheet[] {
  const s = summarize(a);
  const txns = periodTxns(a).sort((x, y) => x.date.localeCompare(y.date));
  const d = a.details;

  // Receipts
  const receipts = txns.filter((t) => categoryOf(a, t)?.flow === "receipt");
  const receiptRows: (Cell | CellValue)[][] = [
    header("Date", "Description", "Category", "Account", "Amount"),
    ...receipts.map((t) => [date(t.date), described(t), categoryOf(a, t)!.label, accountLabel(a, t.accountId), money(t.amount)]),
  ];
  receiptRows.push(totalRow(5, 4, 2, receiptRows.length, s.receipts, "Total receipts"));

  // Disbursements, shown as amounts paid out.
  const disbursements = txns.filter((t) => categoryOf(a, t)?.flow === "disbursement");
  const disbursementRows: (Cell | CellValue)[][] = [
    header("Date", "Paid to", "Description", "Check #", "Category", "Voucher", "Court approval", "Account", "Amount"),
    ...disbursements.map((t) => [
      date(t.date),
      t.payee ?? "",
      described(t),
      t.checkNumber ?? "",
      categoryOf(a, t)!.label,
      t.voucher ?? "",
      t.approvedOn ? date(t.approvedOn) : "",
      accountLabel(a, t.accountId),
      money(-t.amount),
    ]),
  ];
  disbursementRows.push(totalRow(9, 8, 2, disbursementRows.length, s.disbursements, "Total disbursements"));

  // Transfers between the fiduciary's own accounts.
  const transfers = txns.filter((t) => t.category === TRANSFER);
  const transferRows: (Cell | CellValue)[][] = [header("Date", "Description", "Account", "Amount"), ...transfers.map((t) => [date(t.date), described(t), accountLabel(a, t.accountId), money(t.amount)])];
  transferRows.push(totalRow(4, 3, 2, transferRows.length, s.transfersNet, "Net (should be $0.00)"));

  // Reconciliation, statement by statement.
  const reconRows: (Cell | CellValue)[][] = [header("Account", "Statement", "From", "To", "Opening", "Transactions", "Computed closing", "Statement closing", "Difference")];
  for (const acct of a.accounts) {
    for (const st of a.statements.filter((x) => x.accountId === acct.id).sort((x, y) => x.start.localeCompare(y.start))) {
      const net = sum(a.transactions.filter((t) => t.statementId === st.id).map((t) => t.amount));
      const computed = statementComputedClosing(a, st);
      const r = reconRows.length + 1;
      reconRows.push([
        accountLabel(a, acct.id),
        st.fileName,
        date(st.start),
        date(st.end),
        money(st.opening),
        money(net),
        { v: computed, f: st.opening === null ? undefined : `E${r}+F${r}`, style: "money" },
        money(st.closing),
        { v: computed === null || st.closing === null ? null : sum([st.closing, -computed]), f: st.opening === null || st.closing === null ? undefined : `H${r}-G${r}`, style: "money" },
      ]);
    }
  }

  // Summary, with the recapitulation as formulas over its own lines.
  const sum1: (Cell | CellValue)[][] = [
    [{ v: d.title || "Fiduciary's Account", style: "title" }],
    [d.court],
    [`${KIND_LABEL[d.kind]} ${d.subject}`.trim()],
    [{ v: "Case number", style: "muted" }, d.caseNumber],
    [{ v: "Fiduciary", style: "muted" }, d.fiduciary],
    [{ v: "Period", style: "muted" }, d.periodStart && d.periodEnd ? `${fmt(d.periodStart)} to ${fmt(d.periodEnd)}` : ""],
    [],
    header("Recapitulation", "Amount"),
  ];
  const at = () => sum1.length + 1;
  const beginRow = at();
  sum1.push(["Cash on hand at the start of the period", money(s.beginCash)]);
  const receiptsRow = at();
  sum1.push(["Plus receipts", money(s.receipts)]);
  const disbRow = at();
  sum1.push(["Less disbursements", money(s.disbursements)]);
  const transferRow = at();
  const transfersOff = s.transfersNet !== 0;
  if (transfersOff) sum1.push(["Transfers that don't net to zero", money(s.transfersNet)]);
  sum1.push([{ v: "Cash on hand at the end of the period", style: "bold" }, { v: s.endCash, f: `B${beginRow}+B${receiptsRow}-B${disbRow}${transfersOff ? `+B${transferRow}` : ""}`, style: "total" }]);
  sum1.push([]);

  sum1.push(header("Receipts by category", "Amount"));
  const rFrom = at();
  for (const c of s.receiptsByCategory) sum1.push([`${c.label} (${c.count})`, money(c.total)]);
  sum1.push(totalRow(2, 1, rFrom, at() - 1, s.receipts));
  sum1.push([]);
  sum1.push(header("Disbursements by category", "Amount"));
  const dFrom = at();
  for (const c of s.disbursementsByCategory) sum1.push([`${c.label} (${c.count})`, money(c.total)]);
  sum1.push(totalRow(2, 1, dFrom, at() - 1, s.disbursements));
  sum1.push([]);

  sum1.push(header("Assets remaining in the fiduciary's hands", "Value"));
  const hFrom = at();
  for (const line of s.accounts) sum1.push([accountLabel(a, line.account.id), money(line.end)]);
  for (const asset of a.assets) sum1.push([asset.description, money(asset.end)]);
  sum1.push(totalRow(2, 1, hFrom, at() - 1, s.held));

  const open = findings(a);
  const openRows: (Cell | CellValue)[][] = open.length
    ? [header("Level", "Item", "Detail"), ...open.map((f) => [f.level === "error" ? "Must fix" : "Check", f.title, { v: f.detail, style: "wrap" as const }])]
    : [["Nothing open: the accounting balances and every item is resolved."]];

  return [
    { name: "Summary", cols: [52, 18], rows: sum1 },
    { name: "Receipts", cols: [12, 60, 30, 34, 14], rows: receiptRows, freezeRows: 1 },
    { name: "Disbursements", cols: [12, 30, 50, 9, 28, 10, 14, 34, 14], rows: disbursementRows, freezeRows: 1 },
    { name: "Transfers", cols: [12, 60, 34, 14], rows: transferRows, freezeRows: 1 },
    { name: "Reconciliation", cols: [34, 28, 12, 12, 14, 14, 16, 16, 12], rows: reconRows, freezeRows: 1 },
    { name: "Open items", cols: [10, 50, 90], rows: openRows, freezeRows: 1 },
  ];
}

function fmt(iso: string): string {
  const [y, m, day] = iso.split("-");
  return `${m}/${day}/${y}`;
}
