// Builds the print-ready Fronts/Backs PDFs with pdf-lib, using the same
// geometry math the sheet-view UI uses to preview placement.

import { PDFDocument, degrees, rgb } from "pdf-lib";
import { computeSheetGeometry, sewStationOffsets, showsSewGuide, type Rect } from "./geometry";
import { impose, type Sheet } from "./imposition";
import type { CoverPageRef, CoverPages, Media, SewGuide, Size } from "./model";
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

export interface SewGuidePassConfig {
  sewGuide: SewGuide;
  side: "front" | "back";
}

/**
 * The imposition math is easiest to reason about as a two-up landscape
 * sheet, but printers fed short-edge-first need a genuinely portrait PDF
 * page. Wrap each completed landscape sheet in a portrait MediaBox and turn
 * the artwork inside it. This avoids relying on print-dialog orientation or
 * a PDF /Rotate hint, both of which some drivers ignore.
 */
export function computePortraitSheetPlacement(
  sheetWidthPt: number,
  sheetHeightPt: number,
  rotationDeg: 0 | 180,
): { pageWidthPt: number; pageHeightPt: number; x: number; y: number; rotateDeg: 90 | 270 } {
  return rotationDeg === 0
    ? {
        pageWidthPt: sheetHeightPt,
        pageHeightPt: sheetWidthPt,
        x: 0,
        y: sheetWidthPt,
        rotateDeg: 270,
      }
    : {
        pageWidthPt: sheetHeightPt,
        pageHeightPt: sheetWidthPt,
        x: sheetHeightPt,
        y: 0,
        rotateDeg: 90,
      };
}

async function saveAsPortraitSheets(layout: PDFDocument, rotationDeg: 0 | 180): Promise<Uint8Array> {
  // Reopen the completed layout before embedding it. Embedding pages directly
  // from a still-mutating document can leave cross-document XObject references
  // that pdf-lib accepts but strict PDF renderers reject.
  const source = await PDFDocument.load(await layout.save());
  const output = await PDFDocument.create();
  const embeddedSheets = await output.embedPages(source.getPages());

  for (const sheet of embeddedSheets) {
    const placement = computePortraitSheetPlacement(sheet.width, sheet.height, rotationDeg);
    const page = output.addPage([placement.pageWidthPt, placement.pageHeightPt]);
    page.drawPage(sheet, {
      x: placement.x,
      y: placement.y,
      rotate: degrees(placement.rotateDeg),
    });
  }

  return output.save();
}

export async function buildPass(
  sheets: Sheet[],
  sheetSides: (sheet: Sheet) => { left: number; right: number },
  media: Media,
  pageSize: Size,
  bindingMarginMm: number,
  lookup: PageLookup,
  rotationDeg: 0 | 180,
  sheetOrder: number[],
  sewGuideConfig?: SewGuidePassConfig,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const geo = computeSheetGeometry(media, pageSize, bindingMarginMm);
  const embeddedCache = new Map<string, Awaited<ReturnType<typeof out.embedPdf>>[number]>();

  for (const sheetIndex of sheetOrder) {
    const sheet = sheets[sheetIndex];
    const sides = sheetSides(sheet);
    const outPage = out.addPage([mmToPt(geo.sheetSize.widthMm), mmToPt(geo.sheetSize.heightMm)]);
    // pdf-lib cannot embed a page with no /Contents entry. Give even a fully
    // blank imposed sheet an invisible content stream so it can be wrapped
    // in the final portrait page below.
    outPage.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0 });

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

    if (sewGuideConfig && showsSewGuide(sewGuideConfig.sewGuide, sheet, sewGuideConfig.side, sheets.length)) {
      drawSewGuide(outPage, geo.foldX, geo.left.y, pageSize.heightMm, sewGuideConfig.sewGuide.stations);
    }
  }

  return saveAsPortraitSheets(out, rotationDeg);
}

/**
 * Draws the dotted pamphlet-stitch guide down the centre fold, with heavier
 * dots at the station marks. Spans exactly the trimmed page height so it
 * never runs into the trim area (PLAN.md §5).
 */
function drawSewGuide(
  outPage: import("pdf-lib").PDFPage,
  foldXMm: number,
  pageTopYMm: number,
  trimmedHeightMm: number,
  stations: 0 | 3 | 5,
): void {
  const pageHeightPt = outPage.getHeight();
  const xPt = mmToPt(foldXMm);
  const topPt = pageHeightPt - mmToPt(pageTopYMm);
  const bottomPt = pageHeightPt - mmToPt(pageTopYMm + trimmedHeightMm);
  const guideColor = rgb(0.6, 0.6, 0.6);

  outPage.drawLine({
    start: { x: xPt, y: topPt },
    end: { x: xPt, y: bottomPt },
    thickness: 0.75,
    color: guideColor,
    dashArray: [1.5, 2.5],
    opacity: 0.85,
  });

  for (const offsetMm of sewStationOffsets(trimmedHeightMm, stations)) {
    outPage.drawCircle({
      x: xPt,
      y: pageHeightPt - mmToPt(pageTopYMm + offsetMm),
      size: mmToPt(0.6),
      color: guideColor,
      opacity: 0.9,
    });
  }
}

export interface PagePlacement {
  x: number;
  y: number;
  scale: number;
  /** CCW degrees, as pdf-lib's `rotate` expects — see computePagePlacement. */
  rotateDeg: number;
}

/**
 * Computes where to place an embedded source page (pdf-lib's `drawPage` x/y/
 * scale/rotate) so it fits centred in `rect`, rotated by `rotationDeg`
 * clockwise first. Pure and independently testable on purpose: this is
 * exactly the kind of geometry that looks right at rotation 0 and is silently
 * wrong everywhere else, so it needs numeric regression coverage, not just a
 * "did it throw" test.
 *
 * pdf-lib's `drawPage` composes translate(x,y) → rotate(θ) → scale in that
 * order, and `rotate` turns counter-clockwise for positive θ — while
 * `rotationDeg` here is clockwise, matching the CSS `rotate()` the on-screen
 * preview uses. Two things fall out of that:
 *  - a "90° clockwise" request is θ=270° as far as pdf-lib's matrix is
 *    concerned (ccwDeg below), and
 *  - the source-space corner that must land at the target's bottom-left
 *    moves as θ changes, and that pivot has to be *scaled and rotated*
 *    before subtracting it back out of the target point — subtracting the
 *    unrotated pivot only happens to work at θ=0.
 */
export function computePagePlacement(
  rect: Rect,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  rotationDeg: PageRotation,
  pageHeightPt: number,
): PagePlacement {
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
  const targetX = mmToPt(rect.x) + offsetX;
  const targetY = pageHeightPt - mmToPt(rect.y) - targetHeightPt + offsetY;

  const ccwDeg = (360 - rotationDeg) % 360;

  // The source-space corner that rotates onto the target box's bottom-left,
  // derived by rotating a unit box CCW by ccwDeg and finding which corner
  // lands at the new bottom-left.
  const pivot =
    ccwDeg === 90
      ? { x: box.minX, y: box.maxY }
      : ccwDeg === 180
        ? { x: box.maxX, y: box.maxY }
        : ccwDeg === 270
          ? { x: box.maxX, y: box.minY }
          : { x: box.minX, y: box.minY };

  const theta = (ccwDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const scaledPivotX = pivot.x * scale;
  const scaledPivotY = pivot.y * scale;
  const rotatedPivotX = scaledPivotX * cos - scaledPivotY * sin;
  const rotatedPivotY = scaledPivotX * sin + scaledPivotY * cos;

  return {
    x: targetX - rotatedPivotX,
    y: targetY - rotatedPivotY,
    scale,
    rotateDeg: ccwDeg,
  };
}

function drawEmbeddedPage(
  outPage: import("pdf-lib").PDFPage,
  embedded: Awaited<ReturnType<PDFDocument["embedPdf"]>>[number],
  rect: Rect,
  cropBoxPt: { minX: number; minY: number; maxX: number; maxY: number } | undefined,
  rotationDeg: PageRotation,
): void {
  const box = cropBoxPt ?? { minX: 0, minY: 0, maxX: embedded.width, maxY: embedded.height };
  const placement = computePagePlacement(rect, box, rotationDeg, outPage.getHeight());

  outPage.drawPage(embedded, {
    x: placement.x,
    y: placement.y,
    xScale: placement.scale,
    yScale: placement.scale,
    rotate: degrees(placement.rotateDeg),
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
  sewGuide: SewGuide,
): Promise<ExportResult> {
  const forwardOrder = sheets.map((_, i) => i);
  const backOrder = orderedBackIndices(sheets.length, backsPlan.order);

  const frontsPdf = await buildPass(sheets, (s) => s.front, media, pageSize, bindingMarginMm, lookup, 0, forwardOrder, {
    sewGuide,
    side: "front",
  });
  const backsPdf = await buildPass(
    sheets,
    (s) => s.back,
    media,
    pageSize,
    bindingMarginMm,
    lookup,
    backsPlan.rotationDeg,
    backOrder,
    { sewGuide, side: "back" },
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
