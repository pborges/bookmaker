// Generates the one-page calibration sheet used to determine a printer's
// facing/reload behavior, per PLAN.md §7: print it, reload as you normally
// would, print side two, then compare which of four outcomes you got.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LETTER_WIDTH_PT = 612;
const LETTER_HEIGHT_PT = 792;

export async function generateCalibrationSheet(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([LETTER_WIDTH_PT, LETTER_HEIGHT_PT]);

  page.drawText("FRONT", {
    x: LETTER_WIDTH_PT / 2 - 70,
    y: LETTER_HEIGHT_PT / 2,
    size: 48,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText("TOP EDGE ^", {
    x: LETTER_WIDTH_PT / 2 - 90,
    y: LETTER_HEIGHT_PT - 60,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText("^", {
    x: LETTER_WIDTH_PT / 2 - 6,
    y: LETTER_HEIGHT_PT - 90,
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
