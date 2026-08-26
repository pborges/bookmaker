// Generates the one-page calibration sheet used to determine a printer's
// facing/reload behavior, per PLAN.md §7: print it, reload as you normally
// would, print side two, then compare which of four outcomes you got.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { computeSheetGeometry } from "./geometry";
import type { Media, Size } from "./model";

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number) => mm * PT_PER_MM;

export async function generateCalibrationSheet(media: Media, pageSize: Size): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = computeSheetGeometry(media, pageSize, 0).sheetSize;
  // The physical sheet is imposed landscape, then fed short-edge-first. Use
  // a true portrait MediaBox so calibration follows the same printer path as
  // the exported Fronts and Backs PDFs.
  const pageWidthPt = mmToPt(sheet.heightMm);
  const pageHeightPt = mmToPt(sheet.widthMm);
  const page = doc.addPage([pageWidthPt, pageHeightPt]);
  const frontSize = 48;
  const topLabelSize = 24;
  const frontWidth = font.widthOfTextAtSize("FRONT", frontSize);
  const topLabelWidth = font.widthOfTextAtSize("TOP EDGE ^", topLabelSize);

  page.drawText("FRONT", {
    x: (pageWidthPt - frontWidth) / 2,
    y: pageHeightPt / 2,
    size: frontSize,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText("TOP EDGE ^", {
    x: (pageWidthPt - topLabelWidth) / 2,
    y: pageHeightPt - 60,
    size: topLabelSize,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText("^", {
    x: pageWidthPt / 2 - 6,
    y: pageHeightPt - 90,
    size: 32,
    font,
    color: rgb(0, 0, 0),
  });

  return doc.save();
}

export interface CalibrationOutcome {
  label: string;
  description: string;
  outputFacing: "up" | "down";
  reloadFlip: "long" | "short";
}

/**
 * The four possible outcomes after printing side two of the calibration
 * sheet and comparing it to side one. Which one you got is something only
 * the physical test can answer — this is a lookup by observed result, not
 * a formula, since printers and reload habits vary. `outputFacing` records
 * whether the printer's output tray leaves pages face-up or face-down, and
 * `reloadFlip` records which way you turned the stack to reload it face-up
 * for side two.
 */
export const CALIBRATION_OUTCOMES: CalibrationOutcome[] = [
  {
    label: "Side two reads correctly, same edge on top as side one",
    description: "Printer output is face-down; you reloaded without flipping the stack.",
    outputFacing: "down",
    reloadFlip: "long",
  },
  {
    label: "Side two is upside down, same edge on top as side one",
    description: "Printer output is face-down; you flipped the stack top-to-bottom (short edge) to reload it.",
    outputFacing: "down",
    reloadFlip: "short",
  },
  {
    label: "Side two reads correctly, opposite edge on top from side one",
    description: "Printer output is face-up; you flipped the stack top-to-bottom (short edge) to reload it.",
    outputFacing: "up",
    reloadFlip: "short",
  },
  {
    label: "Side two is upside down, opposite edge on top from side one",
    description: "Printer output is face-up; you flipped the stack left-to-right (long edge) to reload it.",
    outputFacing: "up",
    reloadFlip: "long",
  },
];
