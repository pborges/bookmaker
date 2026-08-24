// Browser-only glue between pdf.js and the pure raster/model helpers.
// Parses an imported PDF, rasterizes each page once, and derives the
// thumbnail, ink crop box, and readability estimate from that single raster.

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { dominantInkRunHeight, inkBoundingBox, padBBox, type BBox } from "./raster";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const THUMBNAIL_MAX_DIM = 400;
const CROP_PADDING_PX = 4;
const PT_PER_MM = 72 / 25.4;

export interface ImportedPage {
  pageIndex: number; // 0-indexed
  widthPt: number;
  heightPt: number;
  thumbnail: Blob;
  /** Ink bbox in PDF user-space points, padded. Null if the page is blank. */
  cropBoxPt: BBox | null;
  /** Estimated dominant text height, in PDF points, at native scale. */
  estimatedTextHeightPt: number | null;
}

export interface ImportedSource {
  filename: string;
  pageCount: number;
  pages: ImportedPage[];
}

export async function parsePdf(file: File): Promise<ImportedSource> {
  const bytes = await file.arrayBuffer();
  // pdf.js detaches/transfers the buffer it's given, so hand it a copy and
  // keep the original for IndexedDB storage.
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const pages: ImportedPage[] = [];

  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    pages.push(await rasterizePage(page));
  }

  return { filename: file.name, pageCount: doc.numPages, pages };
}

async function rasterizePage(page: pdfjsLib.PDFPageProxy): Promise<ImportedPage> {
  const nativeViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(THUMBNAIL_MAX_DIM / nativeViewport.width, THUMBNAIL_MAX_DIM / nativeViewport.height, 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context for PDF rasterization");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixelBuf = { data: imageData.data, width: canvas.width, height: canvas.height };

  const rawBox = inkBoundingBox(pixelBuf);
  const paddedBox = rawBox ? padBBox(rawBox, CROP_PADDING_PX, canvas.width, canvas.height) : null;
  const runHeightPx = dominantInkRunHeight(pixelBuf);

  // Map raster pixels back to PDF user-space points via the render scale.
  const cropBoxPt: BBox | null = paddedBox
    ? {
        minX: paddedBox.minX / scale,
        minY: paddedBox.minY / scale,
        maxX: paddedBox.maxX / scale,
        maxY: paddedBox.maxY / scale,
      }
    : null;
  const estimatedTextHeightPt = runHeightPx !== null ? runHeightPx / scale : null;

  const thumbnail = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob failed"));
    }, "image/png");
  });

  return {
    pageIndex: page.pageNumber - 1,
    widthPt: nativeViewport.width,
    heightPt: nativeViewport.height,
    thumbnail,
    cropBoxPt,
    estimatedTextHeightPt,
  };
}

/**
 * Given a source page's crop box and the target book page size, computes
 * the final placement scale (trim-fit: crop to ink bbox, then fit) and the
 * resulting estimated printed text size in points, for the import summary.
 */
export function estimateReadability(
  page: ImportedPage,
  targetWidthMm: number,
  targetHeightMm: number,
): { scale: number; estimatedPrintedTextHeightPt: number | null } {
  const targetWidthPt = targetWidthMm * PT_PER_MM;
  const targetHeightPt = targetHeightMm * PT_PER_MM;

  const box = page.cropBoxPt;
  const sourceWidthPt = box ? box.maxX - box.minX : page.widthPt;
  const sourceHeightPt = box ? box.maxY - box.minY : page.heightPt;

  const scale = Math.min(targetWidthPt / sourceWidthPt, targetHeightPt / sourceHeightPt);
  const estimatedPrintedTextHeightPt =
    page.estimatedTextHeightPt !== null ? page.estimatedTextHeightPt * scale : null;

  return { scale, estimatedPrintedTextHeightPt };
}

export const READABILITY_WARNING_THRESHOLD_PT = 6;
