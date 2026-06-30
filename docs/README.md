# How this website works

The live site is just **one column of justified, auto-hyphenated text**.
There is no login, no CMS, and no editor on the page itself.

## To edit the text

You only ever edit one file: **`content.md`** (in this `docs/` folder).

1. Open `content.md` on GitHub.com.
2. Click the pencil (✏️) icon, top right.
3. Edit the text and click **Commit changes**.
4. Wait ~30 seconds — the live site updates on its own.

You never need to touch `index.html`.

## Writing rules (Markdown)

- `# Title` — the main title (one `#`)
- `## Section` — a section heading (two `#`)
- `### Sub-heading` — a smaller heading (three `#`)
- Leave a **blank line** between paragraphs.
- `**bold**`, `*italic*`, `[link text](https://address)`
- Lines starting with `- ` become a bullet list.
- A line starting with `> ` becomes a quotation.

## One-time setup (already done, or do once)

In the repository, go to **Settings → Pages**, set the source to
**Deploy from a branch**, pick your default branch and the **`/docs`**
folder, and save. GitHub gives you the public URL.
