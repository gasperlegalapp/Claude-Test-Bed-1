// Reading bank records with Claude: statements, check copies, and a prior
// account or inventory, plus suggested categories for transactions.
//
// Claude only reads and suggests. Whether anything balances is decided by
// plain arithmetic in engine/accounting.ts, and a statement whose lines don't
// add up to its closing balance is sent back once to be re-read.
//
// As with workflow drafting, the browser calls the API directly in this
// prototype. Statements hold client financial data, so inside the case
// management app these calls belong on the server, under the firm's own API
// account.

import Anthropic from "@anthropic-ai/sdk";
import { normalizeImported, same, sum, type Category, type ImportedStatement } from "../engine/accounting.ts";
import { bytesToBase64 } from "../engine/docx.ts";
import { readXlsxText } from "../engine/xlsx.ts";

const MODEL = "claude-opus-5-5";

const str = { type: "string" };
const num = { type: "number" };
const numOrNull = { anyOf: [{ type: "number" }, { type: "null" }] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items: unknown) => ({ type: "array", items });

export const STATEMENT_SCHEMA = obj({
  statements: list(
    obj({
      institution: str,
      account_name: str,
      account_last4: str,
      period_start: str,
      period_end: str,
      opening_balance: numOrNull,
      closing_balance: numOrNull,
      transactions: list(obj({ date: str, description: str, amount: num, check_number: str, balance: numOrNull, doubt: str })),
    }),
  ),
  notes: str,
});

export const CHECKS_SCHEMA = obj({
  checks: list(obj({ check_number: str, date: str, payee: str, amount: numOrNull, memo: str, doubt: str })),
  notes: str,
});

export const PRIOR_SCHEMA = obj({
  period_end: str,
  accounts: list(obj({ institution: str, name: str, last4: str, balance: numOrNull })),
  other_assets: list(obj({ description: str, value: numOrNull })),
  notes: str,
});

export function categorizeSchema(categoryIds: string[]) {
  return obj({
    results: list(obj({ id: str, category: { type: "string", enum: [...categoryIds, "transfer", "unsure"] }, payee: str, description: str, reason: str })),
  });
}

const STATEMENT_PROMPT = `You read bank records for a law firm preparing court accountings for estates, guardianships and trusts: monthly statements, or transaction histories printed from online banking. A lawyer checks every line against the record afterwards, so copy exactly what is printed. Never guess or invent a transaction or amount.

- Add one entry to "statements" per account per statement period in the file. A combined statement can hold several accounts. A printed transaction history is one entry covering the dates it shows.
- The pages are often scans with handwritten tick marks, slashes or initials beside the lines. Ignore them; they are the firm's review marks, not part of the record.
- institution: the bank's name. account_name: the account's name or type as printed (e.g. "Estate Checking"). account_last4: the last four digits of the account number, or "".
- period_start, period_end: the statement period, as YYYY-MM-DD. For a transaction history, the date range it was printed for if shown, otherwise its first and last transaction dates.
- opening_balance, closing_balance: the beginning and ending balances as printed, or null if not printed (a transaction history usually prints none; they are worked out from the running balance).
- transactions: every deposit, withdrawal, check, fee, interest payment and transfer, in the order printed (newest first is fine if that's how it is printed). A history split over several pages is one list. Leave out daily-balance tables, running-balance figures, totals and summary sections: they would count the same money twice.
- amount: positive for money in (deposits, credits, interest), negative for money out (checks, withdrawals, debits, fees).
- date: YYYY-MM-DD, taking the year from the statement period (watch periods that cross a new year).
- description: the line as printed, on one line, including payee, merchant and reference text.
- check_number: the digits of the check number for checks (e.g. "SUBSTITUTE CHECK Check 2102" → "2102"), otherwise "".
- balance: the running balance printed on the line after this transaction, or null if the record shows none for it.
- doubt: "" when the line is clear. Otherwise say briefly what is uncertain, e.g. "amount partly illegible".
- For investment accounts, report only the cash or money-market activity and its balances, and say in notes that holdings were left out.
- notes: anything the lawyer should know, such as missing pages or unreadable sections, or "".`;

const CHECKS_PROMPT = `You read copies of checks for a law firm preparing court accountings. A lawyer checks your work, so copy exactly what is written and never guess.

- Add one entry to "checks" per check in the file. Bank image pages often hold several checks; include each one.
- check_number: digits only, or "" if not visible.
- date: the date written on the check, as YYYY-MM-DD, or "".
- payee: the "Pay to the order of" name.
- amount: the amount of the check. If the written and numeric amounts disagree, use the written amount and explain in doubt. null if unreadable.
- memo: the memo line, or "".
- doubt: "" when everything is clear; otherwise what is uncertain.
- notes: anything else the lawyer should know, or "".`;

const PRIOR_PROMPT = `You read a prior court accounting or an inventory for a law firm preparing the next accounting. Report the position at the END of that document: what the fiduciary held when it was filed.

- period_end: the date the prior account ends, or the inventory's date, as YYYY-MM-DD, or "".
- accounts: each bank, savings, money-market or investment account remaining, with institution, name, the last four digits of the account number ("" if not shown), and the balance on hand at the end (null if not shown).
- other_assets: each other asset remaining (real estate, vehicles, personal property and the like) with the value shown, or null.
- notes: anything the lawyer should check, e.g. figures that were hard to read, or "".
Copy figures exactly; never estimate a value that isn't shown.`;

export interface FileInput {
  name: string;
  /** e.g. application/pdf, image/png, the xlsx type, text/csv. */
  type: string;
  bytes: Uint8Array;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** The file as a message content block Claude can read. */
export function fileBlock(file: FileInput): Anthropic.Beta.BetaContentBlockParam {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToBase64(file.bytes) }, title: file.name };
  }
  if (IMAGE_TYPES.includes(file.type)) {
    return { type: "image", source: { type: "base64", media_type: file.type as "image/png", data: bytesToBase64(file.bytes) } };
  }
  if (/\.xlsx$/i.test(file.name)) return { type: "text", text: `Spreadsheet "${file.name}", cell by cell:\n${readXlsxText(file.bytes)}` };
  return { type: "text", text: `File "${file.name}":\n${new TextDecoder().decode(file.bytes)}` };
}

async function ask<T>(
  client: Anthropic,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  schema: Record<string, unknown>,
  effort: "medium" | "high",
): Promise<{ data: T; response: Anthropic.Beta.BetaMessage }> {
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema } },
      system,
      messages,
    })
    .finalMessage();
  if (response.stop_reason === "refusal") throw new Error("Claude declined to read this file.");
  if (response.stop_reason === "max_tokens") throw new Error("This file has too many transactions to read at once. Split it into smaller files (e.g. a few months each).");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { data: JSON.parse(text) as T, response };
  } catch {
    throw new Error("Claude's reply wasn't valid JSON. Please try again.");
  }
}

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

type RawStatement = {
  institution: string;
  account_name: string;
  account_last4: string;
  period_start: string;
  period_end: string;
  opening_balance: number | null;
  closing_balance: number | null;
  transactions: { date: string; description: string; amount: number; check_number: string; balance: number | null; doubt: string }[];
};

function toStatement(s: RawStatement): ImportedStatement {
  return {
    institution: s.institution,
    accountName: s.account_name,
    last4: s.account_last4,
    start: s.period_start,
    end: s.period_end,
    opening: s.opening_balance,
    closing: s.closing_balance,
    transactions: s.transactions.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      ...(t.check_number ? { checkNumber: t.check_number } : {}),
      ...(t.doubt ? { doubt: t.doubt } : {}),
      balance: t.balance,
    })),
  };
}

/** Statements whose lines don't add up from the opening to the closing balance. */
export function unbalanced(statements: RawStatement[]): string[] {
  return statements.flatMap((raw) => {
    const s = normalizeImported(toStatement(raw));
    const name = `${raw.account_name || "account"}${raw.account_last4 ? ` ending ${raw.account_last4}` : ""}, ${s.start} to ${s.end}`;
    const problems: string[] = [];
    if (s.opening !== null && s.closing !== null) {
      const computed = sum([s.opening, ...s.transactions.map((t) => t.amount)]);
      if (!same(computed, s.closing)) problems.push(`${name}: the opening balance ${s.opening.toFixed(2)} plus your transactions comes to ${computed.toFixed(2)}, but the closing balance is ${s.closing.toFixed(2)} (off by ${sum([s.closing, -computed]).toFixed(2)}).`);
    }
    let prev = s.opening;
    for (const t of s.transactions) {
      if (t.balance == null) {
        prev = prev === null ? null : sum([prev, t.amount]);
        continue;
      }
      if (prev !== null && !same(sum([prev, t.amount]), t.balance)) problems.push(`${name}: the line "${t.description}" on ${t.date} for ${t.amount.toFixed(2)} doesn't take the balance from ${prev.toFixed(2)} to the printed ${t.balance.toFixed(2)}.`);
      prev = t.balance;
    }
    return problems;
  });
}

export async function readStatements(opts: { apiKey: string; file: FileInput; onStatus?: (s: string) => void }): Promise<{ statements: ImportedStatement[]; notes: string }> {
  const c = client(opts.apiKey);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: [fileBlock(opts.file), { type: "text", text: "Read every statement in this file." }] }];
  opts.onStatus?.(`Reading ${opts.file.name}…`);
  let { data, response } = await ask<{ statements: RawStatement[]; notes: string }>(c, STATEMENT_PROMPT, messages, STATEMENT_SCHEMA, "high");
  const off = unbalanced(data.statements);
  if (off.length) {
    opts.onStatus?.(`Re-checking ${opts.file.name}: it didn't balance…`);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `These statements don't balance:\n${off.map((o) => `- ${o}`).join("\n")}\nRe-read them line by line. Look for a missing, doubled or misread line, or a wrong sign, and return all statements in full again. If they still can't balance, say why in notes.`,
    });
    ({ data, response } = await ask<{ statements: RawStatement[]; notes: string }>(c, STATEMENT_PROMPT, messages, STATEMENT_SCHEMA, "high"));
  }
  return { statements: data.statements.map(toStatement), notes: data.notes };
}

export interface ReadCheck {
  number: string;
  date: string;
  payee: string;
  amount: number | null;
  memo: string;
  doubt: string;
}

export async function readChecks(opts: { apiKey: string; file: FileInput }): Promise<{ checks: ReadCheck[]; notes: string }> {
  const { data } = await ask<{ checks: { check_number: string; date: string; payee: string; amount: number | null; memo: string; doubt: string }[]; notes: string }>(
    client(opts.apiKey),
    CHECKS_PROMPT,
    [{ role: "user", content: [fileBlock(opts.file), { type: "text", text: "Read every check in this file." }] }],
    CHECKS_SCHEMA,
    "high",
  );
  return { checks: data.checks.map((x) => ({ number: x.check_number, date: x.date, payee: x.payee, amount: x.amount, memo: x.memo, doubt: x.doubt })), notes: data.notes };
}

export interface PriorAccount {
  periodEnd: string;
  accounts: { institution: string; name: string; last4: string; balance: number | null }[];
  assets: { description: string; value: number | null }[];
  notes: string;
}

export async function readPriorAccount(opts: { apiKey: string; file: FileInput }): Promise<PriorAccount> {
  const { data } = await ask<{ period_end: string; accounts: PriorAccount["accounts"]; other_assets: PriorAccount["assets"]; notes: string }>(
    client(opts.apiKey),
    PRIOR_PROMPT,
    [{ role: "user", content: [fileBlock(opts.file), { type: "text", text: "What did the fiduciary hold at the end of this document?" }] }],
    PRIOR_SCHEMA,
    "high",
  );
  return { periodEnd: data.period_end, accounts: data.accounts, assets: data.other_assets, notes: data.notes };
}

export interface CategorizeInput {
  id: string;
  date: string;
  description: string;
  amount: number;
  payee?: string;
  memo?: string;
}

export interface Suggestion {
  /** A category id, "transfer", or "" when categories aren't used or Claude wasn't sure. */
  category: string;
  /** Clean payee or source as it should read on the account, e.g. "SSA Direct Deposit". */
  payee: string;
  /** Short description such as "rent", or "". */
  description: string;
  reason: string;
}

/** Suggested payees, descriptions and (when used) categories, by transaction id. */
export async function suggestEntries(opts: {
  apiKey: string;
  txns: CategorizeInput[];
  /** Empty when the accounting lists entries by date without categories. */
  categories: Category[];
  accounts: { name: string; last4?: string }[];
  rules: string;
  onStatus?: (s: string) => void;
}): Promise<Map<string, Suggestion>> {
  const c = client(opts.apiKey);
  const categoryPart = opts.categories.length
    ? `Categories (id: label, and whether it is money in or out):
${opts.categories.map((x) => `- ${x.id}: ${x.label} (${x.flow})`).join("\n")}
Use "unsure" when the record doesn't make the category clear; never guess.`
    : `This accounting doesn't use categories: set category to "unsure" unless the line is a transfer.`;
  const system = `You prepare entries for a court accounting from a fiduciary's bank records. Each transaction becomes a line with a payee and a short description. A lawyer reviews every suggestion.

- payee: who was paid, or where money came from, written cleanly as it should read on the account: "SSA Direct Deposit", "Example Gas Co", "Prepaid card transfer". Use the check payee when given. Don't copy bank codes, reference numbers or "SUBSTITUTE CHECK".
- description: a word or two on what it was for when it's clear (e.g. "rent", "bond"), otherwise "".
- category: ${categoryPart}
- "transfer" is only for money moved between the fiduciary's own accounts in this accounting: ${opts.accounts.map((a) => `${a.name}${a.last4 ? ` (ending ${a.last4})` : ""}`).join("; ") || "(none listed)"}. Money to a card or account outside this list is a disbursement, not a transfer.
- reason: a few words.
Positive amounts are money in, negative are money out. Give one result per transaction id.${opts.rules.trim() ? `\n\nThe firm's rules, which take priority:\n${opts.rules.trim()}` : ""}`;
  const out = new Map<string, Suggestion>();
  const batch = 150;
  for (let i = 0; i < opts.txns.length; i += batch) {
    const part = opts.txns.slice(i, i + batch);
    if (opts.txns.length > batch) opts.onStatus?.(`Sorting transactions ${i + 1}–${i + part.length} of ${opts.txns.length}…`);
    const { data } = await ask<{ results: { id: string; category: string; payee: string; description: string; reason: string }[] }>(
      c,
      system,
      [{ role: "user", content: JSON.stringify(part) }],
      categorizeSchema(opts.categories.map((x) => x.id)),
      "medium",
    );
    const ids = new Set(part.map((t) => t.id));
    for (const r of data.results) {
      if (!ids.has(r.id)) continue;
      out.set(r.id, { category: r.category === "unsure" ? "" : r.category, payee: r.payee.trim(), description: r.description.trim(), reason: r.reason });
    }
  }
  return out;
}
