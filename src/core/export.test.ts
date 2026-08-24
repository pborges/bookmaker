import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPass, computePagePlacement, exportCover, type PlacedPage } from "./export";
import { computeSheetGeometry } from "./geometry";
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

const PT_PER_MM = 72 / 25.4;

/**
 * Independent re-implementation of what pdf-lib's drawPage actually does
 * with (x, y, scale, rotateDeg): translate(x,y) ∘ rotate(rotateDeg, CCW) ∘
 * scale. Used to check computePagePlacement's output geometrically instead
 * of re-deriving (and risking re-copying the same bug into) its internals.
 */
function applyPlacement(p: { x: number; y: number; scale: number; rotateDeg: number }, point: { x: number; y: number }) {
  const theta = (p.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const sx = point.x * p.scale;
  const sy = point.y * p.scale;
  return {
    x: p.x + (sx * cos - sy * sin),
    y: p.y + (sx * sin + sy * cos),
  };
}

describe("computePagePlacement", () => {
  // A 200x300pt portrait source, placed into the fieldNotes-with-3mm-margin
  // "right" half of a precut sheet (matches buildPass's real geometry).
  const box = { minX: 0, minY: 0, maxX: 200, maxY: 300 };
  const geo = computeSheetGeometry({ mode: "precut" }, fieldNotes, 3);
  const pageHeightPt = fieldNotes.heightMm * PT_PER_MM;

  it("matches a hand-computed placement for a 90° clockwise rotation", () => {
    // Derived by hand: scale = min(targetW/srcHeight, targetH/srcWidth),
    // pivot = box's bottom-right corner (the one that lands at the target's
    // bottom-left after a 90° CW turn), rotated+scaled before subtracting.
    const placement = computePagePlacement(geo.right, box, 90, pageHeightPt);
    expect(placement.scale).toBeCloseTo(0.8117, 3);
    expect(placement.rotateDeg).toBe(270); // pdf-lib rotates CCW; 90° CW == 270° CCW
    expect(placement.x).toBeCloseTo(252.04, 1);
    expect(placement.y).toBeCloseTo(279.18, 1);
  });

  it.each([0, 90, 180, 270] as const)(
    "fits the rotated box exactly inside the target rect at rotation %i°",
    (rotationDeg) => {
      const rect = geo.right;
      const placement = computePagePlacement(rect, box, rotationDeg, pageHeightPt);

      const corners = [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.minX, y: box.maxY },
        { x: box.maxX, y: box.maxY },
      ].map((c) => applyPlacement(placement, c));

      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const targetWidthPt = rect.width * PT_PER_MM;
      const targetHeightPt = rect.height * PT_PER_MM;
      const targetXPt = rect.x * PT_PER_MM;
      // rect.y is 0 for both halves in precut mode, so the target's bottom
      // edge in pdf-lib's y-up space is pageHeightPt - targetHeightPt.
      const targetYPt = pageHeightPt - rect.y * PT_PER_MM - targetHeightPt;

      const rotated = rotationDeg === 90 || rotationDeg === 270;
      const expectedBoxWidth = (rotated ? box.maxY - box.minY : box.maxX - box.minX) * placement.scale;
      const expectedBoxHeight = (rotated ? box.maxX - box.minX : box.maxY - box.minY) * placement.scale;

      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(expectedBoxWidth, 1);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(expectedBoxHeight, 1);
      // Centred within the target rect, not just somewhere within it.
      expect(Math.min(...xs) - targetXPt).toBeCloseTo(targetXPt + targetWidthPt - Math.max(...xs), 1);
      expect(Math.min(...ys) - targetYPt).toBeCloseTo(targetYPt + targetHeightPt - Math.max(...ys), 1);
    },
  );
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
