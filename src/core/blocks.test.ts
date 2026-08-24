import { describe, expect, it } from "vitest";
import { fromBlocks, moveBlock, moveItemWithinGroup, toBlocks } from "./blocks";
import type { BookItem } from "./pages";

function pdf(id: string, groupId: string | undefined, sourcePage: number): BookItem {
  return groupId === undefined
    ? { kind: "blank", id, reason: "manual" }
    : { kind: "pdf", id, groupId, sourceId: "src", sourcePage };
}

describe("toBlocks / fromBlocks", () => {
  it("groups consecutive same-group items into one block", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g1", 1), pdf("3", "g2", 0)];
    const blocks = toBlocks(items);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "group", key: "g1" });
    expect((blocks[0] as any).items).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ type: "group", key: "g2" });
  });

  it("treats ungrouped items as their own single blocks", () => {
    const items = [pdf("1", "g1", 0), pdf("blank1", undefined, 0), pdf("2", "g1", 1)];
    const blocks = toBlocks(items);
    expect(blocks.map((b) => b.type)).toEqual(["group", "single", "group"]);
  });

  it("round-trips through fromBlocks", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g1", 1), pdf("blank1", undefined, 0)];
    expect(fromBlocks(toBlocks(items))).toEqual(items);
  });
});

describe("moveBlock", () => {
  it("moves a group block before another group block", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g2", 0), pdf("3", "g3", 0)];
    const result = moveBlock(items, "g3", "g1");
    expect(result.map((i) => i.id)).toEqual(["3", "1", "2"]);
  });

  it("moves a block to the end when beforeKey is null", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g2", 0)];
    const result = moveBlock(items, "g1", null);
    expect(result.map((i) => i.id)).toEqual(["2", "1"]);
  });

  it("keeps group contiguity when moving", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g1", 1), pdf("3", "g2", 0), pdf("4", "g2", 1)];
    const result = moveBlock(items, "g2", "g1");
    expect(result.map((i) => i.id)).toEqual(["3", "4", "1", "2"]);
  });

  it("is a no-op for an unknown source key", () => {
    const items = [pdf("1", "g1", 0)];
    expect(moveBlock(items, "missing", null)).toEqual(items);
  });

  it("is a no-op moving a block before itself", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g2", 0)];
    expect(moveBlock(items, "g1", "g1")).toEqual(items);
  });
});

describe("moveItemWithinGroup", () => {
  it("reorders pages within a group", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g1", 1), pdf("3", "g1", 2)];
    const result = moveItemWithinGroup(items, "3", "1");
    expect(result.map((i) => i.id)).toEqual(["3", "1", "2"]);
  });

  it("does not cross group boundaries", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g2", 0)];
    // "2" is not in g1's block, so this must be a no-op.
    const result = moveItemWithinGroup(items, "1", "2");
    expect(result).toEqual(items);
  });

  it("moves to the end of the group when beforeItemId is null", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g1", 1), pdf("3", "g2", 0)];
    const result = moveItemWithinGroup(items, "1", null);
    expect(result.map((i) => i.id)).toEqual(["2", "1", "3"]);
  });

  it("preserves other groups' positions", () => {
    const items = [pdf("1", "g1", 0), pdf("2", "g1", 1), pdf("3", "g2", 0), pdf("4", "g2", 1)];
    const result = moveItemWithinGroup(items, "2", "1");
    // g1's items reorder among themselves; g2's block stays put in the overall sequence.
    const blocks = toBlocks(result);
    expect(blocks.map((b) => b.key)).toEqual(["g1", "g2"]);
    expect(result.map((i) => i.id)).toEqual(["2", "1", "3", "4"]);
  });
});
