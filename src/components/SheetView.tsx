import type { JSX } from "preact";
import { sewStationOffsets, showsSewGuide } from "../core/geometry";
import type { Sheet } from "../core/imposition";
import type { SewGuide } from "../core/model";
import { activeNotebook, openPreview, resolvedPageList, sheets, thumbnailUrls } from "../store";
import type { BookItem } from "../core/pages";

interface ThumbInfo {
  src?: string;
  label: string;
  itemId?: string;
  rotation?: number;
}

function pageThumb(items: BookItem[], pageNumber: number): ThumbInfo {
  const item = items[pageNumber - 1];
  if (!item) return { label: "" };
  if (item.kind === "pdf") {
    return {
      src: thumbnailUrls.value[`${item.sourceId}:${item.sourcePage}`],
      label: String(pageNumber),
      itemId: item.id,
      rotation: item.rotation ?? 0,
    };
  }
  return { label: "blank" };
}

function SheetHalf({ items, pageNumber }: { items: BookItem[]; pageNumber: number }): JSX.Element {
  const { src, label, itemId, rotation } = pageThumb(items, pageNumber);
  return (
    <div class="sheet-half">
      {src ? (
        <span class="thumb-wrap" onClick={() => itemId && openPreview(itemId)} title="Click to preview">
          <img src={src} alt="" style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined} />
          {rotation ? <span class="rotation-badge">{rotation}°</span> : null}
        </span>
      ) : (
        <div class="blank-half">{label}</div>
      )}
      <span class="page-number">{pageNumber}</span>
    </div>
  );
}

function SewGuideOverlay({ stations, heightMm }: { stations: 0 | 3 | 5; heightMm: number }): JSX.Element {
  const offsets = sewStationOffsets(heightMm, stations);
  return (
    <div class="sew-guide">
      {offsets.map((offset, i) => (
        <span key={i} class="sew-station" style={{ top: `${(offset / heightMm) * 100}%` }} />
      ))}
    </div>
  );
}

function SheetRow({
  sheet,
  side,
  pages,
  sewGuide,
  trimMode,
  sheetCount,
  pageHeightMm,
}: {
  sheet: Sheet;
  side: "front" | "back";
  pages: BookItem[];
  sewGuide: SewGuide;
  trimMode: boolean;
  sheetCount: number;
  pageHeightMm: number;
}): JSX.Element {
  const half = side === "front" ? sheet.front : sheet.back;
  const guide = showsSewGuide(sewGuide, sheet, side, sheetCount);
  return (
    <div class={`sheet-card${trimMode ? " trim-mode" : ""}`}>
      <div class="sheet-sides">
        <SheetHalf items={pages} pageNumber={half.left} />
        <div class="fold-line">{guide && <SewGuideOverlay stations={sewGuide.stations} heightMm={pageHeightMm} />}</div>
        <SheetHalf items={pages} pageNumber={half.right} />
      </div>
      <div class="sheet-index">sheet {sheet.index + 1}</div>
    </div>
  );
}

export function SheetView(): JSX.Element {
  const nb = activeNotebook.value;
  const pages = resolvedPageList.value;
  const s = sheets.value;

  if (!nb || s.length === 0) {
    return <main class="sheet-view empty">Import a PDF to see the imposed sheets.</main>;
  }

  const trimMode = nb.media.mode === "trim";

  return (
    <main class="sheet-view">
      <section class="pass">
        <h2>Fronts</h2>
        <div class="sheet-grid">
          {s.map((sheet) => (
            <SheetRow
              key={sheet.index}
              sheet={sheet}
              side="front"
              pages={pages}
              sewGuide={nb.sewGuide}
              trimMode={trimMode}
              sheetCount={s.length}
              pageHeightMm={nb.pageSize.heightMm}
            />
          ))}
        </div>
      </section>

      <section class="pass">
        <h2>Backs</h2>
        <div class="sheet-grid">
          {s.map((sheet) => (
            <SheetRow
              key={sheet.index}
              sheet={sheet}
              side="back"
              pages={pages}
              sewGuide={nb.sewGuide}
              trimMode={trimMode}
              sheetCount={s.length}
              pageHeightMm={nb.pageSize.heightMm}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
