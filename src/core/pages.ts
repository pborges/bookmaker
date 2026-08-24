// Page list resolution: turns the sidebar's item list into the final,
// print-ready page list. Runs in a fixed order — see PLAN.md §4.

export type BlankReason = "manual" | "parity" | "fill";

/** Clockwise rotation applied to a source page at placement time — fixes
 * pages that were scanned or exported in the wrong orientation. */
export type PageRotation = 0 | 90 | 180 | 270;

export type BookItem =
  | { kind: "pdf"; id: string; groupId: string; sourceId: string; sourcePage: number; rotation?: PageRotation }
  | { kind: "blank"; id: string; groupId?: string; reason: BlankReason }
  | { kind: "divider"; id: string; label: string; groupId?: string };

export interface Group {
  id: string;
  label: string;
  startOnRecto: boolean;
}

export interface CoverConfig {
  mode: "none" | "separate-wrap" | "in-signature";
}

export interface ResolveOptions {
  items: BookItem[];
  groups: Group[];
  targetPageCount: number;
  cover: CoverConfig;
}

let counter = 0;
function nextBlankId(): string {
  counter += 1;
  return `__blank_${counter}`;
}

/**
 * Runs the four-stage resolution pipeline: flatten (input is already flat),
 * parity pad, reserve cover slots, then fill to a multiple of 4 and at least
 * targetPageCount. Fill blanks are always appended at the end.
 */
export function resolvePageList(options: ResolveOptions): BookItem[] {
  const { items, groups, targetPageCount, cover } = options;
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  // 1. Flatten — items are already in reading order.
  let result: BookItem[] = [...items];

  // 2. Parity pad — for each group with startOnRecto and an odd length,
  // append a blank right after that group's last item.
  const groupLengths = new Map<string, number>();
  for (const item of result) {
    if (item.groupId) {
      groupLengths.set(item.groupId, (groupLengths.get(item.groupId) ?? 0) + 1);
    }
  }

  const padded: BookItem[] = [];
  const groupsSeen = new Set<string>();
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    padded.push(item);
    const nextItem = result[i + 1];
    const isLastOfGroup =
      item.groupId !== undefined &&
      (nextItem === undefined || nextItem.groupId !== item.groupId) &&
      !groupsSeen.has(item.groupId);
    if (isLastOfGroup && item.groupId) {
      groupsSeen.add(item.groupId);
      const group = groupsById.get(item.groupId);
      const length = groupLengths.get(item.groupId) ?? 0;
      if (group?.startOnRecto && length % 2 === 1) {
        padded.push({ id: nextBlankId(), kind: "blank", groupId: item.groupId, reason: "parity" });
      }
    }
  }
  result = padded;

  // 3. Cover — reserve first and last positions for in-signature covers.
  // (Reservation here means the caller is expected to have placed the cover
  // pdf items at the head/tail of `items`; this stage is a pass-through that
  // documents the contract rather than mutating anything, since cover pages
  // are ordinary pdf items placed by the caller.)
  void cover;

  // 4. Fill — append blanks until count is a multiple of 4 and >= target.
  const minCount = Math.max(targetPageCount, result.length, 1);
  const target = roundUpToMultipleOf4(minCount);
  while (result.length < target) {
    result.push({ id: nextBlankId(), kind: "blank", reason: "fill" });
  }

  return result;
}

function roundUpToMultipleOf4(n: number): number {
  return Math.ceil(n / 4) * 4;
}
