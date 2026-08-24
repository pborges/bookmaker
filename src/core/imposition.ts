// Single-signature imposition: N pages (multiple of 4), S = N/4 sheets.
// Sheet 0 is outermost. front(i)/back(i) give the book page numbers (1-indexed)
// placed on each half of that sheet side.

export interface SheetSide {
  left: number;
  right: number;
}

export function sheetCount(pageCount: number): number {
  if (pageCount <= 0 || pageCount % 4 !== 0) {
    throw new Error(`pageCount must be a positive multiple of 4, got ${pageCount}`);
  }
  return pageCount / 4;
}

export function front(pageCount: number, sheetIndex: number): SheetSide {
  const s = sheetCount(pageCount);
  if (sheetIndex < 0 || sheetIndex >= s) {
    throw new Error(`sheetIndex ${sheetIndex} out of range for ${s} sheets`);
  }
  const n = pageCount;
  return { left: n - 2 * sheetIndex, right: 2 * sheetIndex + 1 };
}

export function back(pageCount: number, sheetIndex: number): SheetSide {
  const s = sheetCount(pageCount);
  if (sheetIndex < 0 || sheetIndex >= s) {
    throw new Error(`sheetIndex ${sheetIndex} out of range for ${s} sheets`);
  }
  const n = pageCount;
  return { left: 2 * sheetIndex + 2, right: n - 2 * sheetIndex - 1 };
}

export interface Sheet {
  index: number;
  front: SheetSide;
  back: SheetSide;
}

export function impose(pageCount: number): Sheet[] {
  const s = sheetCount(pageCount);
  const sheets: Sheet[] = [];
  for (let i = 0; i < s; i++) {
    sheets.push({ index: i, front: front(pageCount, i), back: back(pageCount, i) });
  }
  return sheets;
}
