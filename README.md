# bookmaker

A local-first web app for turning PDFs into printable, hand-bindable booklets.

You pick a page size and page count, import one or more PDFs, arrange the pages,
and bookmaker imposes them so that when you print the sheets, fold the stack in
half, and bind it, the pages read in order.

Everything runs in the browser. Nothing is uploaded. Notebooks live in
`localStorage`; imported PDF bytes live in IndexedDB.

## Status

Design phase. See [PLAN.md](PLAN.md) for the implementation plan.

## The problem it solves

A folded booklet is a *single signature*: sheets nested inside one another and
folded once down the middle. Because of the nesting, page 1 shares a sheet side
with the last page, page 2 with the second-to-last, and so on. Getting this wrong
by hand is easy, and you only find out after you've printed and folded.

For a 16-page booklet (4 sheets), the layout is:

| Sheet | Front side (left / right) | Back side (left / right) |
|-------|---------------------------|--------------------------|
| 1     | 16 / 1                    | 2 / 15                   |
| 2     | 14 / 3                    | 4 / 13                   |
| 3     | 12 / 5                    | 6 / 11                   |
| 4     | 10 / 7                    | 8 / 9                    |

bookmaker computes this for any page count, shows it as little paper previews
with a dotted fold line, and exports it as print-ready PDFs.

## Page size and paper

The book page size is freely user-defined. The only constraint is that it must
fit within **half a sheet** of whatever paper you're feeding the printer.

Presets: Field Notes 3.5×5.5in · A6 10×14cm · Half-Letter 5.5×8.5in · A5 · Custom.

Two ways to get there:

**Print on standard paper and trim.** US Letter fed landscape is 11×8.5in, so
each half is 5.5×8.5in — any page up to that size works. The two pages are placed
**hard against the centre fold line** and centred vertically, so all the waste
paper ends up on the three outer edges. You fold the whole stack first, then trim
the head, tail, and fore-edge of the folded block in one cut each.

```
   ┌─────────────────────────────────────┐  ← trim
   │           ┊                         │
   │   ┌───────┼───────┐                 │
   │   │ pg 16 ┊ pg 1  │                 │
   │   │       ┊       │                 │
   │   └───────┼───────┘                 │
   │           ┊                         │
   └─────────────────────────────────────┘  ← trim
       ↑       fold        ↑
      trim                trim
```

Trimming after folding matters: it squares up the block and cancels *creep*, the
way inner sheets push out further at the fore-edge than outer ones.

Note the waste — a 3.5×5.5in page on Letter throws away roughly half the sheet.
That's the cost of using paper you already have.

**Print on pre-cut sheets.** Feed paper already trimmed to the unfolded sheet
size (two pages wide, e.g. 7×5.5in for Field Notes). No trimming, no waste. This
is the mode for unbinding an existing notebook, printing on its own sheets, and
rebinding it.

## Readability

This is the thing to understand before you print anything.

A Letter page scaled down to a Field Notes page is a scale factor of about 0.41.
Ten-point body text lands at roughly four points — bound beautifully and
unreadable. No amount of imposition fixes this.

bookmaker does two things about it:

- **Margin trimming (default).** Most PDFs waste 15–25% of each dimension on
  white margins. bookmaker detects each page's ink bounding box, crops to it plus
  a little padding, and *then* fits. That typically recovers a scale factor of
  0.41 to around 0.55.
- **A readability estimate at import.** It measures the dominant text height in
  the source, multiplies by the final scale, and tells you up front: *"body text
  will print at approximately 4.2pt — consider a larger page size."*

What it can't do is reflow text. Genuinely good results come from sources already
typeset near the target size. If your PDF is a Letter-sized text document, expect
to either accept small type, choose a bigger page, or re-export the source at the
booklet's dimensions first.

## How you use it

1. **New notebook.** Choose a page size and page count. The count rounds up to a
   multiple of 4; the blanks go at the end and are shown as such.
2. **Import PDFs.** Drop in one or more files. Each becomes a *group* in the left
   sidebar with its pages beneath it. Groups collapse, reorder as a unit, or break
   apart. Each import reports its readability estimate.
3. **Arrange.** Drag pages or whole groups. Delete pages, insert blanks, insert
   dividers. The sidebar is the book's reading order, top to bottom.
4. **Review the imposition.** The main area shows sheets in print order, split
   into **Fronts** and **Backs**. Each sheet is drawn as a landscape rectangle
   with a dotted fold line down the middle, two page thumbnails, and their book
   page numbers.
5. **Print.** Two passes: print the Fronts, reload the stack, print the Backs.
   The app gives the exact reload instruction for your printer — including a
   one-time **flip calibration** so you find out which way your printer wants the
   paper *before* you waste a stack of it.
6. **Fold, trim, bind.** Fold the whole stack at once, trim the outer edges if
   you printed oversized, staple or sew through the spine.

## Sew guide

Optionally, bookmaker prints a dotted line down the fold with pamphlet-stitch
station marks — the dots telling you where to pierce. Available on every page
size and both media modes.

By default it prints only on the **innermost** sheet, because that's the surface
you're looking at when you open the folded block to its centre and sew from the
inside. You can also put it on every sheet if you'd rather have a fold guide on
each one, or turn it off.

Three-hole or five-hole spacing, measured against the *trimmed* page height so
the stations land correctly on the finished book. It's drawn in the on-screen
sheet preview too, so you can see exactly which spread will carry it.

## Covers

Field Notes-style books wrap the signature in a separate heavier cover rather
than making it part of the page count. Three modes:

- **None** (default) — no cover output. For reusing the cover from a notebook
  you've unbound.
- **Separate wrap** — the cover is its own sheet, imposed as back-cover-left /
  front-cover-right and exported as a third PDF so you can run it on cardstock.
  Not counted in the page total.
- **In signature** — the zine case: pages 1 and N *are* the cover, on the same
  stock as everything else.

## Flip calibration

Printers disagree about how they stack output and how they take paper back in.
Rather than guess, bookmaker prints one calibration sheet marked `FRONT · TOP`,
asks you to reload it exactly as you'd reload the real stack, prints the second
side, and shows four pictured outcomes to choose from. It stores the answer per
printer profile and applies the right sheet order and rotation to every export
from then on.

## Non-goals

- Multi-signature (several folded groups sewn together) — single signature only.
- Automatic duplex. The two-pass workflow is the point.
- Text reflow or re-typesetting. Pages are placed as-is, cropped and scaled.
- Any server, account, or sync.

## Stack

TypeScript, Preact, Vite. `pdfjs-dist` for rendering, `pdf-lib` for export.
No backend.
