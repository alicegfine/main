# OrgDraft

A small web app for drafting, comparing, and exporting **board-ready org charts**.
Built to make slide prep fast: load the current staff, try "what-if" structures
side by side, and export a clean image you can drop straight into a deck.

No build step, no dependencies, no backend — it's plain HTML/CSS/JS that runs
entirely in the browser. Staff data never leaves the machine.

## What it does

- **Build the roster in the app** — add people, set titles, reporting lines, and a
  role category for each, all from the roster editor.
- **Scenarios** — keep several versions of the org in one place and switch between
  them with tabs. No juggling browser tabs.
- **Compare** — view scenarios side by side with a diff readout (`+1 new · 3 moved`).
- **Proposed roles** — mark a role as not-yet-hired (shown as a dashed box). Add a
  "Managing Director" the directors report into and the chart **reflows automatically**.
- **Reassign reports in bulk** — pick a manager, tick several people, and move them all
  at once (e.g. point every director at a new Managing Director).
- **Layout styles** — "Grid" (default): a manager's reports wrap into a compact two-row
  brick (top row, then the rest tucked into the gaps below) instead of one long row.
  "Tree" is the classic wide top-down view. Cards are colored by level
  (exec → director → team) so seniority reads at a glance.
- **Find a person** — search box to jump to anyone in a large roster; the "Reports to"
  picker is a type-ahead so you don't scroll a list of everyone.
- **Save / Open project** — export the whole project (all scenarios) to a `.json` file
  as a backup or to hand to a colleague; open it to pick up where you left off.
- **Shared version (when hosted with the included server)** — the org is stored on the
  server, so everyone who opens the URL sees and edits one live copy. Changes made by
  one person show up for the others within ~15 seconds; simultaneous edits are guarded
  with a "someone else just saved — reload?" prompt. If the backend isn't reachable
  (e.g. a plain static host), it falls back to saving in the browser automatically.
- **Branding** — accent/proposed colors, an optional export title, and a logo are set
  once in `src/brand.js` and applied to the chart and every export.
- **Export** — PNG (2× for crisp slides), editable SVG (open in PowerPoint / Figma /
  Illustrator to hand-tweak), or copy the image straight to the clipboard.
- **Autosaves** to the browser, so work survives a refresh.

## Using it

1. Start from the sample that loads on first run, or **Clear everything** to begin fresh.
2. Click **Edit people** to add names, titles, categories, and reporting lines. The chart updates live.
3. To try a what-if: click **+** to duplicate the current org into a new scenario,
   then edit freely — the original is untouched. Use **Reset to current** to start over.
4. To draft an unfilled role: **+ Add person**, leave the name blank, give it a title,
   set who it reports to, and click the **◇** toggle to mark it *Proposed*. Point the
   relevant people at it and the layout reflows.
5. To restructure quickly, use **Reassign reports**: pick the new manager, tick the
   people who should report to them, and click *Reassign selected*.
6. **Compare** to see versions next to each other.
7. **Export ▾** → PNG for the deck, or SVG if you want to nudge boxes by hand.

Brand colors, the export title, and the logo are configured in `src/brand.js`
(not in the app UI) — see that file's comments.

## Running / hosting

This is a static site, but it uses ES modules, so it must be **served over HTTP**
(not opened as a `file://` path).

Local preview:

```bash
cd orgchart
python3 -m http.server 8000      # then open http://localhost:8000
# or: npx http-server -p 8000
```

### Deploy to Railway

This folder ships with a tiny zero-dependency Node server (`server.js`) and a
`package.json` whose `start` script runs it, binding to Railway's `$PORT`.

1. In Railway: **New Project → Deploy from GitHub repo**, pick this repo and branch.
2. Open the service → **Settings → Root Directory** and set it to `orgchart`
   (this repo's root holds unrelated files; the app lives in `orgchart/`).
3. Railway auto-detects Node, runs `npm start`, and serves the app. No build step,
   no env vars needed.
4. **Settings → Networking → Generate Domain** to get a public URL.

To redeploy, push to the branch — Railway rebuilds automatically.

#### Make the shared org durable (Railway Volume)

The shared org is stored in a JSON file on the server (`/api/org`). By default that
file lives next to the app and is wiped on every redeploy. To keep it across deploys,
attach a Volume and point the app at it:

1. Service → **Variables**: add `DATA_FILE` = `/data/org.json`.
2. Service → **Settings → Volumes** (or **+ Create → Volume**): mount path `/data`.
3. Redeploy. The org now persists across redeploys and restarts.

First-time data: the first browser that opens the URL **with an org already in it**
publishes that org as the shared copy. So whoever has the current roster should open
the URL once before sharing it around — see the note below.

Access: there's no login. Anyone with the URL can view and edit, so treat the link as
shared-but-private. (A passcode could be added if needed.)

(If you'd rather not set a root directory, you can instead move the `orgchart/`
contents to the repo root, or point any other static host at this folder.)

### Other static hosts

It's also just static files, so you can drop the `orgchart/` folder on Netlify,
Vercel, GitHub Pages, or S3/CloudFront. (Those don't need `server.js` — it's only
there for Railway-style Node hosting.)

## Project layout

```
orgchart/
  index.html        # app shell
  styles.css        # all styling
  server.js         # tiny static server for Node hosting (Railway)
  package.json      # start script for Railway
  src/
    brand.js        # brand colors / title / logo (edit to match your org)
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
