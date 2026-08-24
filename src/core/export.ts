// Builds the print-ready Fronts/Backs PDFs with pdf-lib, using the same
// geometry math the sheet-view UI uses to preview placement.

import { PDFDocument, degrees } from "pdf-lib";
import { computeSheetGeometry, type Rect } from "./geometry";
import { impose, type Sheet } from "./imposition";
import type { CoverPageRef, CoverPages, Media, Size } from "./model";
import type { PageRotation } from "./pages";
import { orderedBackIndices, type BacksPlan } from "./printerProfile";

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number) => mm * PT_PER_MM;

export interface PlacedPage {
  /** Book page number (1-indexed), or null for a blank page. */
  bookPageNumber: number | null;
  sourceBytes?: ArrayBuffer;
  sourcePageIndex?: number; // 0-indexed, within sourceBytes' document
  /** Crop box in source PDF points; omit to use the full page. */
  cropBoxPt?: { minX: number; minY: number; maxX: number; maxY: number };
  /** Clockwise rotation to apply to this page before placing it — distinct
   * from the whole-sheet `rotationDeg` a Backs pass may apply below. */
  pageRotationDeg?: PageRotation;
}

export type PageLookup = (bookPageNumber: number) => PlacedPage;

export async function buildPass(
  sheets: Sheet[],
  sheetSides: (sheet: Sheet) => { left: number; right: number },
  media: Media,
  pageSize: Size,
  bindingMarginMm: number,
  lookup: PageLookup,
  rotationDeg: 0 | 180,
  sheetOrder: number[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const geo = computeSheetGeometry(media, pageSize, bindingMarginMm);
  const embeddedCache = new Map<string, Awaited<ReturnType<typeof out.embedPdf>>[number]>();

  for (const sheetIndex of sheetOrder) {
    const sheet = sheets[sheetIndex];
    const sides = sheetSides(sheet);
    const outPage = out.addPage([mmToPt(geo.sheetSize.widthMm), mmToPt(geo.sheetSize.heightMm)]);

    for (const [side, pageNumber] of [
      ["left", sides.left],
      ["right", sides.right],
    ] as const) {
      const placed = lookup(pageNumber);
      const rect = side === "left" ? geo.left : geo.right;
      if (placed.bookPageNumber === null || !placed.sourceBytes || placed.sourcePageIndex === undefined) {
        continue; // blank page: nothing to draw
      }

      const cacheKey = side + ":" + pageNumber;
      let embedded = embeddedCache.get(cacheKey);
      if (!embedded) {
        const srcDoc = await PDFDocument.load(placed.sourceBytes);
        const [copiedPage] = await out.embedPdf(srcDoc, [placed.sourcePageIndex]);
        embedded = copiedPage;
        embeddedCache.set(cacheKey, embedded);
      }

      drawEmbeddedPage(outPage, embedded, rect, placed.cropBoxPt, placed.pageRotationDeg ?? 0);
    }

    if (rotationDeg === 180) {
      outPage.setRotation(degrees(180));
    }
  }

  return out.save();
}

/**
 * Places an embedded source page into `rect`, scaled to fit and centred, with
 * an optional clockwise rotation applied first. `pdf-lib`'s `drawPage`
 * rotates around the (x, y) point passed to it, in the same
 * translate → rotate → scale order every time — so the source-space point
 * that must land at that pivot changes with the rotation (see the corner
 * table below). Working through the four cases by hand for a unit box is the
 * easiest way to have confidence in the offsets.
 */
function drawEmbeddedPage(
  outPage: import("pdf-lib").PDFPage,
  embedded: Awaited<ReturnType<PDFDocument["embedPdf"]>>[number],
  rect: Rect,
  cropBoxPt: { minX: number; minY: number; maxX: number; maxY: number } | undefined,
  rotationDeg: PageRotation,
): void {
  const box = cropBoxPt ?? { minX: 0, minY: 0, maxX: embedded.width, maxY: embedded.height };
  const srcWidth = box.maxX - box.minX;
  const srcHeight = box.maxY - box.minY;
  const rotated = rotationDeg === 90 || rotationDeg === 270;
  const effWidth = rotated ? srcHeight : srcWidth;
  const effHeight = rotated ? srcWidth : srcHeight;

  const targetWidthPt = mmToPt(rect.width);
  const targetHeightPt = mmToPt(rect.height);
  const scale = Math.min(targetWidthPt / effWidth, targetHeightPt / effHeight);

  const drawWidth = effWidth * scale;
  const drawHeight = effHeight * scale;
  const offsetX = (targetWidthPt - drawWidth) / 2;
  const offsetY = (targetHeightPt - drawHeight) / 2;

  // pdf-lib's y axis grows upward from the bottom; our rects use a top-left
  // origin in mm, so flip.
  const pageHeightPt = outPage.getHeight();
  const targetX = mmToPt(rect.x) + offsetX;
  const targetY = pageHeightPt - mmToPt(rect.y) - targetHeightPt + offsetY;

  // The source-space corner that rotates onto the target box's bottom-left.
  const pivot =
    rotationDeg === 90
      ? { x: box.minX, y: box.maxY }
      : rotationDeg === 180
        ? { x: box.maxX, y: box.maxY }
        : rotationDeg === 270
          ? { x: box.maxX, y: box.minY }
          : { x: box.minX, y: box.minY };

  outPage.drawPage(embedded, {
    x: targetX - pivot.x * scale,
    y: targetY - pivot.y * scale,
    xScale: scale,
    yScale: scale,
    rotate: degrees(rotationDeg),
  });
}

export interface ExportResult {
  frontsPdf: Uint8Array;
  backsPdf: Uint8Array;
}

export async function exportBooklet(
  sheets: Sheet[],
  media: Media,
  pageSize: Size,
  bindingMarginMm: number,
  lookup: PageLookup,
  backsPlan: BacksPlan,
): Promise<ExportResult> {
  const forwardOrder = sheets.map((_, i) => i);
  const backOrder = orderedBackIndices(sheets.length, backsPlan.order);

  const frontsPdf = await buildPass(sheets, (s) => s.front, media, pageSize, bindingMarginMm, lookup, 0, forwardOrder);
  const backsPdf = await buildPass(
    sheets,
    (s) => s.back,
    media,
    pageSize,
    bindingMarginMm,
    lookup,
    backsPlan.rotationDeg,
    backOrder,
  );

  return { frontsPdf, backsPdf };
}

/**
 * Separate-wrap cover: a single folded sheet, imposed like a 4-page
 * signature (page 1 = outside front, 2 = inside front, 3 = inside back,
 * 4 = outside back — see imposition front(4,0)/back(4,0)). Printed as one
 * two-page duplex PDF rather than a Fronts/Backs pair, since there's only
 * one physical sheet and no reload-flip ambiguity to resolve.
 */
export async function exportCover(
  media: Media,
  pageSize: Size,
  bindingMarginMm: number,
  coverPages: CoverPages,
  getSourceBytes: (sourceId: string) => Promise<ArrayBuffer | undefined>,
): Promise<Uint8Array> {
  const [coverSheet] = impose(4);
  const refByPageNumber: Record<number, CoverPageRef | null> = {
    1: coverPages.outsideFront,
    2: coverPages.insideFront,
    3: coverPages.insideBack,
    4: coverPages.outsideBack,
  };

  const byteCache = new Map<string, ArrayBuffer>();
  for (const ref of Object.values(refByPageNumber)) {
    if (ref && !byteCache.has(ref.sourceId)) {
      const bytes = await getSourceBytes(ref.sourceId);
      if (bytes) byteCache.set(ref.sourceId, bytes);
    }
  }

  const lookup: PageLookup = (pageNumber) => {
    const ref = refByPageNumber[pageNumber];
    if (!ref) return { bookPageNumber: null };
    return { bookPageNumber: pageNumber, sourceBytes: byteCache.get(ref.sourceId), sourcePageIndex: ref.sourcePage };
  };

  const frontPdf = await buildPass([coverSheet], (s) => s.front, media, pageSize, bindingMarginMm, lookup, 0, [0]);
  const backPdf = await buildPass([coverSheet], (s) => s.back, media, pageSize, bindingMarginMm, lookup, 0, [0]);

  const merged = await PDFDocument.create();
  for (const passBytes of [frontPdf, backPdf]) {
    const doc = await PDFDocument.load(passBytes);
    const [page] = await merged.copyPages(doc, [0]);
    merged.addPage(page);
  }
  return merged.save();
}
