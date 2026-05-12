# Pepys Signal Bot

Every morning, this bot fetches Samuel Pepys's diary entry for "today, 360 years
ago" (so on 12 May 2026 it sends the entry from 12 May 1666) and DMs each
member of a Signal group individually. Recipients can mute the bot if they
don't want the daily messages, without affecting the rest of the group chat.

The year offset shifts forward each calendar year — 2026→1666, 2027→1667, …,
2029→1669. Once the real diary ends (31 May 1669, real-time 31 May 2029), the
bot quietly stops sending.

Each message contains the entry's title, its first paragraph, and a link back
to pepysdiary.com for the full entry (with footnotes and annotations).

## Project layout

```
pepys_bot.py        # the bot
requirements.txt    # Python dependencies
.env.example        # template for the env vars the bot expects
systemd/            # optional systemd timer (alternative to cron)
```

## What you need to host it

1. **A dedicated Signal phone number for the bot.** It must be a number that
   isn't already used as someone's primary Signal device. Options:
   - Google Voice number (free, US only)
   - Cheap pay-as-you-go SIM
   - VoIP number (Twilio, JMP.chat — ~$2/month)
2. **An always-on Linux computer.** A Raspberry Pi at home, a small VPS
   (Hetzner CX11 ~€4/mo, DigitalOcean ~$4/mo), or an old laptop set never to
   sleep.
3. **Docker** on that computer (`curl -fsSL https://get.docker.com | sh`).
4. **Python 3.10+** and `pip` on that computer.

## One-time setup

### 1. Clone the repo

```bash
git clone https://github.com/<you>/pepys-signal-bot.git
cd pepys-signal-bot
pip install -r requirements.txt
```

### 2. Run signal-cli-rest-api

This is the piece that talks to Signal's servers. Start it as a Docker
container — `/path/to/signal-data` should be a directory on your host where
it can persist its login state across restarts:

```bash
docker run -d --name signal-api --restart=always \
  -p 8080:8080 \
  -v /path/to/signal-data:/home/.local/share/signal-cli \
  -e 'MODE=normal' \
  bbernhard/signal-cli-rest-api:latest
```

### 3. Register the bot's phone number with Signal

Replace `+15551234567` with the bot's number throughout. Do this once:

```bash
# Ask Signal to send a verification SMS to the number
curl -X POST 'http://localhost:8080/v1/register/+15551234567'

# Then type the 6-digit code you received as <CODE> below
curl -X POST 'http://localhost:8080/v1/register/+15551234567/verify/<CODE>'
```

If Signal blocks automated registration with "captcha required", follow the
captcha-based flow documented at
<https://github.com/bbernhard/signal-cli-rest-api#register-number>.

### 4. Add the bot to your Signal group

From your personal Signal app, add the bot's phone number to your contacts,
then add it to the group like any other person. Send one message in the group
from your phone so the bot picks the group up.

### 5. Find the group ID

```bash
curl 'http://localhost:8080/v1/groups/+15551234567'
```

Copy the `id` value of the group you want.

### 6. Configure environment

```bash
cp .env.example .env
$EDITOR .env   # fill in SIGNAL_SENDER and SIGNAL_GROUP_ID
```

### 7. Test it (dry run — fetches and prints, doesn't send)

```bash
set -a; source .env; set +a
python3 pepys_bot.py --dry-run
```

You should see today's-360-years-ago entry printed, followed by the list of
recipient numbers. Try a specific date with `--date 2026-05-12`. If that
looks right, drop `--dry-run` to actually send.

### 8. Schedule it daily at 08:00

Pick **one** of the two options below.

**Option A — cron** (simplest):

`crontab -e` and add (replace paths and the env values):

```cron
0 8 * * * cd /opt/pepys-bot && \
  SIGNAL_SENDER='+15551234567' \
  SIGNAL_GROUP_ID='<group id>' \
  /usr/bin/python3 pepys_bot.py >> /var/log/pepys-bot.log 2>&1
```

Cron uses the system timezone — set it with e.g.
`sudo timedatectl set-timezone Europe/London`.

**Option B — systemd timer** (auto-runs on next boot if the machine was off
at 08:00, easier to inspect):

```bash
sudo cp -r . /opt/pepys-bot
sudo cp systemd/pepys-bot.service systemd/pepys-bot.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pepys-bot.timer
```

Inspect with:

```bash
systemctl list-timers pepys-bot.timer
journalctl -u pepys-bot.service -n 50
```

## Day-to-day commands

```bash
# Preview what would be sent today, without sending
python3 pepys_bot.py --dry-run

# Preview a specific date
python3 pepys_bot.py --dry-run --date 2026-05-13

# Verbose logging
python3 pepys_bot.py -v
```

## How it decides who to message

On each run the bot calls signal-cli-rest-api's
`GET /v1/groups/<sender>/<group-id>` endpoint, takes the `members` list, drops
its own number, and sends each remaining member a 1:1 message via
`POST /v2/send`. This means **adding or removing someone from the Signal group
automatically adjusts who gets the daily DM** — no config changes needed.

## Troubleshooting

- **"No entry for …"** — Pepys skipped some days. The bot deliberately sends
  nothing on those days.
- **`send to … failed: 400`** — usually means that recipient isn't on Signal,
  or the bot's number got rate-limited. Check the API logs:
  `docker logs signal-api`.
- **Group members list is empty** — the bot needs to have observed at least
  one message in the group before it knows the membership. Send a message in
  the group from your phone and try again.
- **Entries stopped arriving / parsing fails** — pepysdiary.com may have
  changed its markup. Run with `-v` and update the selectors in
  `fetch_entry()` if needed (it looks for `<article>` then `<div class=entry>`,
  then the first `<p>`).

## License

MIT — see [LICENSE](LICENSE).
