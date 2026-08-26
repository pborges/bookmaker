// Resolves how to order and rotate the Backs pass given a printer profile.
// See PLAN.md §7. The calibration wizard determines outputFacing/reloadFlip
// from which of four labelled outcomes the user picks; this module turns
// that into concrete export instructions.

import type { PrinterProfile } from "./model";

export interface BacksPlan {
  order: "forward" | "reversed";
  rotationDeg: 0 | 180;
}

/** A one-sheet flip test cannot observe multi-sheet stack order. Reversed
 * order and 180° rotation are the safe defaults for reloading the intact
 * output stack; profiles may override either independently. */
export function resolveBacksPlan(
  profile: Pick<PrinterProfile, "outputFacing" | "reloadFlip" | "backsOrder" | "backsRotationDeg">,
): BacksPlan {
  return {
    order: profile.backsOrder ?? "reversed",
    rotationDeg: profile.backsRotationDeg ?? 180,
  };
}

export function orderedBackIndices(sheetCount: number, order: "forward" | "reversed"): number[] {
  const indices = Array.from({ length: sheetCount }, (_, i) => i);
  return order === "forward" ? indices : indices.reverse();
}
