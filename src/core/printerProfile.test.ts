import { describe, expect, it } from "vitest";
import { orderedBackIndices, resolveBacksPlan } from "./printerProfile";

describe("resolveBacksPlan", () => {
  it("defaults to reversed order and 180° rotation", () => {
    expect(resolveBacksPlan({ outputFacing: "down", reloadFlip: "long" })).toEqual({
      order: "reversed",
      rotationDeg: 180,
    });
    expect(resolveBacksPlan({ outputFacing: "up", reloadFlip: "short" })).toEqual({
      order: "reversed",
      rotationDeg: 180,
    });
  });

  it("overrides sheet order without changing rotation", () => {
    expect(resolveBacksPlan({ outputFacing: "down", reloadFlip: "long", backsOrder: "reversed" })).toEqual({
      order: "reversed",
      rotationDeg: 180,
    });
    expect(resolveBacksPlan({ outputFacing: "up", reloadFlip: "short", backsOrder: "forward" })).toEqual({
      order: "forward",
      rotationDeg: 180,
    });
  });

  it("overrides rotation without changing sheet order", () => {
    expect(
      resolveBacksPlan({
        outputFacing: "down",
        reloadFlip: "short",
        backsOrder: "reversed",
        backsRotationDeg: 0,
      }),
    ).toEqual({ order: "reversed", rotationDeg: 0 });
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
