# 🤝 Personal Networking CRM

A lightweight, self-hosted CRM for one person doing a lot of networking. Track
who you've reached out to, log your conversations, see who you're pending
replies from, and never let a follow-up slip. Meeting notes flow in
automatically from **Granola**, and a weekly digest of what needs attention
gets pushed to **Slack and email**.

Built to run on [Railway](https://railway.app).

---

## What it does

- **Contacts** with the context that matters for networking: company, role,
  LinkedIn URL, how you met, tags/topics, notes, and a status in the outreach
  pipeline (_reached out → connected → pending reply → replied → cold_).
- **Conversation log** — every touchpoint (LinkedIn, email, call, meeting…)
  with a date and summary, per contact.
- **Follow-up reminders** — a next-action date on each contact; overdue ones
  surface on the dashboard and in the digest.
- **Dashboard** that leads with what needs you: pending replies, overdue
  follow-ups, contacts going cold, and recent activity.
- **Granola sync** — pulls your meeting notes on a schedule, matches attendees
  to your contacts, logs each note as an interaction (with a link back to
  Granola), and can auto-create contacts for new people you met.
- **Weekly digest** to Slack + email so follow-through happens even when you're
  not in the app.
- **Password-protected** — it's on the public internet, so your contacts aren't.

## Tech stack

- **Next.js 15** (App Router, TypeScript) — UI + API in one deployable service
- **Prisma + SQLite** — the datastore (a single file on a Railway volume).
  Swappable to Postgres in one step (see below).
- **node-cron** — in-process scheduler for the sync + digest jobs
- **nodemailer** — email; **Slack incoming webhook** — Slack

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
| `GRANOLA_AUTO_CREATE_CONTACTS` | ➖ | `true` (default) creates contacts for unmatched attendees. |
| `OWNER_EMAIL` | ➖ | Your own email(s), comma-separated — skipped during sync so you don't become a contact. |
| `SLACK_WEBHOOK_URL` | for Slack | Incoming webhook. Blank = no Slack. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | for email | SMTP creds. Blank host = no email. |
| `DIGEST_EMAIL_FROM` / `DIGEST_EMAIL_TO` | for email | Digest sender/recipient. |
| `GRANOLA_SYNC_CRON` | ➖ | Cron for the sync job. Default `0 */2 * * *` (every 2h). |
| `DIGEST_CRON` | ➖ | Cron for the digest. Default `0 8 * * 1` (Mon 08:00). |
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

**How matching works:** for each note attendee, the sync looks for an existing
contact by email first, then by name. A match logs the note as a `granola`
interaction (deduped per contact per note) and updates their last-contact date.
No match + `GRANOLA_AUTO_CREATE_CONTACTS=true` creates a new contact.

> **Note on the API shape:** Granola's public API returns notes with summaries
> and attendees, but the exact JSON field names aren't fully documented.
> `src/lib/granola.ts` (`normalizeNote`) accepts several likely field names.
> If a sync brings in notes but misses titles/attendees/links, adjust the key
> lists there — it's the only place that touches Granola's payload shape.

---

## Slack & email digest

- **Slack:** create an [incoming webhook](https://api.slack.com/messaging/webhooks)
  and set `SLACK_WEBHOOK_URL`.
- **Email:** set the `SMTP_*` vars. For Gmail/Google Workspace use an
  [App Password](https://support.google.com/accounts/answer/185833).

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

### Prefer an external scheduler?

Set `ENABLE_SCHEDULER=false` and drive the jobs from Railway Cron (or any
scheduler) by hitting the endpoints with the `CRON_SECRET` bearer token:

- `POST /api/sync` — run a Granola sync
- `POST /api/digest` — build and send the digest

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
| `POST`/`GET` | `/api/sync` | Run a Granola sync. |
| `GET`/`POST` | `/api/digest` | Preview (GET) or send (POST, or GET `?send=1`). |
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
