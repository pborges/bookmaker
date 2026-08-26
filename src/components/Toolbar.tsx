import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { APP_VERSION } from "../appVersion";
import {
  activeNotebook,
  activePrinterProfile,
  canRedo,
  canUndo,
  createNotebook,
  deleteNotebook,
  getSourceBytes,
  notebooks,
  redo,
  renameNotebook,
  selectNotebook,
  setTargetPageCount,
  sheets,
  sources,
  undo,
} from "../store";
import { exportBooklet, exportCover, type PlacedPage } from "../core/export";
import { resolveBacksPlan } from "../core/printerProfile";
import { resolvedPageList } from "../store";

function blobUrl(bytes: Uint8Array): string {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

interface ExportUrls {
  fronts: string;
  backs: string;
  cover: string | null;
}

export function Toolbar(): JSX.Element {
  const nb = activeNotebook.value;
  const [exporting, setExporting] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [showNewNotebookForm, setShowNewNotebookForm] = useState(false);
  const [exportUrls, setExportUrls] = useState<ExportUrls | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const onCreateNotebook = (e: Event) => {
    e.preventDefault();
    const name = newNotebookName.trim();
    if (!name) return;
    createNotebook(name, "fieldnotes");
    setNewNotebookName("");
    setShowNewNotebookForm(false);
  };

  const onStartRename = () => {
    if (!nb) return;
    setRenameValue(nb.name);
    setRenaming(true);
  };

  const onSubmitRename = (e: Event) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (name) renameNotebook(name);
    setRenaming(false);
  };

  const onDeleteNotebook = () => {
    if (!nb) return;
    deleteNotebook(nb.id);
    setConfirmingDelete(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onExport = async () => {
    if (!nb) return;
    setExporting(true);
    setExportUrls(null);
    setExportError(null);
    try {
      const pages = resolvedPageList.value;
      const s = sheets.value;
      const byteCache = new Map<string, ArrayBuffer>();

      for (const item of pages) {
        if (item.kind === "pdf" && !byteCache.has(item.sourceId)) {
          const bytes = await getSourceBytes(item.sourceId);
          if (bytes) byteCache.set(item.sourceId, bytes);
        }
      }

      const lookup = (bookPageNumber: number): PlacedPage => {
        const item = pages[bookPageNumber - 1];
        if (!item || item.kind !== "pdf") return { bookPageNumber: null };
        const bytes = byteCache.get(item.sourceId);
        return {
          bookPageNumber,
          sourceBytes: bytes,
          sourcePageIndex: item.sourcePage,
          pageRotationDeg: item.rotation ?? 0,
        };
      };

      // Without a calibrated profile, default to a forward, unrotated pass.
      const profile = activePrinterProfile.value;
      const backsPlan = resolveBacksPlan(
        profile ?? { outputFacing: "down", reloadFlip: "long", backsOrder: "reversed", backsRotationDeg: 180 },
      );
      const result = await exportBooklet(s, nb.media, nb.pageSize, nb.bindingMarginMm, lookup, backsPlan, nb.sewGuide);

      let coverUrl: string | null = null;
      if (nb.coverMode === "separate-wrap") {
        const coverPdf = await exportCover(nb.media, nb.pageSize, nb.bindingMarginMm, nb.coverPages, getSourceBytes);
        coverUrl = blobUrl(coverPdf);
      }

      setExportUrls({ fronts: blobUrl(result.frontsPdf), backs: blobUrl(result.backsPdf), cover: coverUrl });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <header class="toolbar">
      <span class="brand">bookmaker</span>
      {showNewNotebookForm ? (
        <form class="new-notebook-form" onSubmit={onCreateNotebook}>
          <input
            type="text"
            placeholder="Notebook name"
            autoFocus
            value={newNotebookName}
            onInput={(e) => setNewNotebookName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn-primary">
            Create
          </button>
          <button type="button" onClick={() => setShowNewNotebookForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setShowNewNotebookForm(true)}>+ Notebook</button>
      )}
      {notebooks.value.length > 0 && (
        <select
          class="notebook-select"
          value={nb?.id ?? ""}
          onChange={(e) => selectNotebook((e.target as HTMLSelectElement).value)}
        >
          {notebooks.value.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}
      {nb && (
        <>
          {renaming ? (
            <form class="rename-form" onSubmit={onSubmitRename}>
              <input
                type="text"
                autoFocus
                value={renameValue}
                onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                onBlur={() => setRenaming(false)}
              />
            </form>
          ) : (
            <button class="link-button" onClick={onStartRename} title="Rename notebook">
              rename
            </button>
          )}
          {confirmingDelete ? (
            <span class="confirm-delete">
              Delete this notebook?
              <button onClick={onDeleteNotebook}>Yes</button>
              <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </span>
          ) : (
            <button class="link-button" onClick={() => setConfirmingDelete(true)} title="Delete notebook">
              delete
            </button>
          )}
          <button onClick={undo} disabled={!canUndo.value} title="Undo (Ctrl/Cmd+Z)">
            Undo
          </button>
          <button onClick={redo} disabled={!canRedo.value} title="Redo (Ctrl/Cmd+Shift+Z)">
            Redo
          </button>
          <label>
            target pages
            <input
              type="number"
              min={4}
              step={4}
              value={nb.targetPageCount}
              onInput={(e) => setTargetPageCount(Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <span class="source-count">{Object.keys(sources.value).length} source(s)</span>
          <button class="btn-primary" onClick={onExport} disabled={exporting || sheets.value.length === 0}>
            {exporting ? "Generating…" : "Generate"}
          </button>
          {exportUrls && (
            <span class="export-links">
              <a href={exportUrls.fronts} download={`${nb.name}-fronts.pdf`}>
                Download Fronts
              </a>
              <a href={exportUrls.backs} download={`${nb.name}-backs.pdf`}>
                Download Backs
              </a>
              {exportUrls.cover && (
                <a href={exportUrls.cover} download={`${nb.name}-cover.pdf`}>
                  Download Cover
                </a>
              )}
            </span>
          )}
          {exportError && <span class="export-error">{exportError}</span>}
        </>
      )}
      <span class="app-version" title="Build version">
        v{APP_VERSION}
      </span>
    </header>
  );
}
