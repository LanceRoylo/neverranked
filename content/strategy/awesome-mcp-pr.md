---
title: "Awesome-MCP-Servers PR draft for @neverranked/mcp"
target_repo: "github.com/wong2/awesome-mcp-servers (and any other awesome-mcp lists)"
target_submit_date: 2026-05-13 (Wednesday, day after HN)
status: draft, ready to copy-paste
---

# Awesome-MCP-Servers PR

Ships @neverranked/mcp into the canonical community-curated
directory of MCP servers so any agent developer browsing for
SEO / AEO / web-audit tools finds us.

## Step 0: which list(s) to PR

Primary target:

  https://github.com/wong2/awesome-mcp-servers

Secondary lists worth submitting to once the primary lands:

  - https://github.com/punkpeye/awesome-mcp-servers
  - https://github.com/appcypher/awesome-mcp-servers
  - https://github.com/PipedreamHQ/awesome-mcp-servers
  - mcpservers.org submission form

Do not blast all at once. Land on the primary first, see what
the maintainer flags (category placement, description
length), revise, then submit to the others with the polished
version.

## Step 1: the README entry

The canonical awesome-mcp-servers format is one Markdown line
per server, alphabetized within a category. Their categories
include "Browser Automation", "Cloud Platforms", "Communication",
"Customer Data Platforms", "Databases", "Developer Tools",
"Marketing", "Monitoring", "Search", and so on.

Best category fit for @neverranked/mcp: **Marketing** or
**Search** depending on the list. Marketing is the cleaner home
since the audience that cares about Answer Engine Optimization
is a marketing-leaning operator, not a search engineer.

The entry to add, alphabetized:

```markdown
- [neverranked-mcp](https://github.com/LanceRoylo/neverranked) -- AEO (Answer Engine Optimization) toolchain. Scores any URL against NeverRanked's 0-100 AEO methodology, validates `llms.txt` files, and audits Schema.org Action types for AI agent task readiness. Used by Claude Desktop, Claude Code, and any MCP client.
```

Description tradeoffs considered:

- Under 200 chars (most awesome-mcp lists prefer concise)
- Specific verbs (scores, validates, audits) instead of
  adjectives
- "AEO" expanded on first use because the acronym is unknown to
  the average MCP-list reader
- Concrete clients named (Claude Desktop, Claude Code) so the
  reader can immediately picture using it
- No marketing register, no exclamation points

## Step 2: PR title

```
Add neverranked-mcp (AEO scoring, llms.txt, agent-readiness)
```

73 chars. Within standard PR title conventions. Says what
got added and what the server does. Maintainers approve PRs
faster when the title is self-explanatory.

## Step 3: PR body

```markdown
Adds [@neverranked/mcp](https://www.npmjs.com/package/@neverranked/mcp) to the Marketing section.

What the server does:

- `aeo_scan(url)` -- scores a URL's Answer Engine Optimization readiness from 0 to 100. Public methodology at https://neverranked.com/standards/methodology and live weekly reports at https://neverranked.com/state-of-aeo.
- `llms_txt_check(url)` -- validates a site's `/llms.txt` against the NeverRanked rubric. Returns score, link health, freshness.
- `agent_readiness_check(url, vertical?)` -- audits Schema.org Action types (ReserveAction, ApplyAction, BuyAction, ContactAction, etc.) for agent task-surface readiness.

Why it fits awesome-mcp-servers:

- Live on npm: https://www.npmjs.com/package/@neverranked/mcp (v0.1.2)
- Listed in the official MCP registry as `io.github.LanceRoylo/mcp`
- Open source (MIT)
- Source: https://github.com/LanceRoujo/neverranked/tree/main/mcp-server
- No API key required for the public tools
- Tested against Claude Desktop and Claude Code

Happy to revise the category placement, description wording, or anything else that helps the entry land cleanly.
```

Note: I caught one typo in the source draft (LanceRoujo) when
re-reading. Fixed below in the corrected version. Always proof
once more before submitting.

## Step 3b: PR body (corrected)

```markdown
Adds [@neverranked/mcp](https://www.npmjs.com/package/@neverranked/mcp) to the Marketing section.

What the server does:

- `aeo_scan(url)` -- scores a URL's Answer Engine Optimization readiness from 0 to 100. Public methodology at https://neverranked.com/standards/methodology and live weekly reports at https://neverranked.com/state-of-aeo.
- `llms_txt_check(url)` -- validates a site's `/llms.txt` against the NeverRanked rubric. Returns score, link health, freshness.
- `agent_readiness_check(url, vertical?)` -- audits Schema.org Action types (ReserveAction, ApplyAction, BuyAction, ContactAction, etc.) for agent task-surface readiness.

Why it fits awesome-mcp-servers:

- Live on npm: https://www.npmjs.com/package/@neverranked/mcp (v0.1.2)
- Listed in the official MCP registry as `io.github.LanceRoylo/mcp`
- Open source (MIT)
- Source: https://github.com/LanceRoylo/neverranked/tree/main/mcp-server
- No API key required for the public tools
- Tested against Claude Desktop and Claude Code

Happy to revise the category placement, description wording, or anything else that helps the entry land cleanly.
```

## Step 4: mechanical PR steps

1. Fork `github.com/wong2/awesome-mcp-servers`
2. Clone the fork locally:
   ```
   git clone git@github.com:LanceRoylo/awesome-mcp-servers.git
   cd awesome-mcp-servers
   git checkout -b add-neverranked-mcp
   ```
3. Open `README.md`. Locate the Marketing section (or whichever
   the list uses). Insert the entry from Step 1, alphabetized.
4. Commit:
   ```
   git add README.md
   git commit -m "Add neverranked-mcp (AEO scoring, llms.txt, agent-readiness)"
   git push origin add-neverranked-mcp
   ```
5. Open the PR with the title and body from Steps 2 and 3b.
6. Tag any maintainer named in the README contributor section if
   the repo lists them, otherwise just open and wait.

## Step 5: secondary lists

After the primary PR is open (whether merged or not), repeat
Steps 1-4 for the other lists. Use the same entry and PR body.
Maintainers across these lists talk to each other; consistent
copy across submissions reads as effort and gets through faster.

## What to do if a maintainer pushes back

Predictable pushback patterns and the right responses:

- **"AEO is not standard MCP server territory."** Response:
  "MCP is platform-agnostic about what tools a server exposes.
  The marketing / SEO / web-audit category is sparse in the
  list today. This entry fills it with a concrete, free,
  open-source tool agents can use to evaluate any URL."

- **"Description too long."** Cut to: "AEO scoring, llms.txt
  audit, and Schema.org agent-readiness checks. Used by Claude
  Desktop and Claude Code."

- **"Why is this in the list when it's marketing rather than a
  general developer tool?"** Response: "MCP-aware coding agents
  use it during web-development tasks (validating schema, llms.txt,
  agent-ready Action types). The marketing label is shorthand
  for the audience that cares most, but the use case is
  developer-facing."

## Cover note if there is a contributors-only channel

Some awesome lists have Discord or Slack for contributors. If
one exists for awesome-mcp, the right intro there is:

> Hey, I just opened PR #N adding @neverranked/mcp to the
> Marketing section. Open-source AEO scoring + llms.txt audit +
> Schema.org agent-readiness checks. Happy to revise placement
> or copy. Repo: github.com/LanceRoylo/neverranked. npm:
> @neverranked/mcp.

Same register as the PR body. No marketing voice.

## What this is NOT

- Not a substitute for the HN submission or the LinkedIn launch
  post. The awesome-mcp PR drives discovery from MCP-curious
  developers; HN drives a general technical audience; LinkedIn
  drives buyer audience. Three different surfaces.
- Not a campaign with a deadline. Awesome-list PRs land on the
  maintainer's schedule (anywhere from 2 days to 4 weeks). Don't
  wait on the merge before doing other distribution.
