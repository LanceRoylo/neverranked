# Agent Readiness — {Client Name}

**Auditor:** Never Ranked
**Sample date:** {YYYY-MM-DD}
**Scope:** Schema.org ActionType deployment, root URL
**Tool:** `agent_readiness_check` v2 (27 ActionTypes recognized, JSON-LD + Microdata, deep-nesting traversal up to depth 12)

---

## What this section measures

This section is forward-looking. It does not measure how AI engines cite you today. It measures whether your site is ready for the next generation of AI tooling — agents that act on a user's behalf to book, apply, buy, and contact, rather than just answering questions.

The mechanism: Schema.org defines a set of `Action` types (`ReserveAction`, `ApplyAction`, `BuyAction`, `ContactAction`, plus 23 others) that mark transactional surfaces on a site. When an AI agent (OpenAI Operator, Anthropic computer-use, Perplexity agent mode, ChatGPT agent surface) tries to complete a task on a user's behalf, it looks for these markers to know which page does what, what fields exist, what the target URL is, and what the expected result is. Sites with Action schemas deployed are agent-completable. Sites without have to be interpreted from raw HTML, which fails reliably for most non-trivial tasks.

## Your current state

**Agent-readiness score:** {SCORE} / 100 ({GRADE})

**ActionTypes detected on root URL:** {ACTION_TYPES_FOUND_OR_NONE}

{ACTION_DETAILS_TABLE_OR_NONE_PARAGRAPH}

## How you compare

Across a 25-site panel NeverRanked scanned on 2026-05-12 (banks, hospitality chains, e-commerce platforms, healthcare systems, education, SaaS, government), **1 site of 19 successfully scanned had any Schema.org ActionType on its root URL.** That's 5.3%.

Translation: nobody is shipping this yet. The category is wide open. The first deployer in your vertical owns the agent layer for the 12-to-18-month window before the field catches up.

## What's missing for your vertical ({VERTICAL_OR_NULL})

{MISSING_BASELINE_SECTION_OR_NO_VERTICAL_NOTE}

## What deploying Action schemas does

For each missing ActionType, the buyer outcome:

{WHY_MISSING_MATTERS_LIST}

## Roadmap implications

Section 07 (Roadmap) sequences the schema deployments your audit recommends. The Action-layer deployments belong in M2 or M3 (after the core entity schemas in M1 have been deployed and indexed), unless you have a specific competitive reason to lead with them. The technical lift per ActionType is roughly the same as a standard schema deployment — what's new is the `target` / `EntryPoint` resolution and (for some types) the `query-input` syntax that lets an agent supply parameters.

## Reproducibility

This scan is open source and reproducible. The detection logic is in `mcp-server/src/tools/agent-readiness-check.ts` in the NeverRanked GitHub repo. Anyone can re-run the same scan against the same URL and verify the numbers. If you (or your dev team) get a different result, file an issue and we'll trace the disagreement.

## What this section is not

This is a measurement of the future, not the present. AI engines today still primarily cite based on the core schema layer (`Organization`, `Service`, `FAQPage`, `AggregateRating`) that the rest of your audit covers. Deploying ActionTypes does not improve your current citation share — it positions you for the agent shift that is materializing now and will be mainstream within 18 months.

Treat this section as a leading indicator. If the rest of your audit is fixed and your citation share is healthy, this is the next layer to deploy. If the rest of your audit shows core schema gaps, fix those first.

---

<!-- AUDIT-GENERATE: This section is auto-populated by scripts/audit-generate.mjs from a live scan of the client URL. If you see `{PLACEHOLDER}` text, the scan did not run or failed; re-run audit-generate or scan manually with `node scripts/agent-readiness-test-harness.mjs --site=<client-url> --vertical=<vertical>`. -->
