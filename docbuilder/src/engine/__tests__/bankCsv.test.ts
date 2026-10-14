import { detectColumns, parseAmount, parseCsv, parseDate, readBankCsv } from "../bankCsv.ts";

describe("bank CSV", () => {
  it("parses quoted cells, doubled quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });

  it("reads amounts and dates in the usual bank formats", () => {
    expect(["$1,234.56", "(12.00)", "-12.00", "12.00 DR", "+5", "45.10 CR", "", "n/a"].map(parseAmount)).toEqual([1234.56, -12, -12, -12, 5, 45.1, null, null]);
    expect(["01/31/2026", "1/5/26", "2026-01-31", "01-31-2026", "13/01/2026", "Jan 5"].map(parseDate)).toEqual(["2026-01-31", "2026-01-05", "2026-01-31", "2026-01-31", null, null]);
  });

  it("recognizes columns by heading", () => {
    expect(detectColumns(["Posting Date", "Description", "Amount", "Type", "Balance", "Check or Slip #"])).toEqual({ date: 0, description: 1, amount: 2, debit: undefined, credit: undefined, check: 5, balance: 4 });
    expect(detectColumns(["Date", "Payee", "Withdrawals", "Deposits"])).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    expect(detectColumns(["Account", "Owner"])).toBeNull();
  });

  it("reads a newest-first file with a running balance into a checked statement", () => {
    const csv = [
      "Account: Estate Checking XXXX1111",
      "",
      "Posting Date,Description,Amount,Balance,Check or Slip #",
      '01/31/2026,MONTHLY SERVICE FEE,-12.00,"14,024.40",',
      '01/20/2026,CHECK,"-1,200.00","14,036.40",102',
      '01/12/2026,DEPOSIT BROKERAGE,"8,000.00","15,236.40",',
      "01/08/2026,CHECK 101,-350.00,\"7,236.40\",",
      '01/05/2026,DEPOSIT REFUND,86.40,"7,586.40",',
    ].join("\n");
    const { statement, warnings } = readBankCsv(csv);
    expect(warnings).toEqual([]);
    expect(statement).toMatchObject({ start: "2026-01-05", end: "2026-01-31", opening: 7500, closing: 14024.4 });
    expect(statement.transactions.map((t) => [t.date, t.amount, t.checkNumber])).toEqual([
      ["2026-01-05", 86.4, undefined],
      ["2026-01-08", -350, "101"],
      ["2026-01-12", 8000, undefined],
      ["2026-01-20", -1200, "102"],
      ["2026-01-31", -12, undefined],
    ]);
  });

  it("reads separate withdrawal and deposit columns, and asks for balances when there are none", () => {
    const { statement, warnings } = readBankCsv("Date,Payee,Withdrawals,Deposits\n2026-02-03,Dividend,,215.33\n2026-02-15,Electric,142.17,\nnot a row,,,\n");
    expect(statement.transactions.map((t) => t.amount)).toEqual([215.33, -142.17]);
    expect(statement.opening).toBeNull();
    expect(warnings).toEqual(["Row 4 skipped: no date or amount.", expect.stringContaining("No running balance")]);
  });

  it("rejects files that aren't transaction downloads", () => {
    expect(() => readBankCsv("Name,Phone\nPat,555")).toThrow(/No date, description and amount/);
  });
});
