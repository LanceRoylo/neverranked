#!/usr/bin/env python3
"""
Hawaii Theatre upcoming-events scraper -> Event schema SQL.

Scrapes https://www.hawaiitheatre.com/upcoming-events/ for active shows
and emits idempotent SQL that replaces all Event rows in
schema_injections for client_slug='hawaii-theatre'.

The page uses Elementor + JetEngine listing markup. Each event card is
a section with class `elementor-element-33c4d34`. Inside: a Salesforce
ticket URL (also the dedupe key via the event ID), an image, the date
text, and the title.

Usage:
  python3 dashboard/scripts/scrape-htc-events.py            # writes SQL to stdout
  python3 dashboard/scripts/scrape-htc-events.py --apply    # applies via wrangler --remote

This will become the basis for the weekly re-scrape cron. The cron
should DELETE existing Event rows and re-INSERT, so events that drop
off the page (sold out, cancelled) automatically deactivate.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html as htmllib
import json
import re
import subprocess
import sys
import urllib.request

SOURCE_URL = "https://www.hawaiitheatre.com/upcoming-events/"
CLIENT_SLUG = "hawaii-theatre"
TARGET_PAGES = ["/upcoming-events*"]

MONTHS = {m: i + 1 for i, m in enumerate([
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
])}

LOCATION = {
    "@type": "PerformingArtsTheater",
    "name": "Hawaii Theatre Center",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "1130 Bethel Street",
        "addressLocality": "Honolulu",
        "addressRegion": "HI",
        "postalCode": "96813",
        "addressCountry": "US",
    },
    "url": "https://www.hawaiitheatre.com",
}

ORGANIZER = {
    "@type": "Organization",
    "name": "Hawaii Theatre Center",
    "url": "https://www.hawaiitheatre.com",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "NeverRanked-Scraper/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_events(html_text: str) -> list[dict]:
    parts = re.split(r"<section [^>]*elementor-element-33c4d34[^>]*>", html_text)[1:]
    events = []
    for card in parts:
        img_m = re.search(
            r'<a href="(https://hawaiitheatre\.my\.salesforce-sites\.com/ticket/[^"]+)">\s*'
            r'<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"',
            card,
        )
        date_m = re.search(r'jet-listing-dynamic-field__content"\s*>\s*([^<]+?)\s*</div>', card)
        title_m = re.search(r'<h2 class="elementor-heading-title elementor-size-default">([^<]+)</h2>', card)
        ev = {
            "title": htmllib.unescape(title_m.group(1).strip()) if title_m else None,
            "date_text": date_m.group(1).strip() if date_m else None,
            "ticket_url": img_m.group(1) if img_m else None,
            "image": img_m.group(2) if img_m else None,
        }
        events.append(ev)
    return events


def parse_date(s: str) -> str | None:
    m = re.match(r"(\w+)\s+(\d+),\s+(\d{4})", s)
    if not m or m.group(1) not in MONTHS:
        return None
    return f"{int(m.group(3)):04d}-{MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}"


def salesforce_id(url: str) -> str | None:
    m = re.search(r"/events/([A-Za-z0-9]+)", url)
    return m.group(1) if m else None


def to_event_schema(ev: dict, today_iso: str) -> dict | None:
    sid = salesforce_id(ev["ticket_url"]) if ev["ticket_url"] else None
    iso = parse_date(ev["date_text"]) if ev["date_text"] else None
    if not all([ev["title"], iso, sid, ev["image"]]):
        return None
    return {
        "@context": "https://schema.org",
        "@type": "Event",
        "@id": f"https://www.hawaiitheatre.com/event/{sid}",
        "name": ev["title"],
        "startDate": iso,
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "location": LOCATION,
        "organizer": ORGANIZER,
        "image": ev["image"],
        "url": ev["ticket_url"],
        "offers": {
            "@type": "Offer",
            "url": ev["ticket_url"],
            "availability": "https://schema.org/InStock",
            "validFrom": today_iso,
        },
    }


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def build_sql(schemas: list[dict]) -> str:
    lines = [
        f"-- {CLIENT_SLUG}: {len(schemas)} Event schemas from {SOURCE_URL}",
        "-- Idempotent: removes existing Event rows for this client and re-inserts.",
        f"DELETE FROM schema_injections WHERE client_slug='{CLIENT_SLUG}' AND schema_type='Event';",
        "",
    ]
    tp = json.dumps(TARGET_PAGES)
    for s in schemas:
        j = json.dumps(s, separators=(",", ":"), ensure_ascii=False)
        lines.append(
            "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, approved_at) "
            f"VALUES ('{CLIENT_SLUG}', 'Event', {sql_str(j)}, {sql_str(tp)}, 'approved', unixepoch());"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Apply via `wrangler d1 execute --remote`")
    ap.add_argument("--out", default="-", help="Write SQL to this path (default: stdout)")
    args = ap.parse_args()

    today_iso = dt.date.today().isoformat()
    html_text = fetch(SOURCE_URL)
    events = parse_events(html_text)
    schemas = [s for ev in events for s in [to_event_schema(ev, today_iso)] if s]

    print(f"Parsed {len(events)} cards; {len(schemas)} schemas with complete data.", file=sys.stderr)

    sql = build_sql(schemas)
    if args.out == "-":
        sys.stdout.write(sql)
    else:
        with open(args.out, "w") as f:
            f.write(sql)
        print(f"Wrote {args.out}", file=sys.stderr)

    if args.apply:
        proc = subprocess.run(
            ["wrangler", "d1", "execute", "neverranked-app", "--remote", "--command", sql],
            cwd=str(__import__("pathlib").Path(__file__).resolve().parent.parent),
        )
        return proc.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
