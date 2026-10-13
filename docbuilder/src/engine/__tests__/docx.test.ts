import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bytesToBase64, DocxError, fillDocx, loadDocx, xmlText } from "../docx.ts";
import { assemble } from "../session.ts";
import { validateWorkflow } from "../validate.ts";
import type { Value, Workflow } from "../types.ts";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

/** A minimal but valid .docx (base64) with the given body XML. */
function docx(body: string, extra: Record<string, string> = {}, mainType = MAIN): string {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  };
  for (const [path, xml] of Object.entries(extra)) files[path] = strToU8(xml);
  return bytesToBase64(zipSync(files));
}

/** A paragraph with one run per argument, the way Word splits text. */
const p = (...runs: string[]) => `<w:p>${runs.map((r) => `<w:r><w:t>${r}</w:t></w:r>`).join("")}</w:p>`;
const cell = (...paras: string[]) => `<w:tc>${paras.join("")}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
const table = (...rows: string[]) => `<w:tbl>${rows.join("")}</w:tbl>`;

/** Fills a template and returns the document XML. */
function fill(b64: string, vars: Record<string, Value> = {}, part = "word/document.xml"): string {
  const out = unzipSync(fillDocx(loadDocx(b64), (n) => vars[n] ?? null));
  const xml = strFromU8(out[part]);
  expect(wellFormed(xml)).toBe(true);
  return xml;
}
const text = (b64: string, vars: Record<string, Value> = {}) => xmlText(fill(b64, vars));

function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([^\s/>?!]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]);
  }
  return stack.length === 0;
}

describe("Word templates", () => {
  it("fills tags that Word split across runs", () => {
    expect(text(docx(p("Dear {{ cli", "ent_na", "me }},")), { client_name: "Ada" })).toBe("Dear Ada,");
    expect(text(docx(p("{", "{ x }", "} and {", "% if y %}Y{% end", "if %}")), { x: 1, y: true })).toBe("1 and Y");
  });

  it("keeps the formatting of the run a tag was typed in", () => {
    const xml = fill(docx('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{{ name }}</w:t></w:r></w:p>'), { name: "Ada" });
    expect(xml).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Ada</w:t></w:r>');
  });

  it("accepts Word's curly quotes and non-breaking spaces inside tags", () => {
    const b64 = docx(p("{% if type == “business” %}Biz{% else %}Person{% endif %}"));
    expect(text(b64, { type: "business" })).toBe("Biz");
    expect(text(docx(p("{{ name }}")), { name: "Ada" })).toBe("Ada");
  });

  it("removes whole paragraphs, and the tag lines themselves, for block tags on their own line", () => {
    const b64 = docx(p("A") + p("{% if x %}") + p("B") + p("C") + p("{% else %}") + p("D") + p("{% endif %}") + p("E"));
    expect(text(b64, { x: true })).toBe("A\nB\nC\nE");
    expect(text(b64, { x: false })).toBe("A\nD\nE");
  });

  it("repeats paragraphs for a loop on its own lines", () => {
    const b64 = docx(p("{% for c in kids %}") + p("{{ loop.index }}. ", "{{ c.name }}") + p("{% endfor %}"));
    expect(text(b64, { kids: [{ name: "Ann" }, { name: "Bo" }] })).toBe("1. Ann\n2. Bo");
    expect(text(b64, { kids: [] })).toBe("");
  });

  it("repeats a table row when a loop spans its first and last cell", () => {
    const b64 = docx(
      table(
        row(cell(p("Name")), cell(p("Role"))),
        row(cell(p("{% for x in parties %}{{ x.name }}")), cell(p("{{ x.role }}{% endfor %}"))),
      ),
    );
    const xml = fill(b64, { parties: [{ name: "Ann", role: "Buyer" }, { name: "Bo", role: "Seller" }] });
    expect(xml.match(/<w:tr>/g)).toHaveLength(3);
    expect(xmlText(xml)).toBe("Name\nRole\nAnn\nBuyer\nBo\nSeller");
    expect(fill(b64, { parties: [] }).match(/<w:tr>/g)).toHaveLength(1);
  });

  it("drops a table left with no rows and keeps cells valid", () => {
    const b64 = docx(table(row(cell(p("{% for x in list %}{{ x }}")), cell(p("{% endfor %}")))) + p("After"));
    const xml = fill(b64, { list: [] });
    expect(xml).not.toContain("<w:tbl>");
    expect(xmlText(xml)).toBe("After");
    const inCell = fill(docx(table(row(cell(p("{% if no %}"), p("hidden"), p("{% endif %}"))))));
    expect(inCell).toContain("<w:tc><w:p/></w:tc>");
  });

  it("escapes values and turns line breaks into Word breaks", () => {
    const xml = fill(docx(p("{{ v }}")), { v: "A & B <x>\nline 2" });
    expect(xml).toContain("A &amp; B &lt;x&gt;</w:t><w:br/><w:t xml:space=\"preserve\">line 2");
  });

  it("leaves literal braces alone", () => {
    expect(text(docx(p("Keep { this } and {{ not closed")))).toBe("Keep { this } and {{ not closed");
  });

  it("fills headers and footers", () => {
    const header = `<w:hdr ${W}>${p("Case {{ n }}")}</w:hdr>`;
    const b64 = docx(p("Body"), { "word/header1.xml": header });
    expect(xmlText(fill(b64, { n: "42" }, "word/header1.xml"))).toBe("Case 42");
  });

  it("turns a .dotx template into a .docx document", () => {
    const b64 = docx(p("x"), {}, "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml");
    const types = strFromU8(unzipSync(fillDocx(loadDocx(b64), () => null))["[Content_Types].xml"]);
    expect(types).toContain("wordprocessingml.document.main+xml");
  });

  it("explains problems in terms of the tags", () => {
    expect(() => loadDocx(docx(p("{% if x %}") + p("never closed")))).toThrow(/never closed/);
    expect(() => loadDocx(docx(p("{% if x %} inline") + table(row(cell(p("{% endif %} in a cell"))))))).toThrow(DocxError);
    expect(() => loadDocx(docx(p("{% if x %} inline") + table(row(cell(p("{% endif %} in a cell"))))))).toThrow(/can't be paired/);
    expect(() => loadDocx(bytesToBase64(strToU8("not a zip")))).toThrow(/isn't a Word document/);
  });

  it("validates and assembles workflows that use Word templates", () => {
    const wf: Workflow = {
      id: "w",
      name: "W",
      pages: [{ id: "p", title: "P", questions: [{ id: "name", label: "Name", type: "text" }] }],
      computed: [],
      documents: [{ id: "d", name: "Letter", body: "", docx: { fileName: "letter.docx", data: docx(p("Dear {{ name }} {{ nmae }}")) } }],
    };
    expect(validateWorkflow(wf).map((i) => i.message)).toContain('"nmae" is not a question or computed value.');

    wf.documents[0].docx!.data = docx(p("Dear {{ name }}"));
    expect(validateWorkflow(wf)).toEqual([]);
    const [doc] = assemble(wf, { name: "Ada" });
    expect(doc.text).toBe("Dear Ada");
    expect(doc.html).toBe("<p>Dear Ada</p>");
    expect(xmlText(strFromU8(unzipSync(doc.file!)["word/document.xml"]))).toBe("Dear Ada");
  });
});
