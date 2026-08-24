import type { JSX } from "preact";
import type { CoverPageRef, CoverPages, PageSizePreset } from "../core/model";
import {
  activeNotebook,
  setBindingMargin,
  setCoverMode,
  setCoverPage,
  setCreep,
  setMedia,
  setPageSizePreset,
  setSewGuide,
  sources,
} from "../store";

const COVER_POSITIONS: { key: keyof CoverPages; label: string }[] = [
  { key: "outsideFront", label: "Outside front" },
  { key: "insideFront", label: "Inside front" },
  { key: "insideBack", label: "Inside back" },
  { key: "outsideBack", label: "Outside back" },
];

function coverRefToValue(ref: CoverPageRef | null): string {
  return ref ? `${ref.sourceId}:${ref.sourcePage}` : "";
}

function valueToCoverRef(value: string): CoverPageRef | null {
  if (!value) return null;
  const [sourceId, pageStr] = value.split(":");
  return { sourceId, sourcePage: Number(pageStr) };
}

const PRESET_LABELS: Record<PageSizePreset, string> = {
  fieldnotes: "Field Notes 3.5×5.5in",
  a6: "A6 10×14cm",
  halfletter: "Half-Letter 5.5×8.5in",
  a5: "A5",
  custom: "Custom",
};

export function Settings(): JSX.Element | null {
  const nb = activeNotebook.value;
  if (!nb) return null;

  return (
    <section class="settings">
      <h2>Settings</h2>

      <label class="settings-row">
        Page size
        <select
          value={nb.pageSizePreset}
          onChange={(e) => setPageSizePreset((e.target as HTMLSelectElement).value as PageSizePreset)}
        >
          {(Object.keys(PRESET_LABELS) as PageSizePreset[]).map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </option>
          ))}
        </select>
      </label>
      <div class="settings-hint">
        {nb.pageSize.widthMm.toFixed(1)} × {nb.pageSize.heightMm.toFixed(1)} mm
      </div>

      <label class="settings-row">
        Media
        <select
          value={nb.media.mode}
          onChange={(e) => {
            const mode = (e.target as HTMLSelectElement).value;
            setMedia(mode === "precut" ? { mode: "precut" } : { mode: "trim", stock: "letter" });
          }}
        >
          <option value="precut">Pre-cut sheets</option>
          <option value="trim">Standard stock + trim</option>
        </select>
      </label>

      {nb.media.mode === "trim" && (
        <label class="settings-row">
          Stock
          <select
            value={typeof nb.media.stock === "string" ? nb.media.stock : "letter"}
            onChange={(e) => setMedia({ mode: "trim", stock: (e.target as HTMLSelectElement).value as "letter" | "a4" })}
          >
            <option value="letter">US Letter</option>
            <option value="a4">A4</option>
          </select>
        </label>
      )}

      <label class="settings-row">
        Binding margin (mm)
        <input
          type="number"
          min={0}
          step={0.5}
          value={nb.bindingMarginMm}
          onInput={(e) => setBindingMargin(Number((e.target as HTMLInputElement).value))}
        />
      </label>

      <label class="settings-row">
        Cover
        <select
          value={nb.coverMode}
          onChange={(e) => setCoverMode((e.target as HTMLSelectElement).value as typeof nb.coverMode)}
        >
          <option value="none">None</option>
          <option value="separate-wrap">Separate wrap</option>
          <option value="in-signature">In signature</option>
        </select>
      </label>

      {nb.coverMode === "separate-wrap" && (
        <div class="cover-pages">
          {COVER_POSITIONS.map(({ key, label }) => (
            <label class="settings-row" key={key}>
              {label}
              <select
                value={coverRefToValue(nb.coverPages[key])}
                onChange={(e) => setCoverPage(key, valueToCoverRef((e.target as HTMLSelectElement).value))}
              >
                <option value="">Blank</option>
                {Object.values(sources.value).map((source) =>
                  Array.from({ length: source.pageCount }, (_, i) => i).map((pageIndex) => (
                    <option key={`${source.id}:${pageIndex}`} value={`${source.id}:${pageIndex}`}>
                      {source.filename} — page {pageIndex + 1}
                    </option>
                  )),
                )}
              </select>
            </label>
          ))}
        </div>
      )}

      <label class="settings-row">
        Sew guide
        <select
          value={nb.sewGuide.line}
          onChange={(e) =>
            setSewGuide({ ...nb.sewGuide, line: (e.target as HTMLSelectElement).value as typeof nb.sewGuide.line })
          }
        >
          <option value="none">Off</option>
          <option value="innermost">Innermost sheet</option>
          <option value="all">All sheets</option>
        </select>
      </label>

      {nb.sewGuide.line !== "none" && (
        <label class="settings-row">
          Stations
          <select
            value={nb.sewGuide.stations}
            onChange={(e) =>
              setSewGuide({ ...nb.sewGuide, stations: Number((e.target as HTMLSelectElement).value) as 0 | 3 | 5 })
            }
          >
            <option value={0}>None</option>
            <option value={3}>3-hole</option>
            <option value={5}>5-hole</option>
          </select>
        </label>
      )}

      <label class="settings-row">
        Creep compensation
        <input
          type="checkbox"
          checked={nb.creep.enabled}
          onChange={() => setCreep({ ...nb.creep, enabled: !nb.creep.enabled })}
        />
      </label>
    </section>
  );
}
