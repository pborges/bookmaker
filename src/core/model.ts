import type { BookItem, Group as PageGroup } from "./pages";

export interface Size {
  widthMm: number;
  heightMm: number;
}

export type PageSizePreset = "fieldnotes" | "a6" | "halfletter" | "a5" | "custom";

export type Media = { mode: "precut" } | { mode: "trim"; stock: "letter" | "a4" | Size };

export type CalliperStock = "20lb" | "24lb" | "32lb" | "cardstock";

export interface Creep {
  enabled: boolean;
  stock: CalliperStock | { callipersMm: number };
}

export type SewLine = "none" | "innermost" | "all";

export interface SewGuide {
  line: SewLine;
  stations: 0 | 3 | 5;
}

export type CoverMode = "none" | "separate-wrap" | "in-signature";
export type Scaling = "trim-fit" | "fit" | "fill";

export interface CoverPageRef {
  sourceId: string;
  sourcePage: number;
}

export interface CoverPages {
  outsideFront: CoverPageRef | null;
  insideFront: CoverPageRef | null;
  insideBack: CoverPageRef | null;
  outsideBack: CoverPageRef | null;
}

export const EMPTY_COVER_PAGES: CoverPages = {
  outsideFront: null,
  insideFront: null,
  insideBack: null,
  outsideBack: null,
};

export interface Group extends PageGroup {
  id: string;
  label: string;
  sourceId?: string;
  collapsed: boolean;
  startOnRecto: boolean;
  scaling?: Scaling;
}

export interface Source {
  id: string;
  filename: string;
  pageCount: number;
}

export interface PrinterProfile {
  id: string;
  name: string;
  outputFacing: "up" | "down";
  reloadFlip: "long" | "short";
  /** Explicit override for how the Backs PDF is ordered. Older profiles omit
   * this and use the default reversed order. */
  backsOrder?: "forward" | "reversed";
  /** Explicit override for whole-sheet Backs rotation. Older profiles infer
   * this from the calibrated reload flip. */
  backsRotationDeg?: 0 | 180;
}

export interface Notebook {
  id: string;
  name: string;
  pageSize: Size;
  pageSizePreset: PageSizePreset;
  media: Media;
  targetPageCount: number;
  bindingMarginMm: number;
  creep: Creep;
  sewGuide: SewGuide;
  coverMode: CoverMode;
  coverPages: CoverPages;
  scaling: Scaling;
  items: BookItem[];
  groups: Group[];
  /** Legacy per-notebook selection, retained only for persistence migration. */
  printerProfileId?: string;
}

export const SCHEMA_VERSION = 2;

export interface PersistedState {
  schemaVersion: number;
  notebooks: Notebook[];
  printerProfiles: PrinterProfile[];
  activePrinterProfileId?: string;
  sources: Record<string, Source>;
}

export function createEmptyNotebook(id: string, name: string, pageSize: Size, preset: PageSizePreset): Notebook {
  return {
    id,
    name,
    pageSize,
    pageSizePreset: preset,
    media: { mode: "precut" },
    targetPageCount: 16,
    bindingMarginMm: 3,
    creep: { enabled: false, stock: "24lb" },
    sewGuide: { line: "none", stations: 0 },
    coverMode: "none",
    coverPages: { ...EMPTY_COVER_PAGES },
    scaling: "trim-fit",
    items: [],
    groups: [],
  };
}

export const PAGE_SIZE_PRESETS: Record<Exclude<PageSizePreset, "custom">, Size> = {
  fieldnotes: { widthMm: 88.9, heightMm: 139.7 },
  a6: { widthMm: 105, heightMm: 148 },
  halfletter: { widthMm: 139.7, heightMm: 215.9 },
  a5: { widthMm: 148, heightMm: 210 },
};
