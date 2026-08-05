# August Meditation Retreat

A small site for the retreat running Friday 7 – Monday 10 August 2026.

- **Schedule** (`/`) — the sessions for each of the four days. Anyone can add their
  name to a session as *attending* or *leading*, and anyone can take a name off
  again. The roster is public.
- **How it works** (`/how-it-works`) — a page of text that Alice can edit in the
  browser.

Everything on the site is readable without signing in. Signing in as Alice adds
two things: the controls for adding and deleting sessions, and the button for
editing the "How it works" page.

## Deploying to Railway

1. **Create the service.** In Railway, *New Project → Deploy from GitHub repo*,
   pick this repository, and choose the branch. Railway detects Node, runs
   `npm install`, and starts the app with `npm start`. It supplies `PORT`
   automatically.

2. **Add a volume — do this before people start signing up.** Railway's
   filesystem is wiped on every redeploy, so without a volume the schedule and
   all signups are lost the next time you deploy. In the service, go to
   *Settings → Volumes → Add volume* and mount it at `/data`.

3. **Set the variables.** In the service's *Variables* tab:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_PASSWORD` | The password you'll type to sign in as Alice. |
   | `SESSION_SECRET` | A long random string. Generate one with `openssl rand -hex 32`. |
   | `DATA_DIR` | `/data` — must match the volume mount path from step 2. |
   | `NODE_ENV` | `production` — makes the session cookie HTTPS-only. |

4. **Generate a domain.** *Settings → Networking → Generate Domain* gives you a
   `*.up.railway.app` URL to share.

5. **Sign in** at `/signin` with the name `Alice` and the password you set, then
   add the sessions for each day.

If `ADMIN_PASSWORD` is missing the site still runs, but sign-in is disabled and
nothing can be edited. If `SESSION_SECRET` is missing a temporary one is
generated at each startup, which signs you out on every restart and redeploy.

## Running locally

```sh
npm install
cp .env.example .env        # then edit ADMIN_PASSWORD
ADMIN_PASSWORD=whatever npm start
```

The site is at http://localhost:3000 and the database is written to `./data`.

## Notes on the design

**Times.** Every time on the site is Eastern, labelled `ET`, and is stored as
minutes since midnight on a given day rather than as a timestamp — so there is no
timezone conversion anywhere, and nothing shifts if the server's clock is set to
something else. Sessions may be any length between 8:00 AM and 12:00 AM ET, and
two sessions on the same day cannot overlap; back-to-back sessions that touch
exactly (9:30 ending as 9:30 begins) are fine. Deleting a session also deletes
its signups.

**Sign-in is a shared password, not real accounts.** It compares what you type
against `ADMIN_PASSWORD` and stores the result in a signed, HTTP-only cookie for
30 days. It's enough to keep the editing controls out of visitors' way and to
stop a passer-by from rewriting the schedule. It is not account security, so
don't put anything sensitive behind it, and don't reuse a password you use
elsewhere.

**Signups are unauthenticated on purpose.** There are no accounts for attendees:
you type a name and you're on the list. That also means anyone can remove anyone
else's name, which is the tradeoff for letting people cancel without an account.
For a small retreat where everyone knows each other, that's usually the right
trade — but if you'd rather only you could remove names, that's a small change.

**No JavaScript.** Every action is a plain form submission followed by a
redirect, so the site works with JavaScript disabled and refreshing never
resubmits anything.

## Layout

```
src/server.js     routes
src/db.js         SQLite schema and queries
src/auth.js       Alice's sign-in and the session cookie
src/views.js      HTML
src/retreat.js    the four days, time parsing and formatting, block validation
src/markdown.js   the small Markdown subset used by "How it works"
public/styles.css styling
```
