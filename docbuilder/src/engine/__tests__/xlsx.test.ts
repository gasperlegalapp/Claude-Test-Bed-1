import { strFromU8, unzipSync } from "fflate";
import { accountingWorkbook } from "../accountingExport.ts";
import { columnName, excelDate, isXlsx, readXlsxText, writeXlsx } from "../xlsx.ts";
import { SAMPLE_ACCOUNTING } from "../../data/accountingSample.ts";

describe("xlsx", () => {
  it("names columns and dates the way Excel does", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-01-31")).toBe(46053);
  });

  it("writes a workbook that reads back, with escaped text, styles and formulas", () => {
    const bytes = writeXlsx([
      { name: "Receipts: <Q1>", cols: [12, 30], rows: [[{ v: "Date", style: "header" }, { v: "Amount", style: "header" }], [{ v: "2026-01-31", style: "date" }, { v: 1.5, style: "money" }], ["Total", { v: 1.5, f: "SUM(B2:B2)", style: "total" }]], freezeRows: 1 },
      { name: "Receipts: <Q1>", rows: [["Tom & Jerry's \"shop\""]] },
    ]);
    expect(isXlsx(bytes)).toBe(true);
    const files = unzipSync(bytes);
    expect(strFromU8(files["xl/workbook.xml"])).toContain('<sheet name="Receipts  &lt;Q1&gt;" sheetId="1"');
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Receipts  &lt;Q1&gt; 2"');
    const sheet1 = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet1).toContain('<c r="A2" s="5"><v>46053</v></c>');
    expect(sheet1).toContain('<c r="B3" s="4"><f>SUM(B2:B2)</f><v>1.5</v></c>');
    expect(sheet1).toContain('ySplit="1"');
    expect(readXlsxText(bytes)).toBe(
      ["## Sheet: Receipts  <Q1>", "1\tA: Date\tB: Amount", "2\tA: 46053\tB: 1.5", "3\tA: Total\tB: 1.5", "## Sheet: Receipts  <Q1> 2", "1\tA: Tom & Jerry's \"shop\""].join("\n"),
    );
  });

  it("refuses files that aren't workbooks", () => {
    expect(isXlsx(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(() => readXlsxText(new Uint8Array([1, 2, 3]))).toThrow(/isn't an Excel workbook/);
  });
});

describe("accounting workbook", () => {
  const sheets = accountingWorkbook(structuredClone(SAMPLE_ACCOUNTING));
  const text = (name: string) => JSON.stringify(sheets.find((s) => s.name === name)!.rows);

  it("has the summary, schedules, reconciliation and open items", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Receipts", "Disbursements", "Transfers", "Reconciliation", "Open items"]);
    const summary = text("Summary");
    expect(summary).toContain('"Estate of Jane Q. Sample"');
    expect(summary).toContain('"01/01/2026 to 03/31/2026"');
    // Ending cash = beginning + receipts - disbursements + not yet categorized, as a live formula.
    expect(summary).toMatch(/"v":35749.09,"f":"B9\+B10-B11"/);
    expect(summary).toContain('"v":227249.09');
  });

  it("lists disbursements as amounts paid out, with payee and check number", () => {
    const rows = sheets.find((s) => s.name === "Disbursements")!.rows;
    expect(rows).toHaveLength(1 + 9 + 1);
    expect(JSON.stringify(rows[4])).toContain('"Example Law LLC"');
    expect(rows.at(-1)!.at(-1)).toEqual({ v: 5708.17, f: "SUM(I2:I10)", style: "total" });
  });

  it("reconciles each statement to zero difference", () => {
    const rows = sheets.find((s) => s.name === "Reconciliation")!.rows.slice(1);
    expect(rows).toHaveLength(4);
    for (const r of rows) expect((r[8] as { v: number }).v).toBe(0);
  });

  it("writes to a real file", () => {
    expect(isXlsx(writeXlsx(sheets))).toBe(true);
    expect(text("Open items")).toContain("without a category");
  });
});
