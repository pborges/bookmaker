import { describe, expect, it } from "vitest";
import { dominantInkRunHeight, inkBoundingBox, padBBox, type PixelBuffer } from "./raster";

function makeBuffer(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  // fill white, fully opaque
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function setPixel(buf: PixelBuffer, x: number, y: number, gray: number) {
  const i = (y * buf.width + x) * 4;
  buf.data[i] = gray;
  buf.data[i + 1] = gray;
  buf.data[i + 2] = gray;
  buf.data[i + 3] = 255;
}

describe("inkBoundingBox", () => {
  it("returns null for a blank page", () => {
    const buf = makeBuffer(10, 10);
    expect(inkBoundingBox(buf)).toBeNull();
  });

  it("finds the bounding box of dark pixels", () => {
    const buf = makeBuffer(20, 20);
    setPixel(buf, 5, 5, 0);
    setPixel(buf, 12, 8, 0);
    setPixel(buf, 3, 15, 0);
    const box = inkBoundingBox(buf);
    expect(box).toEqual({ minX: 3, minY: 5, maxX: 12, maxY: 15 });
  });

  it("ignores transparent pixels", () => {
    const buf = makeBuffer(10, 10);
    const i = (5 * 10 + 5) * 4;
    buf.data[i] = 0;
    buf.data[i + 1] = 0;
    buf.data[i + 2] = 0;
    buf.data[i + 3] = 0; // transparent
    expect(inkBoundingBox(buf)).toBeNull();
  });

  it("respects the threshold", () => {
    const buf = makeBuffer(10, 10);
    setPixel(buf, 5, 5, 240); // light gray, above default threshold(250) means darker than 250 -> counts
    const boxDefault = inkBoundingBox(buf);
    expect(boxDefault).toEqual({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
    const boxStrict = inkBoundingBox(buf, 100);
    expect(boxStrict).toBeNull();
  });
});

describe("padBBox", () => {
  it("expands and clamps to bounds", () => {
    const box = { minX: 2, minY: 2, maxX: 5, maxY: 5 };
    expect(padBBox(box, 3, 10, 10)).toEqual({ minX: 0, minY: 0, maxX: 8, maxY: 8 });
  });

  it("clamps against the upper edge", () => {
    const box = { minX: 8, minY: 8, maxX: 9, maxY: 9 };
    expect(padBBox(box, 5, 10, 10)).toEqual({ minX: 3, minY: 3, maxX: 9, maxY: 9 });
  });
});

describe("dominantInkRunHeight", () => {
  it("returns null for a blank page", () => {
    const buf = makeBuffer(10, 10);
    expect(dominantInkRunHeight(buf)).toBeNull();
  });

  it("picks the most common vertical run height", () => {
    const buf = makeBuffer(30, 30);
    // Several columns with a run of height 4 (the mode)...
    for (const x of [1, 2, 3, 4, 5]) {
      for (let y = 10; y < 14; y++) setPixel(buf, x, y, 0);
    }
    // ...and one column with a run of height 10 (outlier).
    for (let y = 0; y < 10; y++) setPixel(buf, 20, y, 0);

    expect(dominantInkRunHeight(buf)).toBe(4);
  });
});
