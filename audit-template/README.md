# Never Ranked Audit Template

Source-of-truth template for every Never Ranked client audit. The
audit auto-populator (`scripts/audit-generate.mjs`) reads from these
files and uses them as the structural template, so changes here
propagate to every future generated audit.

---

## How to run a new audit

### Fast path (auto-populator, ~5 minutes generation + ~30 minutes review)

If the prospect is in the outreach DB:

```bash
node scripts/audit-generate.mjs --prospect-id=192 --pdf
```

If the prospect is NOT in the outreach DB:

```bash
node scripts/audit-generate.mjs \
  --url=https://example.com \
  --client=example-inc \
  --name="Example Inc" \
  --vertical=smb \
  --pdf
```

This generates everything end-to-end:
- Runs `scripts/run-audit.py` for the technical scan (~30s)
- Calls Claude per section to populate 02 / 03 / 07 / 00 (~90s)
- Writes `delivery-email.md` (the email you paste into Gmail)
- With `--pdf`: renders `audit.pdf` via Playwright (a single branded deliverable)
- Sections 04 / 05 / 06 are left as templates with TODO markers (Phase 2)

Output lands in `audits/<client>/`:
- `00-executive-summary.md` (auto-populated)
- `02-technical-audit.md` (auto-populated)
- `03-schema-review.md` (auto-populated, with paste-ready JSON-LD)
- `04-keyword-gap.md` (template, hand-fill or skip)
- `05-ai-citations.md` (template, hand-fill or skip)
- `06-competitor-teardown.md` (template, hand-fill or skip)
- `07-roadmap.md` (auto-populated)
- `delivery-email.md` (the email you send when shipping)
- `audit.pdf` (single branded deliverable)
- `raw/intake-report.json` (technical scan output)

### Manual path (if you want to write each section by hand)

Still works the way it always did. Duplicate the template:

```bash
cp -r audit-template audits/{client-name}
cd audits/{client-name}
mkdir raw
python3 ../../scripts/run-audit.py {client-domain} --out raw/
```

Then work through the numbered files. Time budget: 4-6 hours of focused work per audit.

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

### Delivery

- Final review pass (~30 min) — check the auto-populated sections for accuracy and tone
- Email delivery: paste `delivery-email.md` into Gmail, attach `audit.pdf`
- Optional: Loom recording walkthrough (~20 min) for high-stakes deliveries

**Total client-facing delivery time with the auto-populator: ~30-45 minutes**, well within the 48-hour SLA.

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
