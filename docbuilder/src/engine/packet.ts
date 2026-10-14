// The filing packet: the account followed by the documents filed behind it
// (bank statements, check copies), put together as PDF. Scanned PDFs keep
// their pages as they are; photos become pages of their own. The packet can
// be one file, or the account and the attachments as separate files, and
// either can be split into parts with a page limit.

import { PDFDocument } from "pdf-lib";

export interface PacketFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface PacketPart {
  /** Added to the file name, e.g. "attachments-part-2". */
  suffix: string;
  bytes: Uint8Array;
  pages: number;
}

/** Letter, with photos fitted inside half-inch margins. */
const PAGE = { width: 612, height: 792, margin: 36 };

function isPdf(f: PacketFile): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name) || (f.bytes[0] === 0x25 && f.bytes[1] === 0x50 && f.bytes[2] === 0x44 && f.bytes[3] === 0x46);
}

function imageKind(f: PacketFile): "png" | "jpg" | null {
  const b = f.bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  return null;
}

async function loadPdf(f: PacketFile): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(f.bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String((e as Error).message))) throw new Error(`"${f.name}" is password-protected. Open it and print it to a new PDF, then add that.`);
    throw new Error(`"${f.name}" can't be read as a PDF.`);
  }
}

/** Pages a file adds to the packet; throws if it can't be used. */
export async function countPages(f: PacketFile): Promise<number> {
  if (isPdf(f)) return (await loadPdf(f)).getPageCount();
  if (imageKind(f)) return 1;
  throw new Error(`"${f.name}" isn't a PDF, PNG or JPEG.`);
}

/** Copies every page of `f` onto the end of `out`. */
async function append(out: PDFDocument, f: PacketFile): Promise<void> {
  if (isPdf(f)) {
    const src = await loadPdf(f);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    return;
  }
  const kind = imageKind(f);
  if (!kind) throw new Error(`"${f.name}" isn't a PDF, PNG or JPEG.`);
  const img = kind === "png" ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes);
  const page = out.addPage([PAGE.width, PAGE.height]);
  const scale = Math.min((PAGE.width - PAGE.margin * 2) / img.width, (PAGE.height - PAGE.margin * 2) / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (PAGE.width - w) / 2, y: PAGE.height - PAGE.margin - h, width: w, height: h });
}

/** Splits one document into parts of at most `max` pages. */
async function split(doc: PDFDocument, max: number | null): Promise<PDFDocument[]> {
  const count = doc.getPageCount();
  if (!max || count <= max) return [doc];
  const parts: PDFDocument[] = [];
  for (let start = 0; start < count; start += max) {
    const part = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(max, count - start) }, (_, i) => start + i);
    (await part.copyPages(doc, indices)).forEach((p) => part.addPage(p));
    parts.push(part);
  }
  return parts;
}

export async function buildPacket(account: Uint8Array, files: PacketFile[], opts: { separate: boolean; maxPages: number | null; title?: string }): Promise<PacketPart[]> {
  const accountDoc = await PDFDocument.load(account);
  const attachments = await PDFDocument.create();
  for (const f of files) await append(attachments, f);

  const out: { suffix: string; doc: PDFDocument }[] = [];
  if (opts.separate) {
    out.push({ suffix: "account", doc: accountDoc });
    if (attachments.getPageCount()) {
      const parts = await split(attachments, opts.maxPages);
      parts.forEach((doc, i) => out.push({ suffix: parts.length > 1 ? `attachments-part-${i + 1}` : "attachments", doc }));
    }
  } else {
    const whole = await PDFDocument.create();
    (await whole.copyPages(accountDoc, accountDoc.getPageIndices())).forEach((p) => whole.addPage(p));
    if (attachments.getPageCount()) (await whole.copyPages(attachments, attachments.getPageIndices())).forEach((p) => whole.addPage(p));
    const parts = await split(whole, opts.maxPages);
    parts.forEach((doc, i) => out.push({ suffix: parts.length > 1 ? `filing-part-${i + 1}` : "filing", doc }));
  }

  return Promise.all(
    out.map(async ({ suffix, doc }) => {
      if (opts.title) doc.setTitle(opts.title);
      doc.setCreator("DocBuilder");
      return { suffix, bytes: await doc.save(), pages: doc.getPageCount() };
    }),
  );
}
