import type { JSX } from "preact";
import { useEffect } from "preact/hooks";
import { activeNotebook, closePreview, previewItemId, rotateItem, thumbnailUrls } from "../store";

export function PagePreviewModal(): JSX.Element | null {
  const id = previewItemId.value;
  const nb = activeNotebook.value;
  const item = id && nb ? nb.items.find((i) => i.id === id) : undefined;
  const open = !!item && item.kind === "pdf";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open || !item || item.kind !== "pdf") return null;

  const src = thumbnailUrls.value[`${item.sourceId}:${item.sourcePage}`];
  const rotation = item.rotation ?? 0;
  const rotated = rotation === 90 || rotation === 270;

  return (
    <div class="modal-overlay" onClick={closePreview}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <button class="modal-close" onClick={closePreview} title="Close (Esc)">
          ×
        </button>
        <div class="modal-image-wrap">
          {src ? (
            // The rotation lives on this sizing box, not the <img>: the box is
            // pre-rotation dimensions (swapped when on its side), so once
            // rotated its on-screen footprint is the intended 80vw/80vh — the
            // img then just fills that box via object-fit, scaling up freely
            // instead of being capped at the thumbnail's native raster size.
            <div
              class="modal-image-rotator"
              style={{
                width: rotated ? "80vh" : "80vw",
                height: rotated ? "80vw" : "80vh",
                transform: `rotate(${rotation}deg)`,
              }}
            >
              <img src={src} alt="" />
            </div>
          ) : (
            <div class="blank-half">no preview</div>
          )}
        </div>
        <div class="modal-controls">
          <span>Page {item.sourcePage + 1}</span>
          <button onClick={() => rotateItem(item.id)}>⟳ Rotate 90°</button>
        </div>
      </div>
    </div>
  );
}
