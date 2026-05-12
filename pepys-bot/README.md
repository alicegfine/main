# Pepys Signal Bot

Every morning, this bot fetches Samuel Pepys's diary entry for "today, 360 years
ago" (so on 12 May 2026 it sends the entry from 12 May 1666) and DMs each member
of a Signal group individually. Recipients can mute the bot if they don't want
the daily messages, without affecting the rest of the group chat.

The mapping shifts forward each year — 2026→1666, 2027→1667, …, 2029→1669. Once
the diary ends (31 May 1669, real-time June 2029), the bot quietly stops sending.

## What you need

1. **A dedicated Signal phone number for the bot.** It must be a number that
   isn't already used as someone's primary Signal device. Options:
   - Google Voice number (free, US only)
   - Cheap pay-as-you-go SIM
   - VoIP number (Twilio, JMP.chat — ~$2/month)
2. **An always-on computer.** A Raspberry Pi at home, a small VPS (Hetzner,
   DigitalOcean, ~$4/month), or an old laptop set never to sleep.
3. **Docker** installed on that computer.
4. **Python 3.10+** installed on that computer.

## One-time setup

### 1. Run signal-cli-rest-api

This is the piece that talks to Signal's servers. Start it as a Docker
container (replace `/path/to/signal-data` with somewhere on your host where it
can persist its login state):

```bash
docker run -d --name signal-api --restart=always \
  -p 8080:8080 \
  -v /path/to/signal-data:/home/.local/share/signal-cli \
  -e 'MODE=normal' \
  bbernhard/signal-cli-rest-api:latest
```

### 2. Register the bot's phone number with Signal

Replace `+15551234567` with the bot's number throughout. Do this once:

```bash
# Ask Signal to send a verification SMS to the number
curl -X POST 'http://localhost:8080/v1/register/+15551234567'

# Type the 6-digit code you received as <CODE> below
curl -X POST 'http://localhost:8080/v1/register/+15551234567/verify/<CODE>'
```

If Signal blocks automated registration, the API also supports captcha-based
registration — see https://github.com/bbernhard/signal-cli-rest-api#register-number .

### 3. Add the bot to your Signal group

From your personal Signal app, add the bot's phone number to the group like any
other contact. Send one message in the group from your phone so the bot picks
up the group.

### 4. Find the group ID

```bash
curl 'http://localhost:8080/v1/groups/+15551234567'
```

Copy the long `id` value (a base64 string starting with `group.` after URL-decoding,
but the API expects it as-is) for the group you want. Save it.

### 5. Install the bot

```bash
git clone <this repo> && cd pepys-bot
pip install -r requirements.txt
```

### 6. Test it (dry run — fetches and prints, doesn't send)

```bash
export SIGNAL_SENDER='+15551234567'
export SIGNAL_GROUP_ID='<the group id from step 4>'
python pepys_bot.py --dry-run
```

You should see today's-360-years-ago entry printed, followed by the list of
recipient numbers. If that looks right, drop `--dry-run` to actually send.

### 7. Schedule it daily at 08:00

Edit your crontab (`crontab -e`) and add:

```
0 8 * * * cd /path/to/pepys-bot && \
  SIGNAL_SENDER='+15551234567' \
  SIGNAL_GROUP_ID='<group id>' \
  /usr/bin/python3 pepys_bot.py >> /var/log/pepys-bot.log 2>&1
```

Cron uses the system timezone. Set it (e.g. `sudo timedatectl set-timezone Europe/London`)
to whatever timezone the group should receive messages in.

## Useful commands

```bash
# See what would be sent today, without sending
python pepys_bot.py --dry-run

# Test a specific date (e.g. preview tomorrow's entry)
python pepys_bot.py --dry-run --date 2026-05-13

# Verbose logging
python pepys_bot.py -v
```

## Troubleshooting

- **"No entry for ..."**: Pepys skipped some days. The bot deliberately sends
  nothing on those days.
- **`send to ... failed: 400`**: usually means the recipient isn't on Signal,
  or the bot's number got rate-limited. Check the signal-cli-rest-api logs:
  `docker logs signal-api`.
- **Group members list is empty**: the bot must have received at least one
  message in the group before it knows the membership. Send a message in the
  group from your phone, then try again.
- **Entries stopped arriving**: re-run with `-v` and check
  `/var/log/pepys-bot.log`. The pepysdiary.com HTML structure could change;
  open an issue / ping me to update the parser.
