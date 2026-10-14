// Minimal Excel (.xlsx) files: writing simple formatted workbooks, and reading
// any workbook's cells as text. Built on fflate like the Word support.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type CellValue = string | number | null;
export type StyleName =
  | "bold"
  | "header"
  | "money"
  | "total"
  | "date"
  | "title"
  | "wrap"
  | "muted"
  /** Court form styles: bold 12pt centered title, cells ruled underneath, accounting-style money, m/d/yyyy dates. */
  | "formTitle"
  | "ruled"
  | "ruledCenter"
  | "accounting"
  | "accountingRuled"
  | "shortDate"
  | "boldCenter"
  | "small";

export interface Cell {
  v: CellValue;
  /** Formula without the "=", e.g. "SUM(E2:E9)". `v` is kept as its last value. */
  f?: string;
  style?: StyleName;
}

export interface Sheet {
  name: string;
  /** Column widths in characters. */
  cols?: number[];
  rows: (Cell | CellValue)[][];
  /** Rows to keep in view when scrolling, e.g. 1 for a heading row. */
  freezeRows?: number;
  /** Ranges to merge, e.g. "A1:F1". */
  merges?: string[];
  /** Printed at the top of every page. "&P" is the page number. */
  pageHeader?: { left?: string; center?: string; right?: string };
  /** Rows repeated at the top of every printed page, e.g. [1, 6]. */
  printTitleRows?: [number, number];
  /** Margins in inches. */
  margins?: { left: number; right: number; top: number; bottom: number; header: number; footer: number };
}

const STYLE_INDEX: Record<StyleName, number> = {
  bold: 1,
  header: 2,
  money: 3,
  total: 4,
  date: 5,
  title: 6,
  wrap: 7,
  muted: 8,
  formTitle: 9,
  ruled: 10,
  ruledCenter: 11,
  accounting: 12,
  accountingRuled: 13,
  shortDate: 14,
  boldCenter: 15,
  small: 16,
};

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00_);\\(&quot;$&quot;#,##0.00\\)"/><numFmt numFmtId="165" formatCode="mm/dd/yyyy"/><numFmt numFmtId="166" formatCode="_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\);_(&quot;$&quot;* &quot;-&quot;??_);_(@_)"/><numFmt numFmtId="167" formatCode="m/d/yyyy"/></numFmts>
<fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF6B7482"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font><font><sz val="9"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"/><diagonal/></border><border><left/><right/><top style="thin"/><bottom style="double"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Days since 1899-12-30, which is how Excel stores dates. */
export function excelDate(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
}

function cellXml(raw: Cell | CellValue, ref: string): string {
  const cell: Cell = raw !== null && typeof raw === "object" ? raw : { v: raw };
  let { v } = cell;
  if ((cell.style === "date" || cell.style === "shortDate") && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = excelDate(v);
  const s = cell.style ? ` s="${STYLE_INDEX[cell.style]}"` : "";
  const f = cell.f ? `<f>${xml(cell.f)}</f>` : "";
  if (v === null || v === "") return f ? `<c r="${ref}"${s}>${f}</c>` : s ? `<c r="${ref}"${s}/>` : "";
  if (typeof v === "number") return `<c r="${ref}"${s}>${f}<v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const pane = sheet.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const rows = sheet.rows
    .map((row, r) => `<row r="${r + 1}">${row.map((c, i) => cellXml(c, `${columnName(i)}${r + 1}`)).join("")}</row>`)
    .join("");
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  const m = sheet.margins ?? { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
  const h = sheet.pageHeader;
  // In header codes "&" starts a command, so a literal one is doubled.
  const part = (code: string, text?: string) => (text ? `&${code}${text.replace(/&(?!P\b)/g, "&&")}` : "");
  const header = h ? `<headerFooter><oddHeader>${xml(part("L", h.left) + part("C", h.center) + part("R", h.right))}</oddHeader></headerFooter>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData>${merges}<pageMargins left="${m.left}" right="${m.right}" top="${m.top}" bottom="${m.bottom}" header="${m.header}" footer="${m.footer}"/><pageSetup paperSize="1" orientation="portrait"/>${header}</worksheet>`;
}

/** Excel limits sheet names to 31 characters without []:*?/\ and needs them unique. */
function sheetNames(sheets: Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((s) => {
    const base = s.name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function printTitles(sheets: Sheet[], names: string[]): string {
  const defs = sheets.flatMap((s, i) =>
    s.printTitleRows ? [`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xml(names[i].replace(/'/g, "''"))}'!$${s.printTitleRows[0]}:$${s.printTitleRows[1]}</definedName>`] : [],
  );
  return defs.length ? `<definedNames>${defs.join("")}</definedNames>` : "";
}

export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheetNames(sheets);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets>${printTitles(sheets, names)}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipSync(files);
}

// ------------------------------------------------------------------ reading

function unxml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function texts(fragment: string): string {
  return [...fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");
}

export function isXlsx(bytes: Uint8Array): boolean {
  try {
    return "xl/workbook.xml" in unzipSync(bytes, { filter: (f) => f.name === "xl/workbook.xml" });
  } catch {
    return false;
  }
}

/** Every sheet's cells as tab-separated text, for reading a workbook (e.g. a prior accounting). */
export function readXlsxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This file isn't an Excel workbook (.xlsx).");
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("This file isn't an Excel workbook (.xlsx).");
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const rels = Object.fromEntries([...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));

  const out: string[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unxml(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const target = rels[/r:id="([^"]+)"/.exec(m[0])?.[1] ?? ""] ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const sheet = read(path);
    out.push(`## Sheet: ${name}`);
    for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? "";
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let text = "";
        if (type === "s" && v !== undefined) text = shared[Number(v)] ?? "";
        else if (type === "inlineStr") text = texts(body);
        else if (v !== undefined) text = unxml(v);
        if (!text) continue;
        cells.push(`${ref ?? ""}: ${text}`);
      }
      if (cells.length) out.push(`${/r="(\d+)"/.exec(row[0])?.[1] ?? ""}\t${cells.join("\t")}`);
    }
  }
  return out.join("\n");
}
