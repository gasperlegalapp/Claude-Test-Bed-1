// Formatted on-screen previews of filled Word files, drawn by docx-preview
// (loaded on first use). The downloaded .docx stays the exact document; this
// is how it looks on screen: styles, tables, shading, images, headers and
// footers, page by page, scaled to fit the space available.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const PAGE_SELECTOR = "section.docx";

/** Renders `bytes` into `host`, replacing what was there. Throws if the file can't be drawn. */
export async function renderWordPreview(host: HTMLElement, bytes: Uint8Array): Promise<void> {
  const { renderAsync } = await import("docx-preview");
  const styles = document.createElement("div");
  const body = document.createElement("div");
  body.className = "word-pages";
  await renderAsync(new Blob([withoutEastAsianFonts(bytes) as BlobPart]), body, styles, {
    className: "docx",
    inWrapper: true,
    breakPages: true,
    // Word saves where it last broke pages; following those markers splits
    // the preview into pages where Word put them.
    ignoreLastRenderedPageBreak: false,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderComments: false,
    renderChanges: false,
    useBase64URL: true,
  });
  // Documents come from uploaded files: only web and email links stay clickable.
  for (const a of body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (!/^(https?:|mailto:|#)/i.test(a.getAttribute("href") ?? "")) a.removeAttribute("href");
  }
  addFontFallbacks(styles, body);
  host.replaceChildren(styles, body);
  fitToWidth(host);
}

/**
 * Word applies a run's East Asian font only to Chinese, Japanese and Korean
 * text; other text keeps the inherited Latin font. docx-preview uses the East
 * Asian font for everything when a run names no Latin font, so text Word shows
 * in Calibri would preview in Times New Roman. The preview gets a copy with
 * those settings removed; the downloaded file is not touched.
 */
export function withoutEastAsianFonts(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  for (const path of Object.keys(files)) {
    if (!/^word\/[^/]+\.xml$/.test(path)) continue;
    const xml = strFromU8(files[path]);
    const cleaned = xml.replace(/<w:rFonts\b[^>]*>/g, (tag) => tag.replace(/\s+w:eastAsia(?:Theme)?="[^"]*"/g, ""));
    if (cleaned !== xml) files[path] = strToU8(cleaned);
  }
  return zipSync(files);
}

const SERIF = /times|georgia|garamond|cambria|antiqua|palatino|baskerville|schoolbook|bookman|constantia/i;
const MONO = /courier|consolas|mono/i;
/** Free fonts with the same measurements, common on machines without Office. */
const LOOKALIKE: Record<string, string> = {
  calibri: "Carlito",
  cambria: "Caladea",
  arial: "'Liberation Sans'",
  "times new roman": "'Liberation Serif'",
  "courier new": "'Liberation Mono'",
};

/**
 * Word lists a run's Latin font first and its East Asian font after it, and
 * that is often Times New Roman. Without the Latin font installed (Calibri on
 * a machine without Office), the browser would fall to Times. Insert a
 * look-alike and the right generic family right after the first font; the
 * rest stays for characters the first fonts don't have.
 */
export function withFallbacks(value: string): string {
  if (value.includes("var(")) return value;
  const [first, ...rest] = value.split(",").map((f) => f.trim());
  const name = first.replace(/['"]/g, "");
  const generic = MONO.test(name) ? "monospace" : SERIF.test(name) ? "serif" : "sans-serif";
  return [first, LOOKALIKE[name.toLowerCase()], generic, ...rest].filter(Boolean).join(", ");
}

function addFontFallbacks(styles: HTMLElement, body: HTMLElement): void {
  for (const style of styles.querySelectorAll("style")) {
    style.textContent = (style.textContent ?? "").replace(
      /((?:--docx-[\w-]+-font|font-family)\s*:\s*)([^;}]+)/g,
      (_, prop: string, value: string) => prop + withFallbacks(value.trim()),
    );
  }
  for (const el of body.querySelectorAll<HTMLElement>("[style*='font-family']")) {
    el.style.fontFamily = withFallbacks(el.style.fontFamily);
  }
}

/** Shrinks the pages so the widest one fits the host's width. */
export function fitToWidth(host: HTMLElement): void {
  const body = host.querySelector<HTMLElement>(".word-pages");
  const page = host.querySelector<HTMLElement>(PAGE_SELECTOR);
  if (!body || !page) return;
  body.style.zoom = "1";
  const available = host.clientWidth;
  const needed = page.offsetWidth + 32; // the wrapper's 16px padding on each side
  body.style.zoom = String(Math.min(1, available / needed));
}
