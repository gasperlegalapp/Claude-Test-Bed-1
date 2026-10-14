import {
  addStatement,
  beginningBalance,
  findings,
  matchChecks,
  normalizeAccounting,
  normalizeImported,
  removeStatement,
  runningBalanceMisses,
  statementBalanceAtEnd,
  sum,
  summarize,
  type Accounting,
} from "../accounting.ts";
import { SAMPLE_ACCOUNTING } from "../../data/accountingSample.ts";

const sample = (): Accounting => structuredClone(SAMPLE_ACCOUNTING);
const titles = (a: Accounting) => findings(a).map((f) => `${f.level}: ${f.title}`);

describe("money", () => {
  it("adds in cents so sums don't drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(sum([14024.4, -2500, -142.17, 215.33, 600, -12])).toBe(12185.56);
  });
});

describe("summary", () => {
  it("balances the sample: beginning + receipts - disbursements = ending, and matches the bank", () => {
    const s = summarize(sample());
    expect(s.beginCash).toBe(32500);
    // Money in is a receipt and money out a disbursement, categorized or not; transfers are neither.
    expect(s.receipts).toBe(8957.26);
    expect(s.disbursements).toBe(5708.17);
    expect(s.transfersNet).toBe(0);
    expect(s.endCash).toBe(35749.09);
    expect(s.endCash).toBe(sum([s.beginCash, s.receipts, -s.disbursements]));
    for (const line of s.accounts) expect(line.end).toBe(line.bank);
    expect(s.held).toBe(sum([35749.09, 191500]));
  });

  it("totals by category, showing disbursements as amounts paid out", () => {
    const s = summarize(sample());
    expect(s.disbursementsByCategory.find((c) => c.id === "bank_fees")).toEqual({ id: "bank_fees", label: "Bank fees", total: 36, count: 3 });
    expect(s.receiptsByCategory.find((c) => c.id === "income")?.total).toBe(270.86);
    expect(s.receiptsByCategory.at(-1)).toEqual({ id: "", label: "Not categorized", total: 600, count: 1 });
  });

  it("skips category totals, and doesn't ask for categories, when the form just lists by date", () => {
    const a = sample();
    a.useCategories = false;
    expect(summarize(a).receiptsByCategory).toEqual([]);
    expect(titles(a)).not.toContain("error: 1 transaction without a category");
  });

  it("takes a missing beginning balance from the statement covering the first day", () => {
    const a = sample();
    a.details.periodStart = "2026-01-10";
    const sav = a.accounts.find((x) => x.id === "sav")!;
    expect(beginningBalance(a, sav)).toEqual({ amount: 20000, from: "statement" });
    const chk = { ...a.accounts.find((x) => x.id === "chk")!, begin: null };
    // Opening 12,500 plus the refund and check 101 before January 10.
    expect(beginningBalance(a, chk)).toEqual({ amount: 12236.4, from: "statement" });
  });

  it("reads the bank's balance at the period end from inside a statement", () => {
    const a = sample();
    a.details.periodEnd = "2026-03-20";
    const chk = a.accounts.find((x) => x.id === "chk")!;
    expect(statementBalanceAtEnd(a, chk)).toBe(sum([10694.68, -1.12, 12]));
  });
});

describe("findings", () => {
  it("lists only the open review items for the sample", () => {
    expect(titles(sample())).toEqual([
      "error: 1 transaction without a category",
      "warning: 1 payment without a court approval date",
      "warning: 1 check without a payee",
    ]);
  });

  it("catches a statement that doesn't balance, with the amount it's off by", () => {
    const a = sample();
    a.transactions = a.transactions.filter((t) => t.id !== "f3");
    const f = findings(a).find((x) => x.title.startsWith("Statement doesn't balance"))!;
    expect(f.level).toBe("error");
    expect(f.detail).toContain("$142.17 less");
    expect(titles(a)).toContain("error: Ending balance doesn't match the bank: Estate checking …1111");
  });

  it("catches balances that don't carry over, gaps and late statements", () => {
    const a = sample();
    a.statements.find((s) => s.id === "chk_feb")!.opening = 14000;
    removeStatement(a, "chk_mar");
    a.statements.push({ id: "chk_apr", accountId: "chk", fileName: "april.pdf", start: "2026-04-01", end: "2026-04-30", opening: 1, closing: 1 });
    const t = titles(a);
    expect(t).toContain("error: Balances don't carry over: Estate checking …1111");
    expect(t).toContain("warning: Missing statement: Estate checking …1111");
  });

  it("flags a beginning balance from the last account that the bank doesn't agree with", () => {
    const a = sample();
    a.accounts[0].begin = 12000;
    expect(titles(a)).toContain("error: Beginning balance doesn't match the bank: Estate checking …1111");
  });

  it("flags transfers with only one side", () => {
    const a = sample();
    a.transactions.find((t) => t.id === "s1")!.category = "other_receipts";
    expect(titles(a)).toContain("error: Transfers don't net to zero");
  });

  it("flags lines counted twice by overlapping statements", () => {
    const a = sample();
    addStatement(
      a,
      { institution: "", accountName: "", last4: "1111", start: "2026-01-31", end: "2026-01-31", opening: 14036.4, closing: 14024.4, transactions: [{ date: "2026-01-31", description: "Monthly service  fee", amount: -12 }] },
      "dup.pdf",
    );
    const t = titles(a);
    expect(t).toContain("warning: Possible duplicates");
    expect(t).toContain("warning: Statements overlap: Estate checking …1111");
  });

  it("flags lines the reader wasn't sure about until reviewed", () => {
    const a = sample();
    const t = a.transactions.find((x) => x.id === "j3")!;
    t.doubt = "Amount partly covered by a stamp";
    expect(titles(a)).toContain("warning: 1 line the reader wasn't sure about");
    t.reviewed = true;
    expect(titles(a)).not.toContain("warning: 1 line the reader wasn't sure about");
  });

  it("needs a period", () => {
    const a = sample();
    a.details.periodEnd = "";
    expect(titles(a)[0]).toBe("error: Accounting period not set");
  });
});

describe("imports", () => {
  it("files a statement under the account with the same last four digits, or adds the account", () => {
    const a = sample();
    addStatement(a, { institution: "Example Community Bank", accountName: "Checking", last4: "XXXX-1111", start: "2026-04-01", end: "2026-04-30", opening: 10694.68, closing: 10682.68, transactions: [{ date: "2026-04-30", description: "FEE", amount: -12 }] }, "apr.pdf");
    expect(a.accounts).toHaveLength(2);
    expect(a.statements.at(-1)!.accountId).toBe("chk");
    addStatement(a, { institution: "Other Bank", accountName: "CD", last4: "9999", start: "2026-01-01", end: "2026-03-31", opening: 5000, closing: 5000, transactions: [] }, "cd.pdf");
    expect(a.accounts.at(-1)).toMatchObject({ name: "CD", institution: "Other Bank", last4: "9999", begin: null });
  });

  it("matches check copies to statement lines by number and fills in the payee", () => {
    const a = sample();
    a.checks.push({ id: "c102", fileName: "more-checks.pdf", number: "0102", date: "2026-01-18", payee: "Example Funeral Home", amount: 1200, memo: "Services" });
    expect(matchChecks(a)).toBe(1);
    expect(a.transactions.find((t) => t.id === "j4")).toMatchObject({ payee: "Example Funeral Home", memo: "Services" });
    expect(titles(a)).not.toContain("warning: 1 check without a payee");
  });

  it("flags a check copy whose amount differs from what the bank paid", () => {
    const a = sample();
    a.checks.push({ id: "c102", fileName: "x.pdf", number: "102", date: "2026-01-18", payee: "X", amount: 1100, memo: "" });
    matchChecks(a);
    expect(titles(a)).toContain("error: Check #102 amount differs");
  });

  it("removing a statement removes its lines and unlinks its checks", () => {
    const a = sample();
    removeStatement(a, "chk_feb");
    expect(a.transactions.some((t) => t.statementId === "chk_feb")).toBe(false);
    expect(a.checks.find((c) => c.id === "c103")!.txnId).toBeUndefined();
    expect(titles(a)).toContain("warning: Check copy not matched: #103");
  });
});

describe("online banking histories", () => {
  // Newest first with a running balance and no opening or closing balance, as printed from online banking.
  const history = () => ({
    institution: "Example Bank",
    accountName: "Guardianship checking",
    last4: "4321",
    start: "",
    end: "",
    opening: null,
    closing: null,
    transactions: [
      { date: "2026-03-05", description: "Prepaid card transfer", amount: -20, balance: 980 },
      { date: "2026-03-04", description: "Prepaid card transfer", amount: -35, balance: 1000 },
      { date: "2026-03-04", description: "SUBSTITUTE CHECK Check 501", amount: -65, checkNumber: "501", balance: 1035 },
      { date: "2026-03-02", description: "SSA direct deposit", amount: 400, balance: 1100 },
    ],
  });

  it("puts lines in the order they happened, using the running balance for same-day lines", () => {
    const s = normalizeImported(history());
    expect(s.transactions.map((t) => t.amount)).toEqual([400, -65, -35, -20]);
    expect(s).toMatchObject({ start: "2026-03-02", end: "2026-03-05", opening: 700, closing: 980 });
  });

  it("points at the exact line whose amount doesn't fit the running balance", () => {
    const a = sample();
    const h = history();
    h.transactions[2].amount = -56;
    const st = addStatement(a, h, "history.pdf");
    const misread = a.transactions.find((t) => t.statementId === st.id && t.checkNumber === "501")!;
    expect(runningBalanceMisses(a, st)).toEqual([misread.id]);
    const f = findings(a).find((x) => x.title.includes("running balance"))!;
    expect(f).toMatchObject({ level: "error", title: "1 line off from the bank's running balance: history.pdf", txnIds: [misread.id] });
  });

  it("finds nothing wrong with a history read correctly", () => {
    const a = sample();
    const st = addStatement(a, history(), "history.pdf");
    expect(runningBalanceMisses(a, st)).toEqual([]);
    expect(a.statements.at(-1)).toMatchObject({ opening: 700, closing: 980 });
  });
});

describe("loading saved or imported accountings", () => {
  it("fills in what's missing and drops values of the wrong type", () => {
    const a = normalizeAccounting({
      name: "Imported",
      details: { subject: "Pat" },
      accounts: [{ id: "a1", name: "Checking", begin: "100" }],
      statements: [{ id: "s1", accountId: "a1", fileName: "x", start: "2026-01-01", end: "2026-01-31", opening: "12", closing: 20 }],
      transactions: [{ id: "t1", accountId: "a1", date: "2026-01-02", description: "ok", amount: 8 }, { id: "t2", date: "2026-01-03", amount: "8" }],
      assets: [{ id: "h", description: "House", begin: 1, end: "x" }],
    });
    expect(a.details).toMatchObject({ subject: "Pat", kind: "guardianship", periodStart: "" });
    expect(a.accounts[0].begin).toBeNull();
    expect(a.statements[0]).toMatchObject({ opening: null, closing: 20 });
    expect(a.transactions.map((t) => t.id)).toEqual(["t1"]);
    expect(a.assets[0]).toMatchObject({ begin: 1, end: null });
    expect(a.useCategories).toBe(false);
    expect(a.categories.length).toBeGreaterThan(5);
  });
});
