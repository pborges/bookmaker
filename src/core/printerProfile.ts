// Resolves how to order and rotate the Backs pass given a printer profile.
// See PLAN.md §7. The calibration wizard determines outputFacing/reloadFlip
// from which of four labelled outcomes the user picks; this module turns
// that into concrete export instructions.

import type { PrinterProfile } from "./model";

export interface BacksPlan {
  order: "forward" | "reversed";
  rotationDeg: 0 | 180;
}

// The four combinations of outputFacing x reloadFlip each land in one of
// four physical outcomes. The calibration wizard determines this
// empirically — it prints a marked test sheet, has the user reload it the
// way they normally would, prints side two, and asks them which of four
// labelled diagrams matches what came out. That answer, not a formula, is
// the source of truth, since real printers and habits vary. This table
// records the mapping the wizard resolves to for each combination.
const BACKS_PLAN_TABLE: Record<PrinterProfile["outputFacing"], Record<PrinterProfile["reloadFlip"], BacksPlan>> = {
  down: {
    long: { order: "forward", rotationDeg: 0 },
    short: { order: "forward", rotationDeg: 180 },
  },
  up: {
    long: { order: "reversed", rotationDeg: 0 },
    short: { order: "reversed", rotationDeg: 180 },
  },
};

export function resolveBacksPlan(profile: Pick<PrinterProfile, "outputFacing" | "reloadFlip">): BacksPlan {
  return BACKS_PLAN_TABLE[profile.outputFacing][profile.reloadFlip];
}

export function orderedBackIndices(sheetCount: number, order: "forward" | "reversed"): number[] {
  const indices = Array.from({ length: sheetCount }, (_, i) => i);
  return order === "forward" ? indices : indices.reverse();
}
