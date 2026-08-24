import { describe, expect, it } from "vitest";
import {
  applyCreepShift,
  computeSheetGeometry,
  creepShiftMm,
  sewStationOffsets,
  stockSize,
} from "./geometry";

const fieldNotes = { widthMm: 88.9, heightMm: 139.7 };

describe("computeSheetGeometry precut mode", () => {
  it("sizes the sheet to 2x page width", () => {
    const geo = computeSheetGeometry({ mode: "precut" }, fieldNotes, 0);
    expect(geo.sheetSize).toEqual({ widthMm: 177.8, heightMm: 139.7 });
    expect(geo.foldX).toBe(88.9);
  });

  it("applies the binding margin only at the fold edge", () => {
    const geo = computeSheetGeometry({ mode: "precut" }, fieldNotes, 3);
    expect(geo.left).toEqual({ x: 3, y: 0, width: 85.9, height: 139.7 });
    expect(geo.right).toEqual({ x: 88.9, y: 0, width: 85.9, height: 139.7 });
  });
});

describe("computeSheetGeometry trim mode", () => {
  it("places pages flush against the fold, centred vertically", () => {
    const geo = computeSheetGeometry({ mode: "trim", stock: "letter" }, fieldNotes, 0);
    expect(geo.sheetSize).toEqual(stockSize("letter"));
    expect(geo.foldX).toBeCloseTo(139.7);
    expect(geo.left.x + geo.left.width).toBeCloseTo(geo.foldX);
    expect(geo.right.x).toBeCloseTo(geo.foldX);
    const expectedY = (215.9 - 139.7) / 2;
    expect(geo.left.y).toBeCloseTo(expectedY);
    expect(geo.right.y).toBeCloseTo(expectedY);
  });

  it("rejects a page wider than half the stock", () => {
    expect(() =>
      computeSheetGeometry({ mode: "trim", stock: "letter" }, { widthMm: 200, heightMm: 100 }, 0),
    ).toThrow(/exceeds half the stock width/);
  });

  it("rejects a page taller than the stock", () => {
    expect(() =>
      computeSheetGeometry({ mode: "trim", stock: "letter" }, { widthMm: 50, heightMm: 300 }, 0),
    ).toThrow(/exceeds the stock height/);
  });
});

describe("creep", () => {
  it("increases with sheet index", () => {
    expect(creepShiftMm(0, 0.12)).toBe(0);
    expect(creepShiftMm(3, 0.12)).toBeCloseTo(0.36);
  });

  it("shifts left rects toward positive x and right rects toward negative x", () => {
    const rect = { x: 10, y: 0, width: 50, height: 50 };
    expect(applyCreepShift(rect, 1, "left").x).toBe(11);
    expect(applyCreepShift(rect, 1, "right").x).toBe(9);
  });
});

describe("sewStationOffsets", () => {
  it("returns nothing for 0 stations", () => {
    expect(sewStationOffsets(100, 0)).toEqual([]);
  });

  it("computes 3-station offsets", () => {
    expect(sewStationOffsets(100, 3)).toEqual([25, 50, 75]);
  });

  it("computes 5-station offsets symmetric about the midpoint", () => {
    const offsets = sewStationOffsets(120, 5);
    expect(offsets[2]).toBe(60);
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => {
      expect(o).toBeCloseTo(120 - offsets[offsets.length - 1 - i]);
    });
  });
});
