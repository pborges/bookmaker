# bookmaker — implementation plan

## 1. Decisions locked in

| Decision | Choice |
|---|---|
| Binding | Single signature (one folded stack), saddle-stapled or sewn |
| Printing | Manual two-pass: all Fronts, reload, all Backs |
| Page size | User-defined, constrained to fit half a sheet. Presets: Field Notes 3.5×5.5in, A6 10×14cm, Half-Letter, A5, Custom |
| Media | "Pre-cut sheets" or "standard stock + trim after folding" |
| Group parity | Groups pad to even length so each starts on a right-hand page (toggleable) |
| Covers | `none` (default) / `separate-wrap` / `in-signature` |
| Sew guide | Optional dotted fold/sew line with pamphlet-stitch station marks; previewed in the UI |
| Fill blanks | Appended at the end only; mid-book blanks are inserted manually |
| Readability | Warns with an estimate; never suggests or changes a page size |
| Creep input | Stock-weight dropdown with typical calipers, custom mm as escape hatch |
| Scaling | Trim margins to ink bbox, then fit. Readability estimate at import |
| Persistence | localStorage for notebook state, IndexedDB for PDF bytes and thumbnails |
| Stack | TypeScript + Preact + Vite, `pdfjs-dist`, `pdf-lib` |

## 2. Core model

```ts
interface Size { widthMm: number; heightMm: number; }

interface Notebook {
  id: string;
  name: string;
  pageSize: Size;                   // one book page, folded
  pageSizePreset: 'fieldnotes' | 'a6' | 'halfletter' | 'a5' | 'custom';
  media:
    | { mode: 'precut' }                                  // sheet = 2 × pageSize
    | { mode: 'trim'; stock: 'letter' | 'a4' | Size };    // page centred on half-sheet
  targetPageCount: number;          // rounded to a multiple of 4
  bindingMarginMm: number;          // gutter at the fold
  creep: {
    enabled: boolean;                       // default false
    stock: '20lb' | '24lb' | '32lb' | 'cardstock' | { callipersMm: number };
  };
  sewGuide: {
    line: 'none' | 'innermost' | 'all';     // default 'none'
    stations: 0 | 3 | 5;
  };
  coverMode: 'none' | 'separate-wrap' | 'in-signature';
  scaling: 'trim-fit' | 'fit' | 'fill';   // notebook default, overridable per group
  items: BookItem[];                // reading order, flattened
  groups: Group[];
  printerProfileId?: string;
}

interface Group {
  id: string;
  label: string;
  sourceId?: string;
  collapsed: boolean;
  startOnRecto: boolean;            // default true
  scaling?: 'trim-fit' | 'fit' | 'fill';
}

type BookItem =
  | { kind: 'pdf';   id: string; groupId: string; sourceId: string; sourcePage: number }
  | { kind: 'blank'; id: string; groupId?: string; reason: 'manual' | 'parity' | 'fill' }
  | { kind: 'divider'; id: string; label: string; groupId?: string };

interface Source { id: string; filename: string; pageCount: number; }  // bytes in IndexedDB
```

Reading order is the flat `items` array. `groupId` is what makes a run of items
move together; reorder logic enforces that groups stay contiguous.

## 3. Imposition

Single signature, `N` pages (a multiple of 4), `S = N / 4` sheets. Zero-indexed
sheet `i`, one-indexed page numbers:

```
front(i) = { left: N - 2i,  right: 2i + 1     }
back(i)  = { left: 2i + 2,  right: N - 2i - 1 }
```

Sheet 0 is the outermost. Pure function, unit-tested against the hand-checked
16-page table in the README and property-tested: every page appears exactly once,
and walking the folded stack yields 1..N in order.

## 4. Page list resolution

The sidebar's item list is not the final page list. Resolution runs in a fixed
order, and the order matters:

1. **Flatten** items in reading order.
2. **Parity pad** — for each group with `startOnRecto` and an odd length, append
   a `blank` with `reason: 'parity'`.
3. **Cover** — if `in-signature`, reserve first and last positions.
4. **Fill** — append `blank`s with `reason: 'fill'` until the count is a multiple
   of 4 and at least `targetPageCount`.

Fill blanks are always appended at the end, never distributed through the book.
A blank in the middle — the back of a title page, a deliberate gap between
sections — is a layout choice, so it's a manual insert with
`reason: 'manual'` and the resolver leaves it alone.

The three blank reasons render distinctly in the sidebar (manual: solid outline;
parity: dashed with a "▸" marker; fill: faint). Without that distinction the page
count is impossible to reason about.

**Tooltip on the parity toggle** — most people don't know the word *recto*. The
control reads "Start on a right-hand page" with a hover tooltip:

> In a bound book, odd-numbered pages fall on the right (the *recto*) and even
> ones on the left. With this on, bookmaker adds a blank page after this group if
> needed, so the next document opens on a fresh right-hand page instead of on the
> back of this one.

Same wording on the parity blanks themselves: *"Blank added so the next group
starts on a right-hand page."*

## 5. Sheet composition and trimming

Sheet side is a landscape rectangle, fold line down the centre.

- **Precut mode** — sheet is `2 × pageWidth` by `pageHeight`. Each page fills its
  half, less `bindingMarginMm` at the fold edge.
- **Trim mode** — sheet is the stock size fed landscape (Letter → 279.4×215.9mm).
  Each half is `stockWidth/2` wide. The page box is placed **flush against the
  centre fold line** and **centred vertically**, so all waste falls on the head,
  tail, and fore-edge. Validation rejects a page size larger than half the stock,
  with a message naming the maximum for the chosen stock.

Trim mode also draws:
- corner crop marks just outside each page box,
- fold ticks at the head and tail of the centreline (these land in the trim area
  and are cut away),
- a faint sheet number in the trim margin for keeping the stack ordered.

### Sew guide

A dotted line down the centre fold, optionally with pamphlet-stitch station
marks. Configurable on any page size and either media mode, since it's drawn
from the fold position and the *trimmed* page height rather than the stock size.

Where it prints matters. A pamphlet stitch is sewn from the **inside** of the
folded block — you pierce the innermost spread and work outward. So the guide is
only useful on the sheet that ends up innermost:

- `innermost` (default when enabled) — drawn on sheet `S-1`, back side, the
  spread carrying pages `N/2` and `N/2 + 1`. This is the surface facing you when
  the folded stack is open at its centre.
- `all` — drawn on every sheet side. Some people want it on every sheet as a fold
  guide, at the cost of a visible dotted line on interior spreads.
- `none` — off.

Station marks are dots on the line, spaced from the trimmed page height `H`:

- **3-hole**: `H/2`, `H/2 ± H/4`
- **5-hole**: `H/2`, `H/2 ± H/6`, `H/2 ± H/3`

Heights are measured against the trimmed page, not the sheet, so in trim mode the
stations sit correctly on the finished book rather than drifting once the head
and tail are cut off. The line itself extends the full trimmed height and stops
there — it must not run into the trim area, or the last dots get cut away.

Rendered as a light grey dotted stroke with slightly heavier dots at the
stations, so it guides without dominating the page.

The guide is **drawn in the sheet preview**, not just the export. It changes what
the innermost spread looks like, and finding a dotted line in the PDF that wasn't
on screen is a bad surprise.

**Creep compensation** (optional, off by default): inner sheets protrude further
at the fore-edge, so trimming the folded block eats more of their outer margin.
Shift each page toward the fold by `sheetIndex × callipers × k`. For a four-sheet
Field Notes booklet this is 1–2mm — marginal, but nearly free once the placement
code is parameterised.

Thickness comes from a **stock dropdown**, not a number field: nobody knows their
paper's calliper in millimetres, but everyone knows what they loaded.

| Stock | Calliper |
|---|---|
| 20lb bond (75gsm) | 0.10mm |
| 24lb bond (90gsm) | 0.12mm |
| 32lb bond (120gsm) | 0.15mm |
| Cardstock (200gsm+) | 0.25mm |

A custom-millimetres escape hatch sits behind a "measure it yourself" disclosure
for anyone using unusual paper.

## 6. Scaling and readability

At import, each source page is rasterized once for its thumbnail. That same
bitmap is reused for:

- **Ink bounding box** — scan for non-background pixels, inset a small padding,
  map back to PDF user space. This is the crop box for `trim-fit`.
- **Dominant text height** — histogram of connected-component heights in the
  bitmap; take the mode. Multiply by the final placement scale to get an
  estimated printed point size.

The import summary shows: source size, crop recovered, final scale, and
**estimated body text size**, with a warning band under ~6pt suggesting a larger
page size. Per-group override to `fit` (letterbox) or `fill` (crop to fill).

Both measurements are heuristics on a low-res raster; the UI says "approximately"
and never blocks export on them.

The estimate **warns and stops there**. It does not suggest or apply a different
page size: the page size is usually dictated by a physical notebook you're
rebinding, so it isn't a free variable, and a recommendation that ignores that
would be noise.

## 7. Two-pass print order and flip calibration

Fronts emit sheets 0..S-1. The correct Backs order and rotation depend on two
printer facts — whether output stacks face-up or face-down, and whether the user
flips the reload stack on the long or short edge. Four combinations.

- `PrinterProfile { id, name, outputFacing: 'up'|'down', reloadFlip: 'long'|'short' }`
- Calibration wizard prints one sheet marked `FRONT · TOP EDGE ↑`, has the user
  reload as they normally would, prints side two, then shows four labelled
  diagrams of the possible results to pick from. That selection resolves the
  profile.
- The profile drives `backsOrder` (forward/reversed) and `backsRotation` (0°/180°).
- Profiles persist; two printers means two profiles.
- Before calibration, export is allowed but the print panel shows a "not
  calibrated — print one test sheet first" banner.

## 8. UI

```
┌───────────────┬──────────────────────────────────────┐
│ Sidebar       │  Toolbar: name · size · count · Print │
│  ▼ notes.pdf  │                                       │
│    1 ▢        │  FRONTS                               │
│    2 ▢        │   ┌───────┬───────┐ ┌───────┬───────┐ │
│    3 ▢        │   │  16   ┊   1   │ │  14   ┊   3   │ │
│    ▸ blank    │   └───────┴───────┘ └───────┴───────┘ │
│  ▼ zine.pdf   │       sheet 1           sheet 2       │
│    5 ▢        │                                       │
│  + blank      │  BACKS                                │
│               │   ┌───────┬───────┐ ┌───────┬───────┐ │
│  12 / 16 pages│   │   2   ┊  15   │ │   4   ┊  13   │ │
└───────────────┴──────────────────────────────────────┘
```

- **Sidebar** — vertical reading order. Group headers carry a drag handle that
  moves the whole run, a collapse chevron, the recto toggle, and a scaling
  override. Individual pages drag within and between groups. Per-item: delete,
  duplicate, insert blank. Footer shows `used / target` with a breakdown of the
  three blank kinds on hover.
- **Main area** — Fronts and Backs sections, each sheet a landscape card with the
  dotted fold line, two thumbnails, corner page numbers, sheet number beneath. In
  trim mode the card also shows the trim area as a hatched border so the waste is
  visible, and the sew guide is drawn on whichever sheets will carry it. Hovering a sheet highlights its pages in the sidebar and vice versa.
- **Print panel** — media mode, stock and weight, sew guide, printer profile,
  calibration link, then a
  numbered instruction card generated from the resolved profile, with a diagram:
  *"1. Load N sheets. 2. Print Fronts. 3. Take the output stack, keep it in order,
  rotate 180° in the plane of the paper, put it back printed-side down. 4. Print
  Backs. 5. Fold the stack. 6. Trim head, tail, and fore-edge."*

## 9. Export

`pdf-lib`. Build `S` landscape sheet-sized pages per pass, `embedPdf` each source
page, place it into its half with the crop box, scale, binding margin, and creep
offset applied. Outputs:

- `<name>-fronts.pdf`
- `<name>-backs.pdf`
- `<name>-cover.pdf` (separate-wrap mode only)

Each downloads and offers a browser print preview.

## 10. Build order

1. **Scaffold** — Vite + Preact + TS strict, Vitest.
2. **Imposition core** — `src/core/imposition.ts` + tests. No UI. This must be
   right; everything else is presentation.
3. **Page list resolution** — `src/core/pages.ts`, the four-stage pipeline in §4,
   heavily tested around parity + fill interaction.
4. **Model + persistence** — signal-based store, localStorage serialisation,
   IndexedDB cache, schema version with a migration hook.
5. **PDF import** — file drop, pdf.js parse, thumbnail generation with progress.
6. **Crop + readability analysis** — ink bbox and text-height estimate off the
   thumbnail raster; import summary UI.
7. **Sidebar** — list, groups, drag-and-drop with group contiguity, blank kinds,
   recto toggle and tooltip.
8. **Sheet view** — Fronts/Backs, sheet cards, fold line, trim hatching, hover
   linking.
9. **Sheet geometry + export** — placement math for both media modes, crop marks,
   fold ticks, sew guide and stations, creep; pdf-lib composition.
10. **Flip calibration** — wizard, four-way result picker, profile persistence,
    generated instruction text.
11. **Covers** — separate-wrap imposition and third export.
12. **Polish** — keyboard reordering, undo/redo on the item list, empty states,
    notebook list screen.

Steps 2 and 3 are the foundation and worth doing thoroughly before any pixels:
a subtle bug in either is invisible on screen and only surfaces after you've
folded a stack of paper.

## 11. Still open

Nothing outstanding. Every design question raised during planning is resolved in
the decision table in §1 and detailed in the section it belongs to.

New questions will surface once there's real output to look at — particularly
around how the crop and readability heuristics behave on actual source PDFs
(§6), which is the part of this plan resting on the least certain ground.
