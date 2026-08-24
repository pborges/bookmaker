// Pure placement math for a single sheet side: given the media mode, page
// size, and a page's crop box, compute where each half's page box sits on
// the physical sheet, in millimetres with origin at the sheet's top-left.

import type { Sheet } from "./imposition";
import type { Media, SewGuide, Size } from "./model";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetGeometry {
  sheetSize: Size; // landscape, mm
  foldX: number; // mm from left edge, sheet centre
  left: Rect; // page box for the left half
  right: Rect; // page box for the right half
}

const STOCK_SIZES: Record<"letter" | "a4", Size> = {
  // fed landscape
  letter: { widthMm: 279.4, heightMm: 215.9 },
  a4: { widthMm: 297, heightMm: 210 },
};

export function stockSize(stock: "letter" | "a4" | Size): Size {
  if (typeof stock === "string") return STOCK_SIZES[stock];
  return stock;
}

/**
 * Computes the sheet size and the two page-box rects for one sheet side.
 * `bindingMarginMm` shifts each page box away from the fold, precut mode
 * only (trim mode already places pages flush against the fold by design).
 */
export function computeSheetGeometry(
  media: Media,
  pageSize: Size,
  bindingMarginMm: number,
): SheetGeometry {
  if (media.mode === "precut") {
    const sheetSize: Size = { widthMm: pageSize.widthMm * 2, heightMm: pageSize.heightMm };
    const foldX = pageSize.widthMm;
    const left: Rect = {
      x: bindingMarginMm,
      y: 0,
      width: pageSize.widthMm - bindingMarginMm,
      height: pageSize.heightMm,
    };
    const right: Rect = {
      x: foldX,
      y: 0,
      width: pageSize.widthMm - bindingMarginMm,
      height: pageSize.heightMm,
    };
    return { sheetSize, foldX, left, right };
  }

  const sheet = stockSize(media.stock);
  const halfWidth = sheet.widthMm / 2;
  if (pageSize.widthMm > halfWidth) {
    throw new Error(
      `Page width ${pageSize.widthMm}mm exceeds half the stock width (${halfWidth}mm max for this stock).`,
    );
  }
  if (pageSize.heightMm > sheet.heightMm) {
    throw new Error(
      `Page height ${pageSize.heightMm}mm exceeds the stock height (${sheet.heightMm}mm max for this stock).`,
    );
  }
  const foldX = halfWidth;
  const centredY = (sheet.heightMm - pageSize.heightMm) / 2;
  // Flush against the fold, centred vertically; waste falls on head/tail/fore-edge.
  const left: Rect = {
    x: foldX - pageSize.widthMm,
    y: centredY,
    width: pageSize.widthMm,
    height: pageSize.heightMm,
  };
  const right: Rect = {
    x: foldX,
    y: centredY,
    width: pageSize.widthMm,
    height: pageSize.heightMm,
  };
  return { sheetSize: sheet, foldX, left, right };
}

/** Creep shift: inner sheets protrude further, so shift toward the fold. */
export function creepShiftMm(sheetIndex: number, callipersMm: number, k = 1): number {
  return sheetIndex * callipersMm * k;
}

export function applyCreepShift(rect: Rect, shiftMm: number, side: "left" | "right"): Rect {
  // Shifting "toward the fold" means +x for the left half, -x for the right half.
  const dx = side === "left" ? shiftMm : -shiftMm;
  return { ...rect, x: rect.x + dx };
}

/** Sew-guide station y-offsets (mm from the top of the trimmed page), per PLAN.md §5. */
export function sewStationOffsets(trimmedHeightMm: number, stations: 0 | 3 | 5): number[] {
  const h = trimmedHeightMm;
  if (stations === 0) return [];
  if (stations === 3) return [h / 2 - h / 4, h / 2, h / 2 + h / 4];
  return [h / 2 - h / 3, h / 2 - h / 6, h / 2, h / 2 + h / 6, h / 2 + h / 3];
}

/**
 * Whether this sheet/side should carry the sew guide, per PLAN.md §5. Shared
 * between the sheet-view preview and the PDF export so they never drift.
 */
export function showsSewGuide(sewGuide: SewGuide, sheet: Sheet, side: "front" | "back", sheetCount: number): boolean {
  if (sewGuide.line === "none") return false;
  if (sewGuide.line === "all") return true;
  // 'innermost': the spread facing you when the folded block is opened to
  // its centre — sheet S-1, back side.
  return side === "back" && sheet.index === sheetCount - 1;
}
