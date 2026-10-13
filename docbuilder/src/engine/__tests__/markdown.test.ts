import { markdownToHtml } from "../markdown.ts";

describe("markdown", () => {
  it("renders headings, paragraphs, lists and emphasis", () => {
    const html = markdownToHtml("# Title\n\nLine one\nline **two**\n\n- a\n- *b*\n\n1. first");
    expect(html).toBe("<h1>Title</h1>\n<p>Line one<br>line <strong>two</strong></p>\n<ul>\n<li>a</li>\n<li><em>b</em></li>\n</ul>\n<ol>\n<li>first</li>\n</ol>");
  });

  it("centers lines and adds page breaks", () => {
    expect(markdownToHtml("-> **FIRM** <-")).toBe('<p class="center"><strong>FIRM</strong></p>');
    expect(markdownToHtml("---pagebreak---")).toBe('<div class="page-break"></div>');
  });

  it("escapes HTML in answers", () => {
    expect(markdownToHtml('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  });
});
