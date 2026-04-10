# {CLIENT NAME} — Remediation Implementation

**Client:** {client-name}
**Engagement start:** {YYYY-MM-DD}
**Audit roadmap:** `../07-roadmap.md`
**Action catalog (reference):** `remediation-template/action-catalog.md` (do not copy, use in place)

---

## Month 1 action status

| # | Action | Status | File | Verified |
|---|---|---|---|---|
| A1 | Root schema | pending | — | — |
| A7 | Canonical tags + robots | pending | — | — |
| A9 | Title + meta rewrites | pending | — | — |
| A11 | Pillar article | pending | — | — |

Status values: `pending`, `in-progress`, `shipped`, `verified`, `blocked`.
"Verified" column lists the date `scripts/verify-deploy.sh` passed all checks.

Delete rows for actions not in this client's roadmap. Add rows for actions from the catalog that this client's roadmap requires.

---

## How to work in this folder

1. For each action in the status table, create a per-action implementation file named `{action-id}-{short-slug}.md` (e.g. `A11-buyer-agent-commission-pillar.md`).
2. Start from the matching stub in `remediation-template/implementation-stubs/` (if one exists) or from the Montaic reference implementation linked in `remediation-template/action-catalog.md`.
3. When referencing template files from inside this folder, use the repo-root-relative path: `remediation-template/voice-rubric-v0.md`, not `../../../remediation-template/voice-rubric-v0.md`. Write paths as you would `cd` from the neverranked repo root.
4. When a file is shipped, run `scripts/verify-deploy.sh` from the repo root, paste the output date into the "Verified" column, and move the status to `verified`.
5. Do not edit files in `remediation-template/` from this folder. If you find a template bug, fix it at the source.

---

## Notes / decisions log

Track anything here that a future engagement would benefit from knowing. Examples:

- Which Montaic reference files diverged from this client's codebase and why
- Voice rubric additions specific to this client (and whether any should promote back to v0)
- Action-catalog entries that didn't fit this client's shape

Keep it terse. One line per decision when possible.
