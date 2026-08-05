# Jhana Noting Retreat — August 2026

A small site for the retreat running Friday 7 – Monday 10 August 2026.

- **Schedule** (`/`) — the sessions for each of the four days. Everyone puts in a
  name once, and can then add sessions, sign up to attend them, or offer to lead
  them. The roster is public.
- **The spiel** (`/the-spiel`) — a page of text that only Alice can edit.

The whole site is readable without giving a name or signing in. There are two
separate ideas of who you are, and it's worth keeping them apart:

| | What it is | What it unlocks |
| --- | --- | --- |
| **Your name** | A name in a cookie. No password, no account. | Adding sessions and signing up for them — everything on the schedule. |
| **Alice's sign-in** | A shared password (`ADMIN_PASSWORD`). | Editing the spiel, and removing other people's names. |

The spiel is the only locked part. The schedule is deliberately open: anyone who
has given a name can add or delete a session there.

## Deploying to Railway

1. **Create the service.** In Railway, *New Project → Deploy from GitHub repo*,
   and pick this repository. Railway detects Node from `package.json`, runs
   `npm install`, and starts the app with `npm start`. It supplies `PORT`
   automatically, and `.nvmrc` pins Node 22.

2. **Point it at the right branch.** Railway deploys the repository's *default*
   branch unless told otherwise, and the default branch here is the unrelated
   Flex Fund project — so a fresh service will build the wrong thing. Go to
   *Settings → Source → Branch* and select
   `claude/meditation-retreat-site-e3phpb`, then redeploy.

3. **Add a volume — do this before people start signing up.** Railway's
   filesystem is wiped on every redeploy, so without a volume the schedule and
   all signups are lost the next time you deploy. In the service, go to
   *Settings → Volumes → Add volume* and mount it at `/data`.

4. **Set the variables.** In the service's *Variables* tab:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_PASSWORD` | The password you'll type to sign in as Alice. |
   | `SESSION_SECRET` | A long random string. Generate one with `openssl rand -hex 32`. |
   | `DATA_DIR` | `/data` — must match the volume mount path from step 3. |
   | `NODE_ENV` | `production` — makes the session cookie HTTPS-only. |

5. **Generate a domain.** *Settings → Networking → Generate Domain* gives you a
   `*.up.railway.app` URL to share.

6. **Sign in** at `/signin` with the name `Alice` and the password you set, then
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
30 days. It's enough to keep the spiel from being rewritten by a passer-by. It is
not account security, so don't put anything sensitive behind it, and don't reuse
a password you use elsewhere.

**Names are identity, not authentication.** Giving a name sets a cookie that
lasts a year, so signing up is one click rather than retyping your name each
time, and the site can tell which entries are yours — you can take your own name
off a session, and Alice can take anyone's off. Nothing stops someone from typing
a name that isn't theirs; this is a retreat roster, not an access-control system.

**Anyone can delete a session, including one with signups.** That follows from
the schedule being open, and deleting a session also deletes the names on it,
with no undo. It's fine among people who know each other, but if a stray click
starts costing you a full roster, restricting deletion to Alice — or to sessions
with nobody signed up — is a couple of lines in `src/server.js`.

**No JavaScript.** Every action is a plain form submission followed by a
redirect, so the site works with JavaScript disabled and refreshing never
resubmits anything.

## Layout

```
src/server.js     routes
src/db.js         SQLite schema and queries
src/auth.js       Alice's sign-in and the session cookie
src/visitor.js    everyone else's name cookie
src/cookies.js    cookie header parsing, shared by the two above
src/views.js      HTML
src/retreat.js    the four days, time parsing and formatting, block validation
src/markdown.js   the small Markdown subset used by the spiel
public/styles.css styling
```
