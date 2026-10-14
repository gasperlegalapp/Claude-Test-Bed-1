// A made-up estate accounting for trying the accounting tools. Every name,
// number and account here is fictional. It balances, but leaves a few things
// open on purpose (an uncategorized deposit, a check without a copy, fees
// without a court entry) so the review steps have something to show.

import { DEFAULT_CATEGORIES, type Accounting, type Txn } from "../engine/accounting.ts";

type Line = [date: string, description: string, amount: number, category?: string, checkNumber?: string];

function lines(prefix: string, accountId: string, statementId: string, rows: Line[]): Txn[] {
  return rows.map(([date, description, amount, category, checkNumber], i) => ({
    id: `${prefix}${i + 1}`,
    accountId,
    statementId,
    date,
    description,
    amount,
    ...(category ? { category } : {}),
    ...(checkNumber ? { checkNumber } : {}),
  }));
}

export const SAMPLE_ACCOUNTING: Accounting = {
  id: "sample_estate",
  name: "Estate of Jane Q. Sample (sample)",
  details: {
    court: "Probate Court",
    caseNumber: "2026 EST 000000",
    kind: "estate",
    subject: "Jane Q. Sample",
    fiduciary: "John Sample, Executor",
    judge: "",
    title: "First Partial",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    priorFiledOn: "",
    fiduciaryAddress: "1 Example Way",
    fiduciaryCity: "Columbus, OH 43215",
    fiduciaryPhone: "(555) 010-0101",
    attorneyName: "Avery Example",
    attorneyAddress: "100 Example Avenue, Suite 1",
    attorneyCity: "Columbus, OH 43215",
    attorneyPhone: "(555) 010-0100",
    attorneyRegistration: "0000000",
  },
  useCategories: true,
  accounts: [
    { id: "chk", name: "Estate checking", institution: "Example Community Bank", last4: "1111", begin: 12500 },
    { id: "sav", name: "Estate savings", institution: "Example Community Bank", last4: "2222", begin: null },
  ],
  statements: [
    { id: "chk_jan", accountId: "chk", fileName: "checking-2026-01.pdf", start: "2026-01-01", end: "2026-01-31", opening: 12500, closing: 14024.4 },
    { id: "chk_feb", accountId: "chk", fileName: "checking-2026-02.pdf", start: "2026-02-01", end: "2026-02-28", opening: 14024.4, closing: 12185.56 },
    { id: "chk_mar", accountId: "chk", fileName: "checking-2026-03.pdf", start: "2026-03-01", end: "2026-03-31", opening: 12185.56, closing: 10694.68 },
    { id: "sav_q1", accountId: "sav", fileName: "savings-2026-q1.pdf", start: "2026-01-01", end: "2026-03-31", opening: 20000, closing: 25054.41 },
  ],
  transactions: [
    ...lines("j", "chk", "chk_jan", [
      ["2026-01-05", "DEPOSIT REFUND EXAMPLE GAS CO", 86.4, "refunds"],
      ["2026-01-08", "CHECK 101", -350, "court_costs", "101"],
      ["2026-01-12", "DEPOSIT EXAMPLE BROKERAGE REDEMPTION", 8000, "asset_sale"],
      ["2026-01-20", "CHECK 102", -1200, "other_disbursements", "102"],
      ["2026-01-28", "ONLINE TRANSFER TO SAVINGS XXXX2222", -5000, "transfer"],
      ["2026-01-31", "MONTHLY SERVICE FEE", -12, "bank_fees"],
    ]),
    ...lines("f", "chk", "chk_feb", [
      ["2026-02-03", "DEPOSIT EXAMPLE FUNDS DIVIDEND", 215.33, "income"],
      ["2026-02-10", "CHECK 103", -2500, "attorney_fees", "103"],
      ["2026-02-15", "EXAMPLE ELECTRIC AUTOPAY", -142.17, "housing"],
      ["2026-02-22", "MOBILE DEPOSIT", 600],
      ["2026-02-28", "MONTHLY SERVICE FEE", -12, "bank_fees"],
    ]),
    ...lines("m", "chk", "chk_mar", [
      ["2026-03-05", "CHECK 104", -480, "taxes", "104"],
      ["2026-03-16", "CHECK 105", -1000, "distributions", "105"],
      ["2026-03-31", "INTEREST PAID", 1.12, "income"],
      ["2026-03-31", "MONTHLY SERVICE FEE", -12, "bank_fees"],
    ]),
    ...lines("s", "sav", "sav_q1", [
      ["2026-01-28", "ONLINE TRANSFER FROM CHECKING XXXX1111", 5000, "transfer"],
      ["2026-01-31", "INTEREST PAID", 16.44, "income"],
      ["2026-02-28", "INTEREST PAID", 18.02, "income"],
      ["2026-03-31", "INTEREST PAID", 19.95, "income"],
    ]),
  ],
  checks: [
    { id: "c101", fileName: "checks.pdf", number: "101", date: "2026-01-06", payee: "Probate Court Clerk", amount: 350, memo: "Filing fee", txnId: "j2" },
    { id: "c103", fileName: "checks.pdf", number: "103", date: "2026-02-09", payee: "Example Law LLC", amount: 2500, memo: "Legal services, January", txnId: "f2" },
    { id: "c104", fileName: "checks.pdf", number: "104", date: "2026-03-02", payee: "County Treasurer", amount: 480, memo: "First-half real estate tax", txnId: "m1" },
    { id: "c105", fileName: "checks.pdf", number: "105", date: "2026-03-14", payee: "Mary Sample", amount: 1000, memo: "Partial distribution", txnId: "m2" },
  ],
  assets: [
    { id: "house", description: "Residence, 123 Example Street", begin: 185000, end: 185000 },
    { id: "car", description: "2014 sedan", begin: 6500, end: 6500 },
  ],
  categories: structuredClone(DEFAULT_CATEGORIES),
  rules: "Deposits from the brokerage are sales of estate assets.\nUtility, insurance and upkeep for the residence go under Housing and utilities.",
};

for (const c of SAMPLE_ACCOUNTING.checks) {
  const t = SAMPLE_ACCOUNTING.transactions.find((x) => x.id === c.txnId)!;
  t.payee = c.payee;
  t.memo = c.memo;
}

// A made-up guardianship account laid out like a typical Franklin County
// guardian's account: one checking account, read from an online-banking
// history with running balances, listed by date without categories.
type GLine = [date: string, bankText: string, amount: number, payee?: string, purpose?: string, checkNumber?: string];

const G_LINES: GLine[] = [
  ["2026-01-02", "SSA TREAS 310 XXSOC SEC", 1050, "SSA Direct Deposit"],
  ["2026-01-02", "Prepaid Card Transfer", -200, "Prepaid card transfer"],
  ["2026-01-05", "SUBSTITUTE CHECK Check 2101", -300, "Example Housing", "rent", "2101"],
  ["2026-01-05", "Prepaid Card Account Fee", -12, "Prepaid card account fee"],
  ["2026-01-09", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
  ["2026-01-14", "SUBSTITUTE CHECK Check 2102", -84.16, "Example Gas Co", "", "2102"],
  ["2026-01-16", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
  ["2026-01-21", "SUBSTITUTE CHECK Check 2103", -97.4, "Example Electric", "", "2103"],
  ["2026-01-23", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
  ["2026-01-30", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
  ["2026-02-03", "SSA TREAS 310 XXSOC SEC", 1050, "SSA Direct Deposit"],
  ["2026-02-03", "Prepaid Card Transfer", -200, "Prepaid card transfer"],
  ["2026-02-04", "SUBSTITUTE CHECK Check 2104", -300, "Example Housing", "rent", "2104"],
  ["2026-02-04", "Prepaid Card Account Fee", -12, "Prepaid card account fee"],
  ["2026-02-10", "SUBSTITUTE CHECK Check 2105", -100, "Example Surety Co", "bond", "2105"],
  ["2026-02-13", "Prepaid Card Transfer", -35],
  ["2026-02-17", "SUBSTITUTE CHECK Check 2106", -91.22, "Example Gas Co", "", "2106"],
  ["2026-02-20", "Prepaid Card Transfer", -35],
  ["2026-02-24", "SUBSTITUTE CHECK Check 2107", -88.9, "", "", "2107"],
  ["2026-02-27", "Prepaid Card Transfer", -35],
  ["2026-03-03", "SSA TREAS 310 XXSOC SEC", 1050, "SSA Direct Deposit"],
  ["2026-03-03", "Prepaid Card Transfer", -200, "Prepaid card transfer"],
  ["2026-03-04", "SUBSTITUTE CHECK Check 2108", -300, "Example Housing", "rent", "2108"],
  ["2026-03-04", "Prepaid Card Account Fee", -12, "Prepaid card account fee"],
  ["2026-03-13", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
  ["2026-03-17", "SUBSTITUTE CHECK Check 2109", -76.35, "Example Gas Co", "", "2109"],
  ["2026-03-20", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
  ["2026-03-24", "SUBSTITUTE CHECK Check 2110", -81.07, "Example Electric", "", "2110"],
  ["2026-03-27", "Prepaid Card Transfer", -35, "Prepaid card transfer"],
];

const G_OPENING = 1200;

function guardianshipLines(): Txn[] {
  let balance = G_OPENING;
  return G_LINES.map(([date, bankText, amount, payee, purpose, checkNumber], i) => {
    balance = Math.round((balance + amount) * 100) / 100;
    return {
      id: `g${i + 1}`,
      accountId: "gchk",
      statementId: "g_hist",
      date,
      description: bankText,
      amount,
      balance,
      ...(payee ? { payee } : {}),
      ...(purpose ? { purpose } : {}),
      ...(checkNumber ? { checkNumber } : {}),
      ...(i === 8 ? { doubt: "Amount partly covered by a review mark" } : {}),
    };
  });
}

const G_TXNS = guardianshipLines();

export const SAMPLE_GUARDIANSHIP: Accounting = {
  id: "sample_guardianship",
  name: "Guardianship of Alex Q. Sample (sample)",
  details: {
    court: "Probate Court of Franklin County, Ohio",
    caseNumber: "000000",
    kind: "guardianship",
    subject: "Alex Q. Sample",
    fiduciary: "Jordan Example",
    judge: "Example Judge",
    title: "Second Partial",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    priorFiledOn: "2026-01-20",
    fiduciaryAddress: "100 Example Avenue, Suite 1",
    fiduciaryCity: "Columbus, OH 43215",
    fiduciaryPhone: "(555) 010-0100",
    attorneyName: "Jordan Example",
    attorneyAddress: "100 Example Avenue, Suite 1",
    attorneyCity: "Columbus, OH 43215",
    attorneyPhone: "(555) 010-0100",
    attorneyRegistration: "0000000",
  },
  useCategories: false,
  accounts: [{ id: "gchk", name: "Grd Acct", institution: "Example Bank", last4: "4321", begin: G_OPENING }],
  statements: [
    { id: "g_hist", accountId: "gchk", fileName: "online-history-jan-mar.pdf", start: "2026-01-01", end: "2026-03-31", opening: G_OPENING, closing: G_TXNS[G_TXNS.length - 1].balance! },
  ],
  transactions: G_TXNS,
  checks: [
    ["2101", "2026-01-02", "Example Housing", 300, "January rent"],
    ["2102", "2026-01-10", "Example Gas Co", 84.16, "Acct ending 0001"],
    ["2103", "2026-01-17", "Example Electric", 97.4, ""],
    ["2104", "2026-02-01", "Example Housing", 300, "February rent"],
    ["2105", "2026-02-06", "Example Surety Co", 100, "Bond premium"],
    ["2106", "2026-02-12", "Example Gas Co", 91.22, ""],
    ["2108", "2026-03-01", "Example Housing", 300, "March rent"],
    ["2109", "2026-03-12", "Example Gas Co", 76.35, ""],
    ["2110", "2026-03-19", "Example Electric", 81.07, ""],
  ].map(([number, date, payee, amount, memo]) => ({
    id: `gc${number}`,
    fileName: "check-images.pdf",
    number: String(number),
    date: String(date),
    payee: String(payee),
    amount: Number(amount),
    memo: String(memo),
    txnId: G_TXNS.find((t) => t.checkNumber === number)!.id,
  })),
  assets: [],
  categories: structuredClone(DEFAULT_CATEGORIES),
  rules: "Transfers to the ward's prepaid card are disbursements, payee \"Prepaid card transfer\".\nSocial Security deposits: payee \"SSA Direct Deposit\".",
};
