import { PDFDocument } from "pdf-lib";
import { buildPacket, countPages, type PacketFile } from "../packet.ts";
import { courtForm } from "../courtForm.ts";
import { courtFormPdf } from "../courtFormPdf.ts";
import { SAMPLE_GUARDIANSHIP } from "../../data/accountingSample.ts";

// A 1×1 PNG, standing in for a photo of a check.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function pdfWith(pages: number, name: string): Promise<PacketFile> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return { name, type: "application/pdf", bytes: await doc.save() };
}

const pagesOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("filing packet", () => {
  let account: Uint8Array;
  beforeAll(async () => {
    account = await courtFormPdf(courtForm(structuredClone(SAMPLE_GUARDIANSHIP)));
  });

  it("counts the pages each document adds", async () => {
    expect(await countPages(await pdfWith(3, "statements.pdf"))).toBe(3);
    expect(await countPages({ name: "check.png", type: "image/png", bytes: PNG })).toBe(1);
    await expect(countPages({ name: "notes.txt", type: "text/plain", bytes: new Uint8Array([1, 2]) })).rejects.toThrow(/isn't a PDF, PNG or JPEG/);
    await expect(countPages({ name: "bad.pdf", type: "application/pdf", bytes: new Uint8Array([1, 2]) })).rejects.toThrow(/can't be read as a PDF/);
  });

  it("puts the account first, then the attachments in order, in one PDF", async () => {
    const accountPages = await pagesOf(account);
    const parts = await buildPacket(account, [await pdfWith(3, "statements.pdf"), { name: "check.png", type: "image/png", bytes: PNG }, await pdfWith(2, "vouchers.pdf")], { separate: false, maxPages: null, title: "Packet" });
    expect(parts.map((p) => p.suffix)).toEqual(["filing"]);
    expect(parts[0].pages).toBe(accountPages + 3 + 1 + 2);
    const doc = await PDFDocument.load(parts[0].bytes);
    expect(doc.getTitle()).toBe("Packet");
    // The photo sits on a Letter page of its own.
    expect(doc.getPage(accountPages + 3).getSize()).toEqual({ width: 612, height: 792 });
  });

  it("can file the account and the attachments separately, splitting the attachments by pages", async () => {
    const parts = await buildPacket(account, [await pdfWith(30, "statements.pdf"), await pdfWith(20, "vouchers.pdf")], { separate: true, maxPages: 25 });
    expect(parts.map((p) => [p.suffix, p.pages])).toEqual([
      ["account", await pagesOf(account)],
      ["attachments-part-1", 25],
      ["attachments-part-2", 25],
    ]);
  });

  it("splits one combined PDF into parts", async () => {
    const accountPages = await pagesOf(account);
    const parts = await buildPacket(account, [await pdfWith(10, "s.pdf")], { separate: false, maxPages: 5 });
    const total = accountPages + 10;
    const expected = Array.from({ length: Math.ceil(total / 5) }, (_, i) => Math.min(5, total - i * 5));
    expect(parts.map((p) => p.pages)).toEqual(expected);
    expect(parts[0].suffix).toBe("filing-part-1");
  });

  it("is just the account when nothing is attached", async () => {
    const parts = await buildPacket(account, [], { separate: true, maxPages: null });
    expect(parts.map((p) => p.suffix)).toEqual(["account"]);
  });
});
