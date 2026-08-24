import type { JSX } from "preact";
import { useState } from "preact/hooks";
import {
  activeNotebook,
  importPdf,
  insertManualBlank,
  lastImportSummary,
  moveBlockBefore,
  moveItemBeforeWithinGroup,
  openPreview,
  removeItem,
  resolvedPageList,
  rotateGroupPages,
  rotateItem,
  thumbnailUrls,
  toggleGroupRecto,
} from "../store";
import { toBlocks, type Block } from "../core/blocks";
import type { BookItem } from "../core/pages";

function blankLabel(item: Extract<BookItem, { kind: "blank" }>): string {
  if (item.reason === "manual") return "blank";
  if (item.reason === "parity") return "▸ blank (recto)";
  return "blank (fill)";
}

function ItemRow({
  item,
  draggable,
  onDragStartItem,
  onDropOnItem,
}: {
  item: BookItem;
  draggable: boolean;
  onDragStartItem: (id: string) => void;
  onDropOnItem: (id: string) => void;
}): JSX.Element {
  return (
    <li
      class="item"
      draggable={draggable}
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStartItem(item.id);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropOnItem(item.id);
      }}
    >
      {item.kind === "pdf" ? (
        <>
          <span class="thumb-wrap" onClick={() => openPreview(item.id)} title="Click to preview">
            <img class="thumb" src={thumbnailUrls.value[`${item.sourceId}:${item.sourcePage}`]} alt="" />
            {item.rotation ? <span class="rotation-badge">{item.rotation}°</span> : null}
          </span>
          <span>{item.sourcePage + 1}</span>
          <button class="rotate-btn" onClick={() => rotateItem(item.id)} title="Rotate 90°">
            ⟳
          </button>
        </>
      ) : item.kind === "blank" ? (
        <span class="blank-item">{blankLabel(item)}</span>
      ) : (
        <span class="blank-item">{item.label}</span>
      )}
      <button class="delete" onClick={() => removeItem(item.id)} title="Delete">
        ×
      </button>
    </li>
  );
}

export function Sidebar(): JSX.Element {
  const nb = activeNotebook.value;
  const pages = resolvedPageList.value;
  const [draggedBlockKey, setDraggedBlockKey] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const onFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type === "application/pdf") {
        await importPdf(file);
      }
    }
    input.value = "";
  };

  if (!nb) {
    return <aside class="sidebar">No notebook selected.</aside>;
  }

  const groupsById = new Map(nb.groups.map((g) => [g.id, g]));
  const blocks: Block[] = toBlocks(nb.items);

  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <label class="import-button">
          + Import PDF
          <input type="file" accept="application/pdf" multiple onChange={onFileChange} hidden />
        </label>
      </div>

      {lastImportSummary.value && (
        <div class={`import-summary${lastImportSummary.value.warning ? " warning" : ""}`}>
          {lastImportSummary.value.estimatedPrintedTextHeightPt !== null
            ? `${lastImportSummary.value.filename}: body text ~${lastImportSummary.value.estimatedPrintedTextHeightPt.toFixed(1)}pt`
            : `${lastImportSummary.value.filename}: imported`}
          {lastImportSummary.value.warning && " — consider a larger page size"}
        </div>
      )}

      <ul class="item-list">
        {blocks.map((block) => {
          if (block.type === "single") {
            return (
              <ItemRow
                key={block.key}
                item={block.item}
                draggable
                onDragStartItem={() => setDraggedBlockKey(block.key)}
                onDropOnItem={(targetId) => {
                  if (draggedBlockKey) moveBlockBefore(draggedBlockKey, targetId);
                  setDraggedBlockKey(null);
                }}
              />
            );
          }

          const group = groupsById.get(block.key);
          if (!group) return null;

          return (
            <li
              key={block.key}
              class="group"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedBlockKey) moveBlockBefore(draggedBlockKey, block.key);
                setDraggedBlockKey(null);
              }}
            >
              <div
                class="group-header"
                draggable
                onDragStart={() => setDraggedBlockKey(block.key)}
              >
                <span class="drag-handle" title="Drag to reorder">
                  ⠿
                </span>
                <span class="group-label">{group.label}</span>
                <button
                  class="rotate-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    rotateGroupPages(block.key);
                  }}
                  title="Rotate every page in this group 90°"
                >
                  ⟳ all
                </button>
                <label class="recto-toggle" title="Start on a right-hand page">
                  <input
                    type="checkbox"
                    checked={group.startOnRecto}
                    onChange={() => toggleGroupRecto(group.id)}
                  />
                  recto
                </label>
              </div>
              <ul class="group-items">
                {block.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    draggable
                    onDragStartItem={(id) => setDraggedItemId(id)}
                    onDropOnItem={(targetId) => {
                      if (draggedItemId) moveItemBeforeWithinGroup(draggedItemId, targetId);
                      setDraggedItemId(null);
                    }}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <button
        class="add-blank"
        onClick={() => insertManualBlank(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedBlockKey) moveBlockBefore(draggedBlockKey, null);
          setDraggedBlockKey(null);
        }}
      >
        + blank
      </button>

      <footer class="sidebar-footer">
        {nb.items.length} / {pages.length} pages
      </footer>
    </aside>
  );
}
