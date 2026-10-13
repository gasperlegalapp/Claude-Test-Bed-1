// Turns an assembled document's text into HTML. Supports a small Markdown
// subset that covers legal documents: headings (#, ##, ###), paragraphs,
// line breaks, bullet and numbered lists, **bold**, *italic*, a centered line
// (`-> text <-`) and a page break (`---pagebreak---`).
//
// All text is HTML-escaped before formatting, so answers can never inject
// markup into the document.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    // Underline needs text inside, so signature lines (______) stay as written.
    .replace(/__([^_\s](?:.*?[^_\s])?)__/g, "<u>$1</u>");
}

export function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let listKind: "ul" | "ol" | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (listKind) out.push(`</${listKind}>`);
    listKind = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const centered = /^->\s*(.*?)\s*<-$/.exec(line.trim());

    if (line.trim() === "") {
      flushPara();
      closeList();
    } else if (line.trim() === "---pagebreak---") {
      flushPara();
      closeList();
      out.push(`<div class="page-break"></div>`);
    } else if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushPara();
      const kind = bullet ? "ul" : "ol";
      if (listKind !== kind) {
        closeList();
        out.push(`<${kind}>`);
        listKind = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else if (centered) {
      flushPara();
      closeList();
      out.push(`<p class="center">${inline(centered[1])}</p>`);
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return out.join("\n");
}
