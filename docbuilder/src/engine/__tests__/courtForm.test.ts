import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { findings, sum } from "../accounting.ts";
import { courtForm, courtFormSheets, shortDate } from "../courtForm.ts";
import { courtFormPdf } from "../courtFormPdf.ts";
import { writeXlsx } from "../xlsx.ts";
import { SAMPLE_ACCOUNTING, SAMPLE_GUARDIANSHIP } from "../../data/accountingSample.ts";

const guardianship = () => structuredClone(SAMPLE_GUARDIANSHIP);

describe("court form", () => {
  it("writes dates the way the court's forms do", () => {
    expect(shortDate("2025-01-22")).toBe("1/22/2025");
  });

  it("opens with the balance carried from the prior account and lists every line by date", () => {
    const form = courtForm(guardianship());
    const [section] = form.sections;
    expect(form.title).toBe("GUARDIAN'S ACCOUNT");
    expect(section.account).toBe("Example Bank Grd Acct #xx4321");
    expect(section.lines[0]).toEqual({ date: "2025-12-31", payee: "Balance from prior account filed 1/20/2026", description: "", checkNumber: "", disbursement: null, receipt: 1200 });
    expect(section.lines[3]).toEqual({ date: "2026-01-05", payee: "Example Housing", description: "rent", checkNumber: "2101", disbursement: 300, receipt: null });
    // A line nobody has named yet shows the bank's text, so nothing is silently left blank.
    expect(section.lines.find((l) => l.checkNumber === "2107")!.payee).toBe("SUBSTITUTE CHECK Check 2107");
    expect(section.lines).toHaveLength(1 + 29);
  });

  it("recapitulates: receipts include the carried balance, and the remainder is what the bank shows", () => {
    const a = guardianship();
    const form = courtForm(a);
    expect(form.totals.receipts).toBe(sum([1200, 1050, 1050, 1050]));
    expect(form.totals.remaining).toBe(a.statements[0].closing);
    expect(form.assets).toEqual([{ item: "Balance of Example Bank Grd Acct xx4321 Balance 3/31/2026", value: form.totals.remaining }]);
    expect(form.totalAssets).toBe(form.totals.remaining);
    expect(form.signers.map((s) => s.role)).toEqual(["Attorney for Guardian", "Guardian"]);
  });

  it("only leaves review items open on the sample, nothing that breaks the balance", () => {
    expect(findings(guardianship()).map((f) => `${f.level}: ${f.title}`)).toEqual(["warning: 1 check without a payee", "warning: 1 line the reader wasn't sure about"]);
  });

  it("lists other assets remaining and uses the estate wording for estates", () => {
    const form = courtForm(structuredClone(SAMPLE_ACCOUNTING));
    expect(form.title).toBe("FIDUCIARY'S ACCOUNT");
    expect(form.sections).toHaveLength(2);
    expect(form.assets.map((x) => x.item)).toContain("Residence, 123 Example Street");
    expect(form.totalAssets).toBe(sum([form.totals.remaining, 185000, 6500]));
  });
});

describe("court form as Excel", () => {
  it("prints the caption and page number on every page and repeats the title block", () => {
    const sheets = courtFormSheets(courtForm(guardianship()));
    expect(sheets).toHaveLength(1);
    const files = unzipSync(writeXlsx(sheets));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("<oddHeader>&amp;LALEX Q. SAMPLE\n\n\nCASE NO. 000000&amp;CPROBATE COURT OF FRANKLIN COUNTY, OHIO\nEXAMPLE JUDGE, JUDGE&amp;R\n\n\nPage &amp;P</oddHeader>");
    expect(strFromU8(files["xl/workbook.xml"])).toContain(`<definedName name="_xlnm.Print_Titles" localSheetId="0">'Account'!$1:$6</definedName>`);
  });

  it("totals with formulas over the ledger, including the carried balance", () => {
    const [sheet] = courtFormSheets(courtForm(guardianship()));
    const flat = JSON.stringify(sheet.rows);
    expect(flat).toContain('"f":"SUM(F7:F36)"');
    expect(flat).toContain('"f":"SUM(E7:E36)"');
    expect(flat).toContain('"v":"Attorney Registration No."');
  });

  it("puts each account on its own sheet and sums across them", () => {
    const sheets = courtFormSheets(courtForm(structuredClone(SAMPLE_ACCOUNTING)));
    expect(sheets.map((s) => s.name)).toEqual(["Account 1", "Account 2"]);
    expect(JSON.stringify(sheets[1].rows)).toContain("SUM('Account 1'!F7:F22,'Account 2'!F7:F11)");
  });
});

describe("court form as PDF", () => {
  it("draws a Letter-size PDF with the ledger and the recapitulation", async () => {
    const bytes = await courtFormPdf(courtForm(guardianship()));
    expect(strFromU8(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getTitle()).toBe("GUARDIAN'S ACCOUNT — ALEX Q. SAMPLE");
  });

  it("starts a new page when the ledger runs long", async () => {
    const a = guardianship();
    for (let i = 0; i < 120; i++) a.transactions.push({ ...a.transactions[1], id: `extra${i}`, statementId: undefined, date: "2026-03-30" });
    const doc = await PDFDocument.load(await courtFormPdf(courtForm(a)));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
  });

  it("draws characters the standard fonts lack as question marks instead of failing", async () => {
    const a = guardianship();
    a.transactions[0].payee = "Ünïcode ok, emoji 🙂 and 漢字 not";
    await expect(courtFormPdf(courtForm(a))).resolves.toBeInstanceOf(Uint8Array);
  });
});
