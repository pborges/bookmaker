import { beforeEach, describe, expect, it } from "vitest";
import { resolvePageList, type BookItem, type Group } from "./pages";

function pdf(id: string, groupId: string, sourcePage: number): BookItem {
  return { kind: "pdf", id, groupId, sourceId: "src", sourcePage };
}

describe("resolvePageList", () => {
  it("fills to a multiple of 4 with fill blanks appended at the end", () => {
    const items: BookItem[] = [pdf("1", "g1", 1), pdf("2", "g1", 2)];
    const groups: Group[] = [{ id: "g1", label: "g1", startOnRecto: false }];
    const result = resolvePageList({ items, groups, targetPageCount: 0, cover: { mode: "none" } });
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ kind: "pdf", id: "1" });
    expect(result[1]).toMatchObject({ kind: "pdf", id: "2" });
    expect(result[2]).toMatchObject({ kind: "blank", reason: "fill" });
    expect(result[3]).toMatchObject({ kind: "blank", reason: "fill" });
  });

  it("respects targetPageCount even when already a multiple of 4", () => {
    const items: BookItem[] = [pdf("1", "g1", 1), pdf("2", "g1", 2), pdf("3", "g1", 3), pdf("4", "g1", 4)];
    const groups: Group[] = [{ id: "g1", label: "g1", startOnRecto: false }];
    const result = resolvePageList({ items, groups, targetPageCount: 8, cover: { mode: "none" } });
    expect(result).toHaveLength(8);
  });

  it("adds a parity blank after an odd-length group with startOnRecto", () => {
    const items: BookItem[] = [
      pdf("1", "g1", 1),
      pdf("2", "g1", 2),
      pdf("3", "g1", 3),
      pdf("4", "g2", 1),
    ];
    const groups: Group[] = [
      { id: "g1", label: "g1", startOnRecto: true },
      { id: "g2", label: "g2", startOnRecto: true },
    ];
    const result = resolvePageList({ items, groups, targetPageCount: 0, cover: { mode: "none" } });
    // g1 has 3 items (odd) -> parity blank inserted right after it.
    expect(result[3]).toMatchObject({ kind: "blank", reason: "parity", groupId: "g1" });
    expect(result[4]).toMatchObject({ kind: "pdf", id: "4" });
    // g1: 3 pdfs + 1 parity blank. g2: 1 pdf (odd) + 1 parity blank.
    // total 6, rounded up to 8 with fill blanks.
    expect(result).toHaveLength(8);
    expect(result[5]).toMatchObject({ kind: "blank", reason: "parity", groupId: "g2" });
    expect(result[6]).toMatchObject({ kind: "blank", reason: "fill" });
    expect(result[7]).toMatchObject({ kind: "blank", reason: "fill" });
  });

  it("does not add a parity blank for an even-length group", () => {
    const items: BookItem[] = [pdf("1", "g1", 1), pdf("2", "g1", 2)];
    const groups: Group[] = [{ id: "g1", label: "g1", startOnRecto: true }];
    const result = resolvePageList({ items, groups, targetPageCount: 0, cover: { mode: "none" } });
    expect(result.filter((i) => i.kind === "blank" && i.reason === "parity")).toHaveLength(0);
  });

  it("leaves manual blanks untouched, mid-list", () => {
    const items: BookItem[] = [
      pdf("1", "g1", 1),
      { id: "m1", kind: "blank", groupId: "g1", reason: "manual" },
      pdf("2", "g1", 2),
    ];
    const groups: Group[] = [{ id: "g1", label: "g1", startOnRecto: false }];
    const result = resolvePageList({ items, groups, targetPageCount: 0, cover: { mode: "none" } });
    expect(result[1]).toMatchObject({ kind: "blank", id: "m1", reason: "manual" });
  });

  it("preserves the three blank reasons distinctly", () => {
    const items: BookItem[] = [
      pdf("1", "g1", 1),
      pdf("2", "g1", 2),
      pdf("3", "g1", 3),
      pdf("4", "g1", 4),
      pdf("5", "g1", 5),
    ];
    const groups: Group[] = [{ id: "g1", label: "g1", startOnRecto: true }];
    const result = resolvePageList({ items, groups, targetPageCount: 0, cover: { mode: "none" } });
    const reasons = result.filter((i) => i.kind === "blank").map((i) => (i as any).reason);
    expect(reasons).toContain("parity");
    expect(reasons).toContain("fill");
  });
});

describe("resolvePageList determinism", () => {
  beforeEach(() => {
    // no shared state to reset besides internal id counter, which only
    // affects blank ids, not ordering/content assertions above.
  });

  it("produces a page count that is always a positive multiple of 4", () => {
    for (let n = 0; n < 20; n++) {
      const items: BookItem[] = Array.from({ length: n }, (_, i) => pdf(`p${i}`, "g1", i + 1));
      const groups: Group[] = [{ id: "g1", label: "g1", startOnRecto: false }];
      const result = resolvePageList({ items, groups, targetPageCount: 0, cover: { mode: "none" } });
      expect(result.length % 4).toBe(0);
      expect(result.length).toBeGreaterThanOrEqual(4);
    }
  });
});
