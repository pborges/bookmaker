// Pure raster-analysis helpers, operating on RGBA pixel buffers. Kept free
// of any canvas/DOM/pdf.js dependency so they're unit-testable with
// synthetic buffers.

export interface PixelBuffer {
  data: Uint8ClampedArray; // RGBA, length = width * height * 4
  width: number;
  height: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A pixel counts as "ink" if it's darker than `threshold` (0-255, luminance).
 * Returns null if the page is entirely blank.
 */
export function inkBoundingBox(buf: PixelBuffer, threshold = 250): BBox | null {
  const { data, width, height } = buf;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

/** Expands a bbox by `paddingPx` on every side, clamped to the buffer bounds. */
export function padBBox(box: BBox, paddingPx: number, width: number, height: number): BBox {
  return {
    minX: Math.max(0, box.minX - paddingPx),
    minY: Math.max(0, box.minY - paddingPx),
    maxX: Math.min(width - 1, box.maxX + paddingPx),
    maxY: Math.min(height - 1, box.maxY + paddingPx),
  };
}

/**
 * Estimates dominant text height in pixels: scans each column-run of ink
 * rows, measuring the height of vertically-connected ink runs per column,
 * then takes the mode of a coarse histogram. A cheap proxy for "typical
 * glyph height" without full connected-component labelling.
 */
export function dominantInkRunHeight(buf: PixelBuffer, threshold = 250): number | null {
  const { data, width, height } = buf;
  const isInk = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4;
    const a = data[i + 3];
    if (a === 0) return false;
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return luminance < threshold;
  };

  const histogram = new Map<number, number>();

  for (let x = 0; x < width; x++) {
    let runStart = -1;
    for (let y = 0; y < height; y++) {
      const ink = isInk(x, y);
      if (ink && runStart === -1) {
        runStart = y;
      } else if (!ink && runStart !== -1) {
        const runHeight = y - runStart;
        if (runHeight > 0) {
          histogram.set(runHeight, (histogram.get(runHeight) ?? 0) + 1);
        }
        runStart = -1;
      }
    }
    if (runStart !== -1) {
      const runHeight = height - runStart;
      if (runHeight > 0) {
        histogram.set(runHeight, (histogram.get(runHeight) ?? 0) + 1);
      }
    }
  }

  if (histogram.size === 0) return null;

  let mode = 0;
  let modeCount = 0;
  for (const [runHeight, count] of histogram) {
    if (count > modeCount) {
      mode = runHeight;
      modeCount = count;
    }
  }
  return mode;
}
