# Never Ranked Audit Template

This is the blank template for every Never Ranked client audit. Duplicate this folder, rename to `audits/{client-name}/`, and fill in each file with client-specific findings.

---

## How to run a new audit

### 1. Create the client folder

```bash
cp -r audit-template audits/{client-name}
cd audits/{client-name}
mkdir raw
```

### 2. Run the intake script (gathers raw data)

```bash
python3 ../../scripts/run-audit.py {client-domain} --out raw/
```

This will:
- Fetch the homepage, robots.txt, sitemap.xml
- Pull 5-10 representative sample pages
- Extract technical signals (meta, canonical, schema, headings, links)
- Run baseline SERP tests on category-relevant queries
- Write findings to `raw/intake-report.json`

### 3. Fill in each deliverable

Work through the numbered files in order. Each has pre-written section headers and guidance on what to fill in.

Total time budget: **4-6 hours of focused work per audit.**

| # | File | Expected time |
|---|---|---|
| 00 | Executive summary | 30 min (write last) |
| 01 | (reserved for client intake form) | 15 min |
| 02 | Technical audit | 60 min |
| 03 | Schema review | 45 min |
| 04 | Keyword gap analysis | 60 min |
| 05 | AI citation audit | 90 min |
| 06 | Competitor teardown | 45 min |
| 07 | 90-day roadmap | 45 min |

### 4. Package and deliver

- Final review pass (30 min)
- Convert to PDF if client wants print-ready (15 min)
- Loom recording walkthrough (20 min)
- Email delivery with links

**Total client-facing delivery time: ~5 hours**, well within the 48-hour SLA.

---

## Files in this template

- `00-executive-summary.md` — one-page headline findings
- `01-intake.md` — client-supplied context (brief, URL, priorities)
- `02-technical-audit.md` — meta, canonicals, og, schema inventory
- `03-schema-review.md` — JSON-LD coverage and gap analysis
- `04-keyword-gap.md` — SERP reality + intent clusters
- `05-ai-citations.md` — citation share across target queries
- `06-competitor-teardown.md` — side-by-side with 3-5 competitors
- `07-roadmap.md` — 90-day prioritized action plan

---

## The single-line promise this template enforces

Every audit ends with a roadmap. Every roadmap item traces back to a specific finding in a numbered earlier file. If a recommendation doesn't map to evidence, it doesn't belong in the roadmap.
