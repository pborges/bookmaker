import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPass, exportCover, type PlacedPage } from "./export";
import { impose } from "./imposition";
import { EMPTY_COVER_PAGES } from "./model";

async function makeSourcePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([200, 300]);
    page.drawText(`page ${i}`, { font });
  }
  return doc.save();
}

const fieldNotes = { widthMm: 88.9, heightMm: 139.7 };

describe("exportCover", () => {
  it("produces a two-page duplex PDF for a separate-wrap cover", async () => {
    const sourceBytes = await makeSourcePdf(4);
    const coverPages = {
      outsideFront: { sourceId: "src", sourcePage: 0 },
      insideFront: { sourceId: "src", sourcePage: 1 },
      insideBack: { sourceId: "src", sourcePage: 2 },
      outsideBack: { sourceId: "src", sourcePage: 3 },
    };

    const bytes = await exportCover({ mode: "precut" }, fieldNotes, 3, coverPages, async (id) =>
      id === "src" ? sourceBytes.slice().buffer : undefined,
    );

    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(2);
  });

  it("handles an all-blank cover without error", async () => {
    const bytes = await exportCover({ mode: "precut" }, fieldNotes, 3, EMPTY_COVER_PAGES, async () => undefined);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(2);
  });
});

describe("buildPass with a sew guide", () => {
  it("draws the dashed fold line and station dots when enabled", async () => {
    const sheets = impose(4); // single sheet, so it's always the innermost
    const lookup = (): PlacedPage => ({ bookPageNumber: null });

    const withGuide = await buildPass(sheets, (s) => s.back, { mode: "precut" }, fieldNotes, 3, lookup, 0, [0], {
      sewGuide: { line: "innermost", stations: 3 },
      side: "back",
    });
    const withoutGuide = await buildPass(sheets, (s) => s.back, { mode: "precut" }, fieldNotes, 3, lookup, 0, [0]);

    // Both pages are otherwise empty (blank lookup), so extra bytes on the
    // "withGuide" pass can only be the guide's line and station-dot draws.
    expect(withGuide.length).toBeGreaterThan(withoutGuide.length);
  });

  it("does not draw on a sheet that isn't the innermost one under 'innermost'", async () => {
    const sheets = impose(8); // two sheets; sheet 0 is not innermost
    const lookup = (): PlacedPage => ({ bookPageNumber: null });

    const withConfigNotInnermost = await buildPass(
      sheets,
      (s) => s.back,
      { mode: "precut" },
      fieldNotes,
      3,
      lookup,
      0,
      [0],
      { sewGuide: { line: "innermost", stations: 3 }, side: "back" },
    );
    const noConfig = await buildPass(sheets, (s) => s.back, { mode: "precut" }, fieldNotes, 3, lookup, 0, [0]);

    expect(withConfigNotInnermost.length).toBe(noConfig.length);
  });
});

describe("buildPass with a rotated page", () => {
  it("places a 90°-rotated landscape source page without throwing, at the expected sheet size", async () => {
    const sourceBytes = await makeSourcePdf(1);
    const sheets = impose(4);

    const lookup = (bookPageNumber: number): PlacedPage => {
      if (bookPageNumber !== 1) return { bookPageNumber: null };
      return {
        bookPageNumber,
        sourceBytes: sourceBytes.slice().buffer,
        sourcePageIndex: 0,
        pageRotationDeg: 90,
      };
    };

    const bytes = await buildPass(sheets, (s) => s.front, { mode: "precut" }, fieldNotes, 3, lookup, 0, [0]);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(1);
    const [page] = out.getPages();
    // Sheet is 2x page width by page height, in points.
    expect(page.getWidth()).toBeCloseTo((fieldNotes.widthMm * 2 * 72) / 25.4, 1);
    expect(page.getHeight()).toBeCloseTo((fieldNotes.heightMm * 72) / 25.4, 1);
  });
});
