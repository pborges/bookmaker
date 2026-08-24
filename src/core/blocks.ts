// Groups the flat item list into contiguous "blocks" for reordering: a run
// of items sharing a groupId is one block, an item with no groupId is its
// own single-item block. Reordering operates on blocks so that dragging a
// group always moves it as one contiguous unit, never interleaving it with
// another group's pages.

import type { BookItem } from "./pages";

export interface GroupBlock {
  type: "group";
  key: string; // groupId
  items: BookItem[];
}

export interface SingleBlock {
  type: "single";
  key: string; // item id
  item: BookItem;
}

export type Block = GroupBlock | SingleBlock;

export function toBlocks(items: BookItem[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    const last = blocks[blocks.length - 1];
    if (item.groupId !== undefined && last?.type === "group" && last.key === item.groupId) {
      last.items.push(item);
    } else if (item.groupId !== undefined) {
      blocks.push({ type: "group", key: item.groupId, items: [item] });
    } else {
      blocks.push({ type: "single", key: item.id, item });
    }
  }
  return blocks;
}

export function fromBlocks(blocks: Block[]): BookItem[] {
  return blocks.flatMap((b) => (b.type === "group" ? b.items : [b.item]));
}

/**
 * Moves the block identified by `sourceKey` to just before the block
 * identified by `beforeKey`, or to the end if `beforeKey` is null. No-op if
 * either key is missing or they're the same block.
 */
export function moveBlock(items: BookItem[], sourceKey: string, beforeKey: string | null): BookItem[] {
  const blocks = toBlocks(items);
  const sourceIndex = blocks.findIndex((b) => b.key === sourceKey);
  if (sourceIndex === -1) return items;
  if (sourceKey === beforeKey) return items;

  const [moved] = blocks.splice(sourceIndex, 1);
  const targetIndex = beforeKey === null ? blocks.length : blocks.findIndex((b) => b.key === beforeKey);
  if (targetIndex === -1) {
    blocks.splice(sourceIndex, 0, moved); // target vanished; restore
    return items;
  }
  blocks.splice(targetIndex, 0, moved);
  return fromBlocks(blocks);
}

/**
 * Moves item `itemId` to just before item `beforeItemId` within the same
 * group, or to the end of the group if `beforeItemId` is null. No-op across
 * group boundaries — pages don't leave their group by this operation.
 */
export function moveItemWithinGroup(items: BookItem[], itemId: string, beforeItemId: string | null): BookItem[] {
  const blocks = toBlocks(items);
  const blockIndex = blocks.findIndex((b) => b.type === "group" && b.items.some((i) => i.id === itemId));
  if (blockIndex === -1) return items;
  const block = blocks[blockIndex] as GroupBlock;

  const sourceIndex = block.items.findIndex((i) => i.id === itemId);
  const targetIndex = beforeItemId === null ? block.items.length : block.items.findIndex((i) => i.id === beforeItemId);
  if (targetIndex === -1) return items;

  const newGroupItems = [...block.items];
  const [moved] = newGroupItems.splice(sourceIndex, 1);
  const adjustedTarget = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  newGroupItems.splice(adjustedTarget, 0, moved);

  const newBlocks = [...blocks];
  newBlocks[blockIndex] = { ...block, items: newGroupItems };
  return fromBlocks(newBlocks);
}
