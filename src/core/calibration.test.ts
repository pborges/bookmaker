import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateCalibrationSheet } from "./calibration";
import { PAGE_SIZE_PRESETS } from "./model";

const PT_PER_MM = 72 / 25.4;

describe("generateCalibrationSheet", () => {
  const pageSizes = [...Object.entries(PAGE_SIZE_PRESETS), ["custom", { widthMm: 100, heightMm: 150 }]] as const;

  it.each(pageSizes)("matches the portrait pre-cut sheet for %s", async (_, size) => {
    const bytes = await generateCalibrationSheet({ mode: "precut" }, size);
    const [page] = (await PDFDocument.load(bytes)).getPages();

    expect(page.getWidth()).toBeCloseTo(size.heightMm * PT_PER_MM, 1);
    expect(page.getHeight()).toBeCloseTo(size.widthMm * 2 * PT_PER_MM, 1);
    expect(page.getWidth()).toBeLessThan(page.getHeight());
    expect(page.getRotation().angle).toBe(0);
  });

  it("matches portrait US Letter when printing standard stock", async () => {
    const bytes = await generateCalibrationSheet({ mode: "trim", stock: "letter" }, PAGE_SIZE_PRESETS.a6);
    const [page] = (await PDFDocument.load(bytes)).getPages();

    expect(page.getWidth()).toBeCloseTo(215.9 * PT_PER_MM, 1);
    expect(page.getHeight()).toBeCloseTo(279.4 * PT_PER_MM, 1);
    expect(page.getRotation().angle).toBe(0);
  });
});
