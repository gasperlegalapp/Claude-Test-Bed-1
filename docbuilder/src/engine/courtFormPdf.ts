// The court form drawn straight to PDF, laid out like its Excel version
// (courtForm.ts): ready to sign, scan and file, with no conversion step.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { shortDate, type CourtForm, type FormLine } from "./courtForm.ts";

const PAGE = { width: 612, height: 792 };
const LEFT = 50;
const WIDTH = PAGE.width - LEFT * 2;
/** Column widths in the same proportions as the Excel sheet. */
const COLS = (() => {
  const excel = [10.6, 17, 18.7, 9.5, 15.6, 17.4];
  const total = excel.reduce((x, y) => x + y, 0);
  const widths = excel.map((w) => Math.round((w / total) * WIDTH));
  let x = LEFT;
  return widths.map((w) => {
    const col = { x, w };
    x += w;
    return col;
  });
})();
const CAPTION_TOP = PAGE.height - 24;
const CONTENT_TOP = PAGE.height - 96;
const BOTTOM = 54;
const ROW = 14.5;
const SIZE = 10;
const BLACK = rgb(0, 0, 0);

/** WinAnsi is all the standard PDF fonts can draw; anything else prints as "?". */
const EXTRA = new Set("‘’“”–—…•€™ŠšŒœŽžŸƒˆ˜†‡‰‹›");
function printable(text: string): string {
  return [...text].map((ch) => (ch.charCodeAt(0) < 256 || EXTRA.has(ch) ? ch : "?")).join("").replace(/[\n\r\t]/g, " ");
}

const MONEY = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class Writer {
  page!: PDFPage;
  y = 0;
  pageNumber = 0;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
    private form: CourtForm,
  ) {}

  newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pageNumber++;
    const { left, center } = this.form.caption;
    left.forEach((line, i) => this.text(line, LEFT, CAPTION_TOP - i * 12, { size: 9 }));
    center.forEach((line, i) => this.centered(line, CAPTION_TOP - i * 12, { size: 9 }));
    const pageLine = Math.max(left.length - 1, 0);
    this.right(`Page ${this.pageNumber}`, LEFT + WIDTH, CAPTION_TOP - pageLine * 12, { size: 9 });
    this.y = CONTENT_TOP;
  }

  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; maxWidth?: number } = {}): void {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    let size = o.size ?? SIZE;
    let t = printable(s);
    if (!t) return;
    if (o.maxWidth) {
      // Shrink a little, then cut with an ellipsis, rather than run into the next column.
      while (font.widthOfTextAtSize(t, size) > o.maxWidth && size > 7.5) size -= 0.5;
      while (font.widthOfTextAtSize(t, size) > o.maxWidth && t.length > 1) t = `${t.slice(0, -2)}…`;
    }
    this.page.drawText(t, { x, y, size, font, color: BLACK });
  }

  centered(s: string, y: number, o: { size?: number; bold?: boolean } = {}): void {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const t = printable(s);
    this.text(t, LEFT + (WIDTH - font.widthOfTextAtSize(t, o.size ?? SIZE)) / 2, y, o);
  }

  centeredIn(s: string, col: { x: number; w: number }, y: number, o: { size?: number; bold?: boolean } = {}): void {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const t = printable(s);
    this.text(t, col.x + (col.w - font.widthOfTextAtSize(t, o.size ?? SIZE)) / 2, y, o);
  }

  right(s: string, xRight: number, y: number, o: { size?: number; bold?: boolean } = {}): void {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const t = printable(s);
    this.text(t, xRight - font.widthOfTextAtSize(t, o.size ?? SIZE), y, o);
  }

  rule(x: number, w: number, y: number): void {
    this.page.drawLine({ start: { x, y: y - 3 }, end: { x: x + w, y: y - 3 }, thickness: 0.6, color: BLACK });
  }

  /** "$" at the left of the cell and the amount at the right, like Excel's accounting format. */
  money(n: number | null, col: { x: number; w: number }, y: number): void {
    if (n === null) return;
    this.text("$", col.x + 4, y);
    this.right(n < 0 ? `(${MONEY.format(-n)})` : MONEY.format(n), col.x + col.w - 6, y);
  }

  room(): number {
    return this.y - BOTTOM;
  }
}

function titleBlock(w: Writer, form: CourtForm, account: string): void {
  w.centered(form.title, w.y, { size: 12, bold: true });
  w.y -= ROW * 2;
  w.text("Account", COLS[0].x, w.y);
  w.text(form.accountTitle, COLS[4].x, w.y);
  w.rule(COLS[4].x, COLS[4].w, w.y);
  w.text("Account", COLS[5].x, w.y);
  w.y -= ROW;
  w.text(account, COLS[0].x, w.y, { maxWidth: COLS[4].x - COLS[0].x - 6 });
  w.text(`From ${form.from}`, COLS[4].x, w.y);
  w.text(`To ${form.to}`, COLS[5].x, w.y);
  w.y -= ROW * 2;
  ["DATE", "PAYEE", "DESCRIPTION", "Check No.", "DISBURSEMENT", "RECEIPT"].forEach((h, i) => {
    if (i < 4) w.text(h, COLS[i].x + 1, w.y);
    else w.centeredIn(h, COLS[i], w.y);
    w.rule(COLS[i].x, COLS[i].w, w.y);
  });
  w.y -= ROW;
}

function lineRow(w: Writer, l: FormLine): void {
  const y = w.y;
  w.text(shortDate(l.date), COLS[0].x + 1, y);
  // Like Excel, a payee runs on into an empty description cell.
  const payeeWidth = l.description ? COLS[1].w - 4 : COLS[1].w + COLS[2].w + (l.checkNumber ? -4 : COLS[3].w - 4);
  w.text(l.payee, COLS[1].x + 1, y, { maxWidth: payeeWidth });
  if (l.description) w.text(l.description, COLS[2].x + 1, y, { maxWidth: COLS[2].w - 4 });
  if (l.checkNumber) w.right(l.checkNumber, COLS[3].x + COLS[3].w - 6, y);
  w.money(l.disbursement, COLS[4], y);
  w.money(l.receipt, COLS[5], y);
  w.y -= ROW;
}

const SIGNATURE_ROWS = 12;

export async function courtFormPdf(form: CourtForm): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${form.title} — ${form.caption.left[0] ?? ""}`.trim());
  doc.setCreator("DocBuilder");
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, fonts, form);

  for (const section of form.sections) {
    w.newPage();
    titleBlock(w, form, section.account);
    for (const line of section.lines) {
      if (w.room() < ROW) {
        w.newPage();
        titleBlock(w, form, section.account);
      }
      lineRow(w, line);
    }
  }

  // Recapitulation, assets and signatures stay together on one page.
  const needed = ROW * (8 + form.assets.length + 3 + SIGNATURE_ROWS);
  if (w.room() < needed) w.newPage();
  else w.y -= ROW;
  w.centered("RECAPITULATION", w.y, { size: 12, bold: true });
  w.y -= ROW * 1.5;
  const amountCol = { x: COLS[4].x, w: COLS[4].w + COLS[5].w * 0.4 };
  for (const [label, value] of [
    ["Total Receipts", form.totals.receipts],
    ["Total Disbursements", form.totals.disbursements],
    ["Balance Remaining", form.totals.remaining],
  ] as const) {
    w.text(label, COLS[0].x + 1, w.y);
    w.rule(COLS[0].x, COLS[4].x + amountCol.w - COLS[0].x, w.y);
    w.money(value, amountCol, w.y);
    w.y -= ROW;
  }
  w.y -= ROW * 0.5;
  w.centered("ITEMIZED STATEMENT OF ALL FUNDS, ASSETS, and INVESTMENTS", w.y, { bold: true });
  w.y -= ROW;
  w.text("Item", COLS[0].x + 1, w.y, { bold: true });
  w.y -= ROW;
  for (const asset of form.assets) {
    w.text(asset.item, COLS[0].x + 1, w.y, { maxWidth: COLS[4].x - COLS[0].x - 8 });
    w.rule(COLS[0].x, COLS[4].x + amountCol.w - COLS[0].x, w.y);
    w.money(asset.value, amountCol, w.y);
    w.y -= ROW;
  }
  w.y -= ROW * 0.5;
  w.text("TOTAL ASSETS REMAINING:", COLS[0].x + 1, w.y, { bold: true });
  w.rule(COLS[4].x, amountCol.w, w.y);
  w.money(form.totalAssets, amountCol, w.y);
  w.y -= ROW * 3;

  const blocks = [
    { x: COLS[0].x, w: COLS[0].w + COLS[1].w },
    { x: COLS[3].x, w: COLS[3].w + COLS[4].w + COLS[5].w },
  ];
  const [left, right] = form.signers;
  const pair = (l: string, r: string, ruled: boolean) => {
    [l, r].forEach((v, i) => {
      w.text(v, blocks[i].x + 1, w.y, { size: ruled ? SIZE : 8, maxWidth: blocks[i].w - 4 });
      if (ruled) w.rule(blocks[i].x, blocks[i].w, w.y);
    });
    w.y -= ruled ? ROW * 0.9 : ROW * 1.1;
  };
  pair("", "", true);
  pair(left.role, right.role, false);
  pair(left.name, right.name, true);
  pair("Typed or Printed Name", "Typed or Printed Name", false);
  pair(left.address, right.address, true);
  pair("Address", "Address", false);
  pair(left.city, right.city, true);
  pair("City, State, Zip", "City, State, Zip", false);
  pair(left.phone, right.phone, true);
  pair("Telephone Number", "Telephone Number", false);
  if (left.registration !== undefined) {
    w.text(left.registration, blocks[0].x + 1, w.y);
    w.rule(blocks[0].x, blocks[0].w, w.y);
    w.y -= ROW * 0.9;
    w.text("Attorney Registration No.", blocks[0].x + 1, w.y, { size: 8 });
  }
  return doc.save();
}
