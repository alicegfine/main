# DC Office Site

Internal site for the Blueprint Biosecurity DC office:

- **Who's in** — a two-week Mon–Fri board. People click to mark themselves in or out.
- **Live Google Calendar sync** — the board mirrors into a shared *DC Office*
  calendar that everyone subscribes to once.
- **FAQ** — office logistics, edited in `src/faq.js`.

Sign-in is Google OAuth restricted to `blueprintbiosecurity.org`. Nobody outside
the domain can see the board.

---

## Why the calendar sync is actually live

The usual way to put a calendar on a website is to publish an `.ics` feed and
have people subscribe to the URL. That looks live but isn't: Google re-fetches
external `.ics` feeds on its own schedule, often **8 to 24 hours** behind. Useless
for "who's in today".

This app avoids feeds entirely. It writes directly to a **native Google Calendar**
in the Workspace using the Calendar API. Because it's a real calendar rather than
an imported feed, changes reach everyone's phone and desktop within seconds, and
subscribing is a one-time action.

**Postgres is the source of truth; the calendar is a projection of it.** If a
Calendar write fails, the RSVP is still saved and the user sees a soft warning —
losing someone's click because Google had a bad minute would be the worse trade.
`npm run resync` repairs any drift.

### One event per day, not one per person

Twelve overlapping all-day events every day is how people end up unsubscribing.
The mirror writes **one rollup event per day** instead, updated in place:

```
DC Office: Alice, Jake, Siobhan +2 (5)
```

with the full roster in the event description. The event id is stored in the
`day_events` table, which is what makes each sync an update rather than a
duplicate insert.

---

## Setup

### 1. Create the shared calendar

In Google Calendar (as a normal user — **no Workspace admin needed**):

1. **Other calendars → + → Create new calendar.** Name it `DC Office`, timezone
   Eastern. Create.
2. Open its **Settings**.
3. Under **Share with specific people or groups**, add
   `blueprintbiosecurity.org` with **See all event details**. (Or share with
   individuals if you'd rather not expose it domain-wide.)
4. Leave this tab open — you'll add the service account here in step 2, and you
   need the **Calendar ID** from **Integrate calendar** for `OFFICE_CALENDAR_ID`.

> Do **not** tick "Make available to public". The board is internal.

### 2. Create the service account that writes to it

In [Google Cloud console](https://console.cloud.google.com/), in any project:

1. **APIs & Services → Library →** enable **Google Calendar API**.
2. **IAM & Admin → Service Accounts → Create service account.** Name it
   `dc-office-sync`. No roles needed — its access comes from the calendar share,
   not from IAM.
3. On the service account, **Keys → Add key → Create new key → JSON.** Download it.
4. Copy the service account's email (`dc-office-sync@….iam.gserviceaccount.com`).
5. Back in the **DC Office** calendar settings, under **Share with specific
   people**, add that email with **Make changes to events**.

Step 5 is the one people forget. Without it every sync fails with a 404 on the
calendar id.

### 3. Create the OAuth client for sign-in

Same Cloud project:

1. **APIs & Services → OAuth consent screen.** Set **User type: Internal** —
   this is what keeps you out of Google's app-verification review. Fill in the
   app name and support email.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorized redirect URI:** `https://<your-domain>/auth/google/callback`
   — must match `BASE_URL` exactly, including scheme and no trailing slash.
4. Save the client ID and secret.

### 4. Deploy on Railway

1. New project → **Deploy from GitHub repo**, pointed at this repo.
2. **Settings → Root Directory:** `dc-office-site`  ← the repo root holds the
   unrelated Flex Fund scripts, so this must be set.
3. **+ New → Database → Postgres.** Railway injects `DATABASE_URL` automatically.
4. Add the remaining variables (below).
5. **Settings → Networking → Generate Domain**, then set `BASE_URL` to it and
   add the matching redirect URI from step 3.

Schema is created on boot; there's no migration step.

### 5. Environment variables

| Variable | Notes |
| --- | --- |
| `BASE_URL` | Public URL, no trailing slash. Must match the OAuth redirect URI. |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOWED_DOMAIN` | `blueprintbiosecurity.org` |
| `DATABASE_URL` | Injected by Railway Postgres. |
| `GOOGLE_OAUTH_CLIENT_ID` | From step 3. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | From step 3. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole downloaded JSON key, pasted as one value. |
| `OFFICE_CALENDAR_ID` | From the calendar's **Integrate calendar** section. |
| `OFFICE_TIMEZONE` | Optional, default `America/New_York`. |
| `OFFICE_NAME` | Optional, default `DC Office`. Used in event titles. |
| `WEEKS_SHOWN` | Optional, default `2`. |
| `NODE_ENV` | Set to `production` — this is what makes session cookies `Secure`. |

`.env.example` mirrors this for local development.

### 6. Tell the team to subscribe

Send everyone to the site and have them hit **Subscribe in Google Calendar**
once. That's the whole onboarding.

---

## Optional: nightly resync

`POST /api/resync` and `npm run resync` both re-derive every day the board covers
from Postgres. Worth adding as a Railway cron (`npm run resync`, `0 9 * * *`) so
that hand-edits to the shared calendar get corrected and anything that failed
during a Google outage is brought back in line.

---

## Local development

```bash
cd dc-office-site
npm install
cp .env.example .env     # fill it in
npm run dev
```

You need a local Postgres and a `BASE_URL` of `http://localhost:3000` added as an
authorized redirect URI. Google OAuth will not redirect to `localhost` over
`https`, so leave `NODE_ENV` unset locally.

---

## Layout

```
src/
  server.js        Express app, routes, error handling
  config.js        Env parsing and validation (fails fast at boot)
  auth.js          Google OAuth, signed session cookie, domain enforcement
  board.js         RSVP reads and writes
  calendarSync.js  Rollup-event mirror to Google Calendar
  weeks.js         Timezone-safe calendar-day arithmetic
  db.js            Postgres pool, schema, per-day advisory lock
  faq.js           FAQ content
views/             EJS templates
public/            styles.css, app.js
```

### Notes for whoever touches this next

- **`weeks.js` does all date math on a UTC-noon anchor.** Dates here are calendar
  days, never instants. `new Date('2026-08-10')` is UTC midnight, which is the 9th
  in Washington — that's how office calendars end up showing people in on Sunday.
  Keep arithmetic in that module.
- **Writes go through `withDayLock`.** It takes a Postgres advisory lock keyed on
  the day, so simultaneous RSVPs across Railway replicas can't interleave and
  leave the calendar showing a stale roster.
- **`syncDay` takes its Calendar client as an argument** so the reconcile logic
  can be tested without reaching Google.
- The FAQ still has `[FILL IN]` placeholders; the page shows a banner while any
  remain. If editing `src/faq.js` becomes a bottleneck, read the entries from a
  Google Doc so non-engineers can update them without a deploy.
