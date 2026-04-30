#!/usr/bin/env python3
"""
citation-tracker.py — generate a manual-but-accelerated citation tracking
checklist for an AEO engagement.

Most AI engines block automation in their public surfaces (ChatGPT.com,
Perplexity, Gemini, Google AI Overviews). The realistic version of "citation
tracking" is a fast manual loop: open the engine, paste the query, screenshot
the answer, log whether the client appeared.

This script does the boring part. It takes an engagement config (queries +
target brand + comparator brands) and emits:

  1. A pre-filled URL for each (engine x query) combination so the operator
     just clicks and screenshots.
  2. A markdown checklist with a row per (engine x query) for tracking
     citation status, position, and notes.
  3. A JSON skeleton for storing structured results (date-stamped, so the
     same script can be re-run weekly to track movement).

USAGE
  python3 citation-tracker.py path/to/engagement.json

ENGAGEMENT CONFIG SHAPE
  {
    "client_slug": "and-scene",
    "client_name": "And Scene Hawaii",
    "queries": [
      "best corporate training Honolulu",
      "applied improvisation training corporate",
      "..."
    ],
    "comparators": [
      "THEY improv",
      "Business Improv",
      "Hawaii Leadership Academy"
    ]
  }

OUTPUT
  Files written to /Users/lanceroylo/Desktop/neverranked/case-studies/<slug>/_data/
    - YYYY-MM-DD-checklist.md   (markdown checklist with pre-filled URLs)
    - YYYY-MM-DD-results.json   (skeleton results doc the operator fills in)

Author: Neverranked
"""

from __future__ import annotations

import json
import sys
import datetime
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CASE_STUDIES = REPO_ROOT / "case-studies"


ENGINES = [
    {
        "id": "chatgpt",
        "name": "ChatGPT",
        "url_template": "https://chatgpt.com/?q={q}&hints=search&model=gpt-4o",
        "notes": "Use the search-enabled model so live web citations surface.",
    },
    {
        "id": "perplexity",
        "name": "Perplexity",
        "url_template": "https://www.perplexity.ai/search?q={q}",
        "notes": "Public sources usually visible directly in answer.",
    },
    {
        "id": "gemini",
        "name": "Gemini",
        "url_template": "https://gemini.google.com/app?q={q}",
        "notes": "Some queries trigger Google Search-grounded answers; some do not.",
    },
    {
        "id": "google_aio",
        "name": "Google AI Overviews",
        "url_template": "https://www.google.com/search?q={q}&udm=14",
        "notes": "AI Overview only fires on certain query intents; if missing, screenshot the regular SERP and note 'no AIO triggered'.",
    },
]


def build_url(template: str, query: str) -> str:
    return template.format(q=urllib.parse.quote_plus(query))


def render_markdown(config: dict, run_date: str) -> str:
    client_name = config["client_name"]
    queries = config["queries"]
    comparators = config.get("comparators", [])

    lines = []
    lines.append(f"# Citation tracking checklist — {client_name}")
    lines.append("")
    lines.append(f"**Run date:** {run_date}")
    lines.append("")
    lines.append("**Target brand:** " + client_name)
    if comparators:
        lines.append("**Comparators to track:** " + ", ".join(comparators))
    lines.append("")
    lines.append("## How to use this")
    lines.append("")
    lines.append("For each row below:")
    lines.append("1. Click the link to open the engine with the query pre-filled.")
    lines.append("2. Wait for the answer to fully render.")
    lines.append("3. Screenshot the full answer. Save with the filename pattern shown in the row.")
    lines.append("4. Update the result columns by editing the matching row in the JSON file.")
    lines.append("")
    lines.append("Use a clean browser session (incognito or a profile with no AI personalization) so the answers reflect a default user, not your history.")
    lines.append("")

    for q_idx, query in enumerate(queries, start=1):
        lines.append(f"## Query {q_idx}: `{query}`")
        lines.append("")
        lines.append("| # | Engine | Open the engine | Screenshot filename |")
        lines.append("|---|--------|-----------------|---------------------|")
        for e_idx, engine in enumerate(ENGINES, start=1):
            url = build_url(engine["url_template"], query)
            slug_q = "".join(c if c.isalnum() else "-" for c in query.lower())[:48].strip("-")
            filename = f"{run_date}__q{q_idx}__{engine['id']}__{slug_q}.png"
            lines.append(f"| {e_idx} | {engine['name']} | [Open]({url}) | `{filename}` |")
        lines.append("")
        lines.append(f"_Notes per engine_: " + " ".join(f"**{e['name']}** — {e['notes']}" for e in ENGINES))
        lines.append("")

    return "\n".join(lines)


def render_json_skeleton(config: dict, run_date: str) -> dict:
    return {
        "client_slug": config["client_slug"],
        "client_name": config["client_name"],
        "run_date": run_date,
        "comparators": config.get("comparators", []),
        "results": [
            {
                "query": query,
                "engines": [
                    {
                        "engine_id": engine["id"],
                        "engine_name": engine["name"],
                        "client_cited": None,
                        "client_position": None,
                        "comparators_cited": [],
                        "answer_summary": "",
                        "notes": "",
                    }
                    for engine in ENGINES
                ],
            }
            for query in config["queries"]
        ],
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: citation-tracker.py path/to/engagement.json", file=sys.stderr)
        return 2

    config_path = Path(argv[1])
    if not config_path.exists():
        print(f"config not found: {config_path}", file=sys.stderr)
        return 2

    config = json.loads(config_path.read_text())

    required = ["client_slug", "client_name", "queries"]
    for k in required:
        if k not in config:
            print(f"config missing required key: {k}", file=sys.stderr)
            return 2

    run_date = datetime.date.today().isoformat()

    out_dir = CASE_STUDIES / config["client_slug"] / "_data"
    out_dir.mkdir(parents=True, exist_ok=True)

    md_path = out_dir / f"{run_date}-checklist.md"
    json_path = out_dir / f"{run_date}-results.json"

    md_path.write_text(render_markdown(config, run_date))
    json_path.write_text(json.dumps(render_json_skeleton(config, run_date), indent=2) + "\n")

    print(f"wrote {md_path}")
    print(f"wrote {json_path}")
    print()
    print(f"Open the markdown file, click the links, screenshot each answer.")
    print(f"Then fill in {json_path.name} as you go. The file is dated, so re-running")
    print(f"the script tomorrow or next week creates a fresh pair without overwriting today.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
