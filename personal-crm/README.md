# 🤝 Personal Networking CRM

A lightweight, self-hosted CRM for one person doing a lot of networking. Track
who you've reached out to, log your conversations, see who you're pending
replies from, and never let a follow-up slip. Meeting notes flow in
automatically from **Granola**, and a weekly digest of what needs attention
gets pushed to **Slack and email**.

Built to run on [Railway](https://railway.app).

---

## What it does

- **Contacts on a cadence** — set how often you want to be in touch with each
  person (weekly, every 2 weeks, monthly, quarterly…). Everything revolves
  around one question: **who's due?** A contact is due when their cadence has
  elapsed since the last interaction, when you queued them manually, or when
  they're on a cadence but never contacted.
- **"Scheduled" toggle** — booked a meeting? Flip 📅 and reminders pause. It
  clears itself when the meeting actually happens (the Granola sync / logged
  interaction restarts the timer). The loop maintains itself.
- **AI follow-up suggestions** — after a Granola sync, an LLM reads each note
  and surfaces people you should reach out to (mentioned in the notes, not just
  attendees). Review them on the dashboard: **Add** creates a "to reach out"
  contact, **Dismiss** drops it.
- **Email capture** — forward an email (e.g. via Zapier) and it's logged as an
  interaction against the right contact automatically.
- **Daily nudge + weekly digest** — Slack tells you each morning who's due for
  contact (and pending AI suggestions); the weekly digest adds who's coming up
  and how many contacts have no cadence set.
- **Coworkers stay out of the way** — people at your own org (matched by email
  domain) are auto-flagged and excluded from every networking view, digest, and
  nudge. They live in their own tab.
- **Archiving** — one-off contacts (sales demos etc.) can be archived from the
  list in one click; they disappear from everything but the Archived tab, and
  sync won't recreate them.
- **Edit in place** — cadence is a dropdown right in the contacts list (plus a
  🔔 Due-now filter), and the contact page is directly editable (fields +
  notes, ⌘⏎ to save) — no separate edit screen. The old status pipeline is
  retired; cadence + scheduled is the whole model.
- **Conversation log** — every touchpoint (LinkedIn, email, call, meeting…)
  with a date and summary, per contact.
- **Follow-up reminders** — a next-action date on each contact; overdue ones
  surface on the dashboard and in the digest.
- **Dashboard** that leads with what needs you: pending replies, overdue
  follow-ups, contacts going cold, and recent activity.
- **Granola sync** — pulls your meeting notes on a schedule, matches attendees
  to your contacts, logs each note as an interaction (with a link back to
  Granola), and can auto-create contacts for new people you met.
- **Weekly digest** to Slack so follow-through happens even when you're not in
  the app.
- **Password-protected** — it's on the public internet, so your contacts aren't.

## Tech stack

- **Next.js 15** (App Router, TypeScript) — UI + API in one deployable service
- **Prisma + SQLite** — the datastore (a single file on a Railway volume).
  Swappable to Postgres in one step (see below).
- **node-cron** — in-process scheduler for the sync + digest + nudge jobs
- **@anthropic-ai/sdk** — AI follow-up extraction from Granola notes
- **Slack incoming webhook** — digest + nudge delivery

---

## Deploy on Railway

1. **Create a project** from this repo (`personal-crm/` is the app root). Point
   Railway's root directory at `personal-crm` if the repo has other things in it.
2. **Add a Volume** and mount it at `/data`. This is where the SQLite database
   lives so it survives redeploys.
3. **Set environment variables** (Settings → Variables) — see the table below.
   At minimum: `DATABASE_URL=file:/data/crm.db`, `APP_PASSWORD`, `APP_SECRET`.
4. Deploy. Railway runs `npm run build` then `npm run start`. On start the app
   runs `prisma db push` to create/update the SQLite schema automatically, then
   serves on Railway's `$PORT`.
5. Open the URL, log in with `APP_PASSWORD`, and add a contact (or hit **Sync
   Granola**).

`railway.json` sets the health check to `/api/health` so deploys wait for the
app to be actually up.

### Environment variables

| Variable | Required | What it's for |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | `file:/data/crm.db` on Railway (volume-backed). |
| `APP_PASSWORD` | ✅ | The password you type to log in. |
| `APP_SECRET` | ✅ | Signs the session cookie. Use 32+ random bytes. |
| `CRON_SECRET` | ➖ | Bearer token so external cron / Zapier can call `/api/sync` and `/api/digest`. |
| `GRANOLA_API_KEY` | for sync | Granola API key (`grn_…`). Needs a Granola **Business/Enterprise** plan. |
| `GRANOLA_API_BASE` | ➖ | Defaults to `https://public-api.granola.ai/v1`. |
| `GRANOLA_NOTE_URL_TEMPLATE` | ➖ | "Open in Granola" links: copy any note's link from the Granola app and replace the note id with `{id}` (e.g. `https://notes.granola.ai/d/{id}`). Blank = no links. |
| `GRANOLA_AUTO_CREATE_CONTACTS` | ➖ | `true` (default) creates contacts for unmatched attendees. |
| `OWNER_EMAIL` | ➖ | Your own email(s), comma-separated — skipped during sync/ingest so you don't become a contact. |
| `COWORKER_DOMAINS` | ➖ | Email domains flagged as coworkers. Defaults to your `OWNER_EMAIL` domain(s). |
| `ANTHROPIC_API_KEY` | for AI | Enables follow-up extraction from Granola notes. Blank = disabled. |
| `EXTRACT_MODEL` | ➖ | Extraction model. Default `claude-haiku-4-5` (cheap); bump to `claude-opus-4-8` for deeper reasoning. |
| `SLACK_WEBHOOK_URL` | for digest/nudge | Incoming webhook. Blank = digest + nudge disabled. |
| `GRANOLA_SYNC_CRON` | ➖ | Cron for the sync job. Default `0 */2 * * *` (every 2h). |
| `DIGEST_CRON` | ➖ | Cron for the weekly digest. Default `0 8 * * 1` (Mon 08:00). |
| `DAILY_NUDGE_CRON` | ➖ | Cron for the daily LinkedIn nudge. Default `0 8 * * *` (daily 08:00). |
| `TZ` | ➖ | IANA timezone for the schedules + date math. Default `America/New_York`. |
| `ENABLE_SCHEDULER` | ➖ | `false` turns off the in-process cron (drive jobs externally instead). |
| `COLD_AFTER_DAYS` | ➖ | Days without contact before a warm contact is "going cold". Default 21. |

See `.env.example` for a copy-paste starting point.

---

## Connecting Granola

1. In Granola (Business/Enterprise), go to **Settings → API** and create a key.
2. Set `GRANOLA_API_KEY` in Railway and redeploy (or just restart).
3. Set `OWNER_EMAIL` to your own address so you aren't added as a contact.
4. Click **Sync Granola** in the header, or wait for the scheduled sync.

**How matching works:** the list endpoint returns only basic fields, so the
sync fetches each note's detail to get attendees + summary. For each attendee it
looks for an existing contact by email first, then by name. A match logs the
note as a `granola` interaction (deduped per contact per note) and updates their
last-contact date. No match + `GRANOLA_AUTO_CREATE_CONTACTS=true` creates a new
contact.

**First sync only imports the most recent `MAX_NOTES_PER_SYNC` notes** (default
25). Each note needs a detail fetch and, with AI extraction on, an LLM call, so
the run is capped to stay fast. Already-imported notes are skipped, so **running
Sync again backfills older history** a chunk at a time — the sync button tells
you when more remain. Bump `MAX_NOTES_PER_SYNC` if you'd rather pull more per
run (at the cost of a longer sync).

> **Note on the API shape:** Granola's public API returns notes with summaries
> and attendees, but the exact JSON field names aren't fully documented.
> `src/lib/granola.ts` (`normalizeNote`) accepts several likely field names.
> If a sync brings in notes but misses titles/attendees/links, adjust the key
> lists there — it's the only place that touches Granola's payload shape.

---

## Slack digest

Create an [incoming webhook](https://api.slack.com/messaging/webhooks) and set
`SLACK_WEBHOOK_URL`:

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it (e.g. "Networking CRM"), pick your workspace.
3. **Incoming Webhooks** → toggle **On** → **Add New Webhook to Workspace**.
4. Choose the channel to post to (a private DM-to-self channel works well).
5. Copy the `https://hooks.slack.com/services/...` URL into `SLACK_WEBHOOK_URL`.

The digest is only sent when there's something to report (unless forced). Test
it any time:

```bash
# Preview without sending (needs a login cookie or the CRON_SECRET):
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/digest
# Send now, even if empty:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' -d '{"force":true}' \
  https://<your-app>/api/digest
```

## Debugging the Granola sync

If a sync doesn't capture what you expect, hit the diagnostic endpoint (while
logged in, or with the bearer token) to see exactly what Granola returns for
your account:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/granola/debug
```

It shows the top-level response keys, a sample note's raw fields, and how the
parser normalized it. If the raw fields don't match what `src/lib/granola.ts`
looks for, that's the fix. Note: Granola only returns notes that already have a
generated summary — a call from minutes ago may still be processing.

## AI follow-up suggestions

Set `ANTHROPIC_API_KEY` and the Granola sync will, for each new note, ask a
model to pull out people you should reach out to who were *mentioned* in the
notes (not just the attendees). They show up on the dashboard under **Follow-up
suggestions** — **Add** turns one into a "to reach out" contact, **Dismiss**
drops it. Each note is only processed once, so you don't pay for repeat LLM
calls. Default model is `claude-haiku-4-5` (cheap and plenty for this);
set `EXTRACT_MODEL=claude-opus-4-8` for deeper reasoning.

Pending suggestions are also included in the daily Slack nudge, so your notes
actively tell you who to network with.

**Set the key later? No problem.** Notes synced before `ANTHROPIC_API_KEY` was
configured are backfilled: each subsequent sync extracts a chunk of older
already-imported notes until they're all covered.

### How name matching works (no duplicates, no guessing)

Each extracted mention is matched against your contacts:

- **Saved alias or exact full-name match** (e.g. "Lesley Chen" and exactly one
  Lesley Chen exists) → the suggestion links to that contact. Accepting queues
  *them* — no duplicate. If they're a coworker, the mention is skipped
  silently.
- **Ambiguous** (first-name-only like "Lesley", or a Granola misspelling) →
  the suggestion shows **candidate contacts** and *you* pick — there might be
  several Lesleys, so it never guesses. Your pick is saved as an **alias**, so
  every future mention of that name resolves automatically (coworker →
  silently skipped; networking contact → linked).
- **No match** → a new-person suggestion with an **editable name field**, so
  you can fix Granola's spelling before adding.

Suggestions carry a **verbatim quote** from the note (what the mention was
about) which is folded into the contact's notes on accept, plus a link back to
the Granola note when `GRANOLA_NOTE_URL_TEMPLATE` is set.

### Merging duplicates

The contacts page shows a **Possible duplicates** panel (same email, same or
similar names, "Lesley" vs "Lesley Smith"). Pick the keeper (⦿), uncheck
anyone who's actually a different person, and Merge: interactions move over,
empty fields fill in, tags union, and the merged names become aliases of the
keeper so extraction learns from your cleanup.

## Capturing forwarded emails (Zapier)

Forward an email into the CRM and it's logged against the matching contact
(created if new). The endpoint is provider-agnostic; the easiest wiring is
**Email by Zapier → Webhooks**:

1. In Zapier, create a Zap with the **Email by Zapier** trigger. It gives you a
   custom address like `something@robot.zapier.com`.
2. Forward relevant emails there (or set a Gmail filter to auto-forward).
3. Add a **Webhooks by Zapier → POST** action:
   - **URL:** `https://<your-app>/api/ingest/email`
   - **Headers:** `Authorization: Bearer <CRON_SECRET>`
   - **Data:** map `from`, `to`, `subject`, `body` (and `date` if available)
     from the email trigger.
4. Set `OWNER_EMAIL` to your own address(es) so you're never logged as the
   contact — the endpoint picks the first non-owner email (from the headers,
   then from a forwarded `From:` line in the body).

You can also pass `contactEmail` / `contactName` explicitly if your automation
already knows the counterpart.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"from":"Casey Reed <casey@x.org>","subject":"Re: coffee","body":"Great chat!"}' \
  https://<your-app>/api/ingest/email
```

## The cadence loop (daily nudge + weekly digest)

Set a **cadence** on each person you care about — that's the whole system.
Every morning (`DAILY_NUDGE_CRON`) Slack lists who's **due**: their cadence
elapsed, you queued them, or they're on a cadence and never contacted. Reach
out however you like (LinkedIn, email, a meeting); as soon as an interaction
lands — Granola sync, captured email, or a manual log — the timer restarts.

Booked a meeting and don't need reminders in the meantime? Flip **📅
scheduled** — reminders pause and the flag clears itself when the meeting is
logged. The weekly digest (`DIGEST_CRON`) adds who's coming up in the next 7
days and how many contacts have no cadence set.

Preview or send on demand: `GET /api/nudge` / `POST /api/nudge`, same for
`/api/digest`.

### Prefer an external scheduler?

Set `ENABLE_SCHEDULER=false` and drive the jobs from Railway Cron (or any
scheduler) by hitting the endpoints with the `CRON_SECRET` bearer token:

- `POST /api/sync` — run a Granola sync
- `POST /api/digest` — build and send the weekly digest
- `POST /api/nudge` — build and send the daily nudge

---

## API reference

All routes require a login cookie, except `/api/sync` and `/api/digest` which
also accept `Authorization: Bearer <CRON_SECRET>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth` | Log in (`{ password }`), sets session cookie. |
| `DELETE` | `/api/auth` | Log out. |
| `GET` | `/api/contacts` | List/search (`?q=`, `?status=`, `?tag=`). |
| `POST` | `/api/contacts` | Create a contact. |
| `GET/PATCH/DELETE` | `/api/contacts/:id` | Read / update / delete. |
| `POST` | `/api/interactions` | Log an interaction. |
| `DELETE` | `/api/interactions/:id` | Delete an interaction. |
| `POST`/`GET` | `/api/sync` | Run a Granola sync (+ AI extraction). |
| `GET`/`POST` | `/api/digest` | Weekly digest: preview (GET) or send (POST / GET `?send=1`). |
| `GET`/`POST` | `/api/nudge` | Daily nudge: preview (GET) or send (POST / GET `?send=1`). |
| `POST` | `/api/ingest/email` | Log a forwarded email against a contact. |
| `GET` | `/api/suggestions` | List pending AI follow-up suggestions. |
| `POST` | `/api/suggestions/:id` | `{action:"accept"\|"dismiss"}`. |
| `GET` | `/api/granola/debug` | Inspect the raw Granola API response. |
| `GET` | `/api/health` | Liveness + DB check. |

---

## Local development

```bash
cd personal-crm
cp .env.example .env          # then fill in APP_PASSWORD / APP_SECRET at least
npm install
npm run db:push               # create the SQLite schema
npm run seed                  # optional: 3 sample contacts
npm run dev                   # http://localhost:3000
```

Useful scripts: `npm run typecheck`, `npm run build`, `npm run db:studio`
(Prisma Studio to browse the data).

## Switching to Postgres

SQLite is the default because it's the simplest thing that works for one person.
To use Postgres (e.g. Railway's Postgres plugin) instead:

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. Run `npm run db:push` (or let the app do it on start).

No application code changes are needed.

---

## Security notes

- The app is gated behind a single password with an HMAC-signed, httpOnly
  session cookie. Use a strong `APP_PASSWORD` and a random `APP_SECRET`.
- Secrets live only in environment variables — nothing is committed.
- Keep `CRON_SECRET` private; it bypasses the login for the automation endpoints.
