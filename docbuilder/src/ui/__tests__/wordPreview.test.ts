import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { withFallbacks, withoutEastAsianFonts } from "../wordPreview.ts";

describe("Word preview fonts", () => {
  it("adds a look-alike and generic family after the document's font", () => {
    expect(withFallbacks('Calibri, "Times New Roman"')).toBe('Calibri, Carlito, sans-serif, "Times New Roman"');
    expect(withFallbacks("'Century Gothic', 'Times New Roman'")).toBe("'Century Gothic', sans-serif, 'Times New Roman'");
    expect(withFallbacks('"Times New Roman"')).toBe("\"Times New Roman\", 'Liberation Serif', serif");
    expect(withFallbacks("Courier New")).toBe("Courier New, 'Liberation Mono', monospace");
    expect(withFallbacks("Calibri Light")).toBe("Calibri Light, sans-serif");
  });

  it("leaves CSS variables alone", () => {
    expect(withFallbacks("var(--docx-minorHAnsi-font)")).toBe("var(--docx-minorHAnsi-font)");
  });
});

describe("Word preview copy", () => {
  it("drops East Asian font settings so Latin text keeps the inherited font", () => {
    const xml = '<w:rPr><w:rFonts w:eastAsia="Times New Roman" w:cstheme="minorHAnsi"/></w:rPr><w:rFonts w:ascii="Arial" w:eastAsiaTheme="minorEastAsia"/>';
    const out = unzipSync(withoutEastAsianFonts(zipSync({ "word/document.xml": strToU8(xml), "word/media/a.png": new Uint8Array([1, 2]) })));
    expect(strFromU8(out["word/document.xml"])).toBe('<w:rPr><w:rFonts w:cstheme="minorHAnsi"/></w:rPr><w:rFonts w:ascii="Arial"/>');
    expect([...out["word/media/a.png"]]).toEqual([1, 2]);
  });
});
