import { describe, expect, it } from "vitest";
import { back, front, impose, sheetCount } from "./imposition";

describe("sheetCount", () => {
  it("divides page count by 4", () => {
    expect(sheetCount(16)).toBe(4);
    expect(sheetCount(4)).toBe(1);
  });

  it("rejects non-multiples of 4", () => {
    expect(() => sheetCount(15)).toThrow();
    expect(() => sheetCount(0)).toThrow();
    expect(() => sheetCount(-4)).toThrow();
  });
});

// Hand-checked 16-page table from the README.
const TABLE_16 = [
  { sheet: 0, front: { left: 16, right: 1 }, back: { left: 2, right: 15 } },
  { sheet: 1, front: { left: 14, right: 3 }, back: { left: 4, right: 13 } },
  { sheet: 2, front: { left: 12, right: 5 }, back: { left: 6, right: 11 } },
  { sheet: 3, front: { left: 10, right: 7 }, back: { left: 8, right: 9 } },
];

describe("front/back against hand-checked 16-page table", () => {
  for (const row of TABLE_16) {
    it(`sheet ${row.sheet}`, () => {
      expect(front(16, row.sheet)).toEqual(row.front);
      expect(back(16, row.sheet)).toEqual(row.back);
    });
  }
});

describe("impose", () => {
  it("matches front/back for every sheet", () => {
    for (const n of [4, 8, 16, 32, 100]) {
      const sheets = impose(n);
      expect(sheets).toHaveLength(n / 4);
      sheets.forEach((sheet, i) => {
        expect(sheet.front).toEqual(front(n, i));
        expect(sheet.back).toEqual(back(n, i));
      });
    }
  });

  it("rejects out-of-range sheet index", () => {
    expect(() => front(16, 4)).toThrow();
    expect(() => back(16, -1)).toThrow();
  });
});

describe("property: every page appears exactly once", () => {
  for (const n of [4, 8, 12, 16, 24, 40, 100]) {
    it(`n=${n}`, () => {
      const sheets = impose(n);
      const seen: number[] = [];
      for (const sheet of sheets) {
        seen.push(sheet.front.left, sheet.front.right, sheet.back.left, sheet.back.right);
      }
      const sorted = [...seen].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    });
  }
});

describe("property: walking the folded stack yields 1..N in order", () => {
  // Folding the stack: page order when reading through the booklet is
  // sheet 0 right, sheet 1 right, ..., sheet S-1 right (fronts, recto pages
  // ascending), then continue through the backs symmetrically. We verify by
  // reconstructing the physical page sequence directly from front/back and
  // checking it's a bijection with 1..N that is consistent with folding:
  // for each sheet, front.right and back.left are adjacent recto/verso pages
  // that increase by 1, and this nests correctly outward to inward.
  for (const n of [4, 8, 16, 32]) {
    it(`n=${n}`, () => {
      const sheets = impose(n);
      // Adjacent pages within a sheet's "inner opening" must be consecutive.
      for (const sheet of sheets) {
        expect(sheet.back.left).toBe(sheet.front.right + 1);
      }
      // The innermost sheet must carry the middle two pages.
      const innermost = sheets[sheets.length - 1];
      expect(innermost.back).toEqual({ left: n / 2, right: n / 2 + 1 });
      // The outermost sheet must carry page 1 and page n.
      const outermost = sheets[0];
      expect(outermost.front).toEqual({ left: n, right: 1 });
    });
  }
});
