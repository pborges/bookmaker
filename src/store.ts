import { signal, computed } from "@preact/signals";
import { getPdfBytes, getThumbnail, putPdfBytes, putThumbnail, thumbnailKey } from "./core/db";
import {
  createEmptyNotebook,
  PAGE_SIZE_PRESETS,
  SCHEMA_VERSION,
  type CoverMode,
  type CoverPageRef,
  type CoverPages,
  type Creep,
  type Media,
  type Notebook,
  type PrinterProfile,
  type Source,
  type PageSizePreset,
  type SewGuide,
  type Size,
} from "./core/model";
import { loadState, saveState } from "./core/persistence";
import { impose, type Sheet } from "./core/imposition";
import { resolvePageList } from "./core/pages";
import type { BookItem, Group, PageRotation } from "./core/pages";
import { moveBlock, moveItemWithinGroup } from "./core/blocks";
import { estimateReadability, parsePdf, READABILITY_WARNING_THRESHOLD_PT } from "./core/pdfImport";

const persisted = loadState();

export const notebooks = signal<Notebook[]>(persisted.notebooks);
export const sources = signal<Record<string, Source>>(persisted.sources);
export const printerProfiles = signal<PrinterProfile[]>(persisted.printerProfiles);
export const activePrinterProfileId = signal<string | null>(persisted.activePrinterProfileId ?? null);
export const activeNotebookId = signal<string | null>(persisted.notebooks[0]?.id ?? null);
export const thumbnailUrls = signal<Record<string, string>>({});

export interface ReadabilitySummary {
  filename: string;
  estimatedPrintedTextHeightPt: number | null;
  warning: boolean;
}
export const lastImportSummary = signal<ReadabilitySummary | null>(null);

function persist(): void {
  saveState({
    schemaVersion: SCHEMA_VERSION,
    notebooks: notebooks.value,
    printerProfiles: printerProfiles.value,
    activePrinterProfileId: activePrinterProfileId.value ?? undefined,
    sources: sources.value,
  });
}

/** Rehydrates thumbnail object URLs from IndexedDB for every pdf item across
 * all notebooks. Source metadata is persisted directly, but thumbnail blobs
 * live only in IndexedDB, so they need to be re-fetched and re-wrapped in
 * object URLs on every page load. */
async function hydrateThumbnails(): Promise<void> {
  const keys = new Set<string>();
  for (const nb of notebooks.value) {
    for (const item of nb.items) {
      if (item.kind === "pdf") {
        keys.add(thumbnailKey(item.sourceId, item.sourcePage));
      }
    }
  }
  const urls: Record<string, string> = {};
  await Promise.all(
    Array.from(keys).map(async (key) => {
      const blob = await getThumbnail(key);
      if (blob) urls[key] = URL.createObjectURL(blob);
    }),
  );
  thumbnailUrls.value = { ...thumbnailUrls.value, ...urls };
}

void hydrateThumbnails();

export const activeNotebook = computed<Notebook | null>(
  () => notebooks.value.find((n) => n.id === activeNotebookId.value) ?? null,
);

export const resolvedPageList = computed<BookItem[]>(() => {
  const nb = activeNotebook.value;
  if (!nb) return [];
  return resolvePageList({
    items: nb.items,
    groups: nb.groups,
    targetPageCount: nb.targetPageCount,
    cover: { mode: nb.coverMode },
  });
});

export const sheets = computed<Sheet[]>(() => {
  const pages = resolvedPageList.value;
  if (pages.length === 0) return [];
  return impose(pages.length);
});

function id(): string {
  return crypto.randomUUID();
}

export function createNotebook(name: string, preset: PageSizePreset): Notebook {
  const size = preset === "custom" ? { widthMm: 100, heightMm: 150 } : PAGE_SIZE_PRESETS[preset];
  const nb = createEmptyNotebook(id(), name, size, preset);
  notebooks.value = [...notebooks.value, nb];
  activeNotebookId.value = nb.id;
  persist();
  return nb;
}

function updateActiveNotebook(fn: (nb: Notebook) => Notebook): void {
  const current = activeNotebookId.value;
  notebooks.value = notebooks.value.map((n) => (n.id === current ? fn(n) : n));
  persist();
}

// Undo/redo on the item list. Scoped to whichever notebook is active — the
// stacks reset on notebook switch, since cross-notebook history isn't
// meaningful. Only item-list edits (add/remove/reorder/recto toggle) push
// history; settings changes (page size, cover mode, etc.) don't.
interface ItemListSnapshot {
  items: BookItem[];
  groups: Notebook["groups"];
}

const HISTORY_LIMIT = 50;
let historyNotebookId: string | null = null;
const undoStack = signal<ItemListSnapshot[]>([]);
const redoStack = signal<ItemListSnapshot[]>([]);

function resetHistoryIfNotebookChanged(): void {
  const current = activeNotebookId.value;
  if (current !== historyNotebookId) {
    historyNotebookId = current;
    undoStack.value = [];
    redoStack.value = [];
  }
}

function updateItemList(fn: (nb: Notebook) => Notebook): void {
  resetHistoryIfNotebookChanged();
  const nb = activeNotebook.value;
  if (nb) {
    const snapshot: ItemListSnapshot = { items: nb.items, groups: nb.groups };
    undoStack.value = [...undoStack.value, snapshot].slice(-HISTORY_LIMIT);
    redoStack.value = [];
  }
  updateActiveNotebook(fn);
}

export const canUndo = computed(() => {
  resetHistoryIfNotebookChanged();
  return undoStack.value.length > 0;
});
export const canRedo = computed(() => {
  resetHistoryIfNotebookChanged();
  return redoStack.value.length > 0;
});

export function undo(): void {
  resetHistoryIfNotebookChanged();
  const snapshot = undoStack.value[undoStack.value.length - 1];
  if (!snapshot) return;
  const nb = activeNotebook.value;
  if (!nb) return;
  redoStack.value = [...redoStack.value, { items: nb.items, groups: nb.groups }];
  undoStack.value = undoStack.value.slice(0, -1);
  updateActiveNotebook((current) => ({ ...current, items: snapshot.items, groups: snapshot.groups }));
}

export function redo(): void {
  resetHistoryIfNotebookChanged();
  const snapshot = redoStack.value[redoStack.value.length - 1];
  if (!snapshot) return;
  const nb = activeNotebook.value;
  if (!nb) return;
  undoStack.value = [...undoStack.value, { items: nb.items, groups: nb.groups }];
  redoStack.value = redoStack.value.slice(0, -1);
  updateActiveNotebook((current) => ({ ...current, items: snapshot.items, groups: snapshot.groups }));
}

export function selectNotebook(notebookId: string): void {
  activeNotebookId.value = notebookId;
}

export function renameNotebook(name: string): void {
  updateActiveNotebook((nb) => ({ ...nb, name }));
}

export function deleteNotebook(notebookId: string): void {
  const remaining = notebooks.value.filter((n) => n.id !== notebookId);
  notebooks.value = remaining;
  if (activeNotebookId.value === notebookId) {
    activeNotebookId.value = remaining[0]?.id ?? null;
  }
  persist();
}

export async function importPdf(file: File): Promise<void> {
  const nb = activeNotebook.value;
  if (!nb) return;

  const bytes = await file.arrayBuffer();
  const sourceId = id();
  await putPdfBytes(sourceId, bytes);

  const parsed = await parsePdf(file);
  const source: Source = { id: sourceId, filename: parsed.filename, pageCount: parsed.pageCount };
  sources.value = { ...sources.value, [sourceId]: source };

  const urls: Record<string, string> = {};
  for (const page of parsed.pages) {
    const key = thumbnailKey(sourceId, page.pageIndex);
    await putThumbnail(key, page.thumbnail);
    urls[key] = URL.createObjectURL(page.thumbnail);
  }
  thumbnailUrls.value = { ...thumbnailUrls.value, ...urls };

  const groupId = id();
  const group: Group = { id: groupId, label: parsed.filename, startOnRecto: true };
  const items: BookItem[] = parsed.pages.map((page) => ({
    kind: "pdf",
    id: id(),
    groupId,
    sourceId,
    sourcePage: page.pageIndex,
  }));

  updateItemList((current) => ({
    ...current,
    groups: [...current.groups, { ...group, sourceId, collapsed: false }],
    items: [...current.items, ...items],
  }));

  // Readability estimate at import: use the first page as representative.
  const firstPage = parsed.pages[0];
  if (firstPage) {
    const { estimatedPrintedTextHeightPt } = estimateReadability(firstPage, nb.pageSize.widthMm, nb.pageSize.heightMm);
    lastImportSummary.value = {
      filename: parsed.filename,
      estimatedPrintedTextHeightPt,
      warning:
        estimatedPrintedTextHeightPt !== null && estimatedPrintedTextHeightPt < READABILITY_WARNING_THRESHOLD_PT,
    };
  }
}

export function removeItem(itemId: string): void {
  updateItemList((nb) => ({ ...nb, items: nb.items.filter((i) => i.id !== itemId) }));
}

export function insertManualBlank(afterItemId: string | null): void {
  updateItemList((nb) => {
    const blank: BookItem = { id: id(), kind: "blank", reason: "manual" };
    if (afterItemId === null) return { ...nb, items: [...nb.items, blank] };
    const index = nb.items.findIndex((i) => i.id === afterItemId);
    const items = [...nb.items];
    items.splice(index + 1, 0, blank);
    return { ...nb, items };
  });
}

export function moveBlockBefore(sourceKey: string, beforeKey: string | null): void {
  updateItemList((nb) => ({ ...nb, items: moveBlock(nb.items, sourceKey, beforeKey) }));
}

export function moveItemBeforeWithinGroup(itemId: string, beforeItemId: string | null): void {
  updateItemList((nb) => ({ ...nb, items: moveItemWithinGroup(nb.items, itemId, beforeItemId) }));
}

export function toggleGroupRecto(groupId: string): void {
  updateItemList((nb) => ({
    ...nb,
    groups: nb.groups.map((g) => (g.id === groupId ? { ...g, startOnRecto: !g.startOnRecto } : g)),
  }));
}

function nextRotation(rotation: PageRotation): PageRotation {
  return ((rotation + 90) % 360) as PageRotation;
}

export function setItemRotation(itemId: string, rotation: PageRotation): void {
  updateItemList((nb) => ({
    ...nb,
    items: nb.items.map((item) => (item.kind === "pdf" && item.id === itemId ? { ...item, rotation } : item)),
  }));
}

export function rotateItem(itemId: string): void {
  updateItemList((nb) => ({
    ...nb,
    items: nb.items.map((item) =>
      item.kind === "pdf" && item.id === itemId ? { ...item, rotation: nextRotation(item.rotation ?? 0) } : item,
    ),
  }));
}

/** Rotates every page in a group together — the common case when a whole
 * imported PDF turns out to be landscape. */
export function rotateGroupPages(groupId: string): void {
  updateItemList((nb) => ({
    ...nb,
    items: nb.items.map((item) =>
      item.kind === "pdf" && item.groupId === groupId
        ? { ...item, rotation: nextRotation(item.rotation ?? 0) }
        : item,
    ),
  }));
}

// Large page preview modal, keyed by BookItem id.
export const previewItemId = signal<string | null>(null);

export function openPreview(itemId: string): void {
  previewItemId.value = itemId;
}

export function closePreview(): void {
  previewItemId.value = null;
}

export function setTargetPageCount(count: number): void {
  updateActiveNotebook((nb) => ({ ...nb, targetPageCount: count }));
}

export function setPageSizePreset(preset: PageSizePreset, customSize?: Size): void {
  updateActiveNotebook((nb) => ({
    ...nb,
    pageSizePreset: preset,
    pageSize: preset === "custom" ? (customSize ?? nb.pageSize) : PAGE_SIZE_PRESETS[preset],
  }));
}

export function setCustomPageSize(size: Size): void {
  updateActiveNotebook((nb) => ({ ...nb, pageSizePreset: "custom", pageSize: size }));
}

export function setMedia(media: Media): void {
  updateActiveNotebook((nb) => ({ ...nb, media }));
}

export function setBindingMargin(mm: number): void {
  updateActiveNotebook((nb) => ({ ...nb, bindingMarginMm: mm }));
}

export function setCoverMode(mode: CoverMode): void {
  updateActiveNotebook((nb) => ({ ...nb, coverMode: mode }));
}

export function setCoverPage(position: keyof CoverPages, ref: CoverPageRef | null): void {
  updateActiveNotebook((nb) => ({ ...nb, coverPages: { ...nb.coverPages, [position]: ref } }));
}

export function setSewGuide(sewGuide: SewGuide): void {
  updateActiveNotebook((nb) => ({ ...nb, sewGuide }));
}

export function setCreep(creep: Creep): void {
  updateActiveNotebook((nb) => ({ ...nb, creep }));
}

export async function getSourceBytes(sourceId: string): Promise<ArrayBuffer | undefined> {
  return getPdfBytes(sourceId);
}

export function createPrinterProfile(
  name: string,
  outputFacing: PrinterProfile["outputFacing"],
  reloadFlip: PrinterProfile["reloadFlip"],
): PrinterProfile {
  const profile: PrinterProfile = {
    id: id(),
    name,
    outputFacing,
    reloadFlip,
    backsOrder: "reversed",
    backsRotationDeg: 180,
  };
  printerProfiles.value = [...printerProfiles.value, profile];
  persist();
  return profile;
}

export function setPrinterProfileBacksOrder(
  profileId: string,
  backsOrder: NonNullable<PrinterProfile["backsOrder"]>,
): void {
  printerProfiles.value = printerProfiles.value.map((profile) =>
    profile.id === profileId ? { ...profile, backsOrder } : profile,
  );
  persist();
}

export function setPrinterProfileBacksRotation(profileId: string, backsRotationDeg: 0 | 180): void {
  printerProfiles.value = printerProfiles.value.map((profile) =>
    profile.id === profileId ? { ...profile, backsRotationDeg } : profile,
  );
  persist();
}

export function deletePrinterProfile(profileId: string): void {
  printerProfiles.value = printerProfiles.value.filter((p) => p.id !== profileId);
  if (activePrinterProfileId.value === profileId) activePrinterProfileId.value = null;
  notebooks.value = notebooks.value.map((n) =>
    n.printerProfileId === profileId ? { ...n, printerProfileId: undefined } : n,
  );
  persist();
}

export function setActivePrinterProfile(profileId: string | undefined): void {
  activePrinterProfileId.value = profileId ?? null;
  persist();
}

export const activePrinterProfile = computed<PrinterProfile | null>(() => {
  if (!activePrinterProfileId.value) return null;
  return printerProfiles.value.find((profile) => profile.id === activePrinterProfileId.value) ?? null;
});
