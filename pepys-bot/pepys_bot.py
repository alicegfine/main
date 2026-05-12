"""Send the day's Samuel Pepys diary entry to each member of a Signal group as a DM.

Date mapping: the diary ran 1660-1669. We map today's date to the same month/day
360 years earlier (so 2026 -> 1666, 2027 -> 1667, ...). After 1669 ends, the
script will simply find no entry and exit quietly.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass
from datetime import date
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

PEPYS_BASE = "https://www.pepysdiary.com"
YEAR_OFFSET = 360  # 2026 -> 1666
HTTP_TIMEOUT = 30
USER_AGENT = "pepys-signal-bot/1.0 (daily digest for a private Signal group)"

log = logging.getLogger("pepys-bot")


@dataclass
class Entry:
    title: str
    first_paragraph: str
    url: str


def historical_date(today: date) -> date | None:
    """Return the 17th-century date to fetch, or None if outside the diary's run."""
    year = today.year - YEAR_OFFSET
    if year < 1660 or year > 1669:
        return None
    try:
        return date(year, today.month, today.day)
    except ValueError:
        # 29 Feb on a non-leap year in the past
        return None


def fetch_entry(target: date) -> Entry | None:
    """Fetch and parse the diary entry for the given date. Returns None if missing."""
    url = f"{PEPYS_BASE}/diary/{target.year}/{target.month:02d}/{target.day:02d}/"
    log.info("Fetching %s", url)
    resp = requests.get(url, timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT})
    if resp.status_code == 404:
        log.info("No entry for %s (404)", target)
        return None
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # The diary entry body lives inside <article> on modern pepysdiary.com.
    # Footnotes/annotations are in separate sections, so we target the first
    # article and take its first <p>.
    article = soup.find("article") or soup.find("div", class_="entry")
    if not article:
        log.warning("Could not locate entry article on %s", url)
        return None

    paragraphs = article.find_all("p")
    if not paragraphs:
        log.info("Entry page has no paragraphs (likely a no-entry day): %s", url)
        return None

    first_paragraph = paragraphs[0].get_text(" ", strip=True)
    if not first_paragraph:
        return None

    title_tag = soup.find("h1") or soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else target.strftime("%A %-d %B %Y")

    canonical = soup.find("link", rel="canonical")
    canonical_url = canonical["href"] if canonical and canonical.has_attr("href") else url
    canonical_url = urljoin(PEPYS_BASE, canonical_url)

    return Entry(title=title, first_paragraph=first_paragraph, url=canonical_url)


def format_message(entry: Entry) -> str:
    return f"{entry.title}\n\n{entry.first_paragraph}\n\nRead more: {entry.url}"


class SignalClient:
    """Thin wrapper around signal-cli-rest-api (JSON-RPC mode disabled, normal mode)."""

    def __init__(self, base_url: str, sender: str):
        self.base_url = base_url.rstrip("/")
        self.sender = sender

    def list_group_members(self, group_id: str) -> list[str]:
        """Return the recipient identifiers (numbers or UUIDs) in a group, minus the bot itself."""
        url = f"{self.base_url}/v1/groups/{self.sender}/{group_id}"
        resp = requests.get(url, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        members = data.get("members") or []
        # signal-cli-rest-api returns members as a list of strings (numbers/uuids)
        return [m for m in members if m and m != self.sender]

    def send_message(self, recipient: str, message: str) -> None:
        url = f"{self.base_url}/v2/send"
        payload = {
            "message": message,
            "number": self.sender,
            "recipients": [recipient],
        }
        resp = requests.post(url, json=payload, timeout=HTTP_TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f"send to {recipient} failed: {resp.status_code} {resp.text}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--signal-api",
        default=os.environ.get("SIGNAL_API_URL", "http://localhost:8080"),
        help="Base URL of signal-cli-rest-api (default: http://localhost:8080 or $SIGNAL_API_URL)",
    )
    parser.add_argument(
        "--sender",
        default=os.environ.get("SIGNAL_SENDER"),
        help="The bot's registered Signal phone number, e.g. +15551234567 ($SIGNAL_SENDER)",
    )
    parser.add_argument(
        "--group-id",
        default=os.environ.get("SIGNAL_GROUP_ID"),
        help="The base64 group ID the bot lives in ($SIGNAL_GROUP_ID)",
    )
    parser.add_argument(
        "--date",
        help="Override today's date (YYYY-MM-DD), for testing.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the message and recipients but don't send anything.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if not args.sender or not args.group_id:
        parser.error("--sender and --group-id (or SIGNAL_SENDER / SIGNAL_GROUP_ID) are required")

    today = date.fromisoformat(args.date) if args.date else date.today()
    target = historical_date(today)
    if target is None:
        log.info("No diary year maps to %s; nothing to send.", today)
        return 0

    entry = fetch_entry(target)
    if entry is None:
        log.info("No entry for %s; sending nothing.", target)
        return 0

    message = format_message(entry)

    if args.dry_run:
        print("---- message ----")
        print(message)
        print("---- recipients ----")
        client = SignalClient(args.signal_api, args.sender)
        try:
            recipients = client.list_group_members(args.group_id)
        except Exception as exc:
            log.warning("Could not fetch group members in dry-run: %s", exc)
            recipients = []
        for r in recipients:
            print(r)
        return 0

    client = SignalClient(args.signal_api, args.sender)
    recipients = client.list_group_members(args.group_id)
    if not recipients:
        log.warning("Group has no other members; nothing to send.")
        return 0

    log.info("Sending entry for %s to %d recipient(s)", target, len(recipients))
    failures = 0
    for recipient in recipients:
        try:
            client.send_message(recipient, message)
            log.info("Sent to %s", recipient)
        except Exception as exc:
            failures += 1
            log.error("Failed to send to %s: %s", recipient, exc)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
