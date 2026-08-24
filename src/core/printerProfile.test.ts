import { describe, expect, it } from "vitest";
import { orderedBackIndices, resolveBacksPlan } from "./printerProfile";

describe("resolveBacksPlan", () => {
  it("covers all four facing/flip combinations distinctly", () => {
    const plans = [
      resolveBacksPlan({ outputFacing: "down", reloadFlip: "long" }),
      resolveBacksPlan({ outputFacing: "down", reloadFlip: "short" }),
      resolveBacksPlan({ outputFacing: "up", reloadFlip: "long" }),
      resolveBacksPlan({ outputFacing: "up", reloadFlip: "short" }),
    ];
    const serialized = plans.map((p) => `${p.order}:${p.rotationDeg}`);
    expect(new Set(serialized).size).toBe(4);
  });
});

describe("orderedBackIndices", () => {
  it("returns forward order unchanged", () => {
    expect(orderedBackIndices(4, "forward")).toEqual([0, 1, 2, 3]);
  });

  it("reverses when order is reversed", () => {
    expect(orderedBackIndices(4, "reversed")).toEqual([3, 2, 1, 0]);
  });
});
