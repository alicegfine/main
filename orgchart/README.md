# OrgDraft

A small web app for drafting, comparing, and exporting **board-ready org charts**.
Built to make slide prep fast: load the current staff, try "what-if" structures
side by side, and export a clean image you can drop straight into a deck.

No build step, no dependencies, no backend — it's plain HTML/CSS/JS that runs
entirely in the browser. Staff data never leaves the machine.

## What it does

- **Load staff from a CSV** — columns `Name, Title, Reports To` (manager by name).
  Also edit everyone directly in the app.
- **Scenarios** — keep several versions of the org in one place and switch between
  them with tabs. No juggling browser tabs.
- **Compare** — view scenarios side by side with a diff readout (`+1 new · 3 moved`).
- **Proposed roles** — mark a role as not-yet-hired (shown as a dashed box). Add a
  "Managing Director" the directors report into and the chart **reflows automatically**.
- **Export** — PNG (2× for crisp slides), editable SVG (open in PowerPoint / Figma /
  Illustrator to hand-tweak), or copy the image straight to the clipboard.
- **Autosaves** to the browser, so work survives a refresh.

## Using it

1. **Import CSV** (or start from the sample that loads on first run).
2. Edit names, titles, and reporting lines in the left rail. The chart updates live.
3. To try a what-if: click **+** to duplicate the current org into a new scenario,
   then edit freely — the original is untouched. Use **Reset to current** to start over.
4. To draft an unfilled role: **+ Add person**, leave the name blank, give it a title,
   set who it reports to, and click the **◇** toggle to mark it *Proposed*. Point the
   relevant people at it and the layout reflows.
5. **Compare** to see versions next to each other.
6. **Export ▾** → PNG for the deck, or SVG if you want to nudge boxes by hand.

### CSV format

| Column      | Required | Notes                                            |
| ----------- | -------- | ------------------------------------------------ |
| Name        | yes      | Leave blank for an unfilled/proposed role        |
| Title       | —        | Role / job title                                 |
| Reports To  | —        | The **Name** of the manager; blank = top of chart |
| Proposed    | —        | `yes` / `true` / `x` to flag a not-yet-hired role |
| Note        | —        | Free text, shown on hover                        |

Headers are matched loosely (e.g. `Manager`, `Supervisor`, `Role` all work). A file
with no recognizable header is read positionally as Name, Title, Reports To.
See `sample-staff.csv`.

## Running / hosting

This is a static site, but it uses ES modules, so it must be **served over HTTP**
(not opened as a `file://` path).

Local preview:

```bash
cd orgchart
python3 -m http.server 8000      # then open http://localhost:8000
# or: npx http-server -p 8000
```

Hosting: drop the `orgchart/` folder on any static host — Netlify, Vercel,
GitHub Pages, S3/CloudFront, or an internal share that serves static files.
There's nothing to build and no server code.

## Project layout

```
orgchart/
  index.html        # app shell
  styles.css        # all styling
  sample-staff.csv  # example roster
  src/
    csv.js          # CSV import / export
    model.js        # data model, scenarios, forest building, cycle checks
    layout.js       # tidy top-down tree layout (pure geometry)
    render.js       # draws a scenario to SVG (inline styles -> faithful export)
    exporter.js     # SVG / PNG / clipboard export
    app.js          # UI wiring, state, persistence
```

## Notes

- Chart node text uses a system sans on purpose, so the exported PNG/SVG renders
  identically everywhere with no web-font dependency (no blank text in slides).
- Removing a person re-points their reports to that person's manager.
- Reporting loops are detected and blocked; broken/missing managers surface as a
  warning and the person is shown at the top.
