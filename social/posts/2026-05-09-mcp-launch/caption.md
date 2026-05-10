# LinkedIn — MCP Launch (two posts: personal + company)

Both posts use the same image (`card.png`). Different captions for
different audiences: personal feed = founder voice; company page =
institutional voice.

---

## Personal LinkedIn caption (paste verbatim)

I just shipped @neverranked/mcp on npm. It is the first AEO toolchain in the AI agent ecosystem.

Three tools live in any Claude Desktop or Claude Code session: AEO scoring, llms.txt audit, and agent-readiness checks. One install command. No NeverRanked account required.

Why I shipped this:

For months I have been arguing that businesses should expose machine-readable interfaces so AI agents can interact with them. Schema. Actions. llms.txt. The whole architecture of being citable by AI.

I was not interested in shipping that argument while keeping our own tools behind a closed API. So we did not. The MCP wraps the same scanner that runs at check.neverranked.com. Same logic, same scoring, same methodology. Free.

The agent ecosystem is forming right now. Today there is no canonical AEO toolchain in the public registry, no default Claude Desktop catalog entry, no developer workflow assembling around an AEO API. Whoever ships first takes the category position.

We chose to be first.

Install in Claude Code:
claude mcp add neverranked -- npx -y @neverranked/mcp

Or in Claude Desktop: add the npx command to your config. Full instructions in the launch post.

If you build something interesting with it, send it. I want to see what gets built on top of this.

Launch post: https://neverranked.com/blog/the-first-aeo-mcp-server/
Package: https://www.npmjs.com/package/@neverranked/mcp

#MCP #AEO #ClaudeCode #ModelContextProtocol #AISearch #BuildInPublic

---

## Company LinkedIn Page caption (paste verbatim)

## What this is

Developer-audience launch post for the NeverRanked company LinkedIn page,
announcing `@neverranked/mcp` 0.1.0 on npm. Distinct from the
"AI is writing your storefront" personal post — different audience
(developers vs business owners), different reading pace.

### Caption (paste verbatim on the company page)

`@neverranked/mcp` is live on npm.

It's the first AEO toolchain in the AI agent ecosystem. Three tools, callable from Claude Desktop, Claude Code, or any Model Context Protocol client:

→ aeo_scan(url) — full 0-100 AEO score, schema coverage, technical signals
→ llms_txt_check(url) — grade for the site's /llms.txt against the published rubric
→ agent_readiness_check(url, vertical?) — Schema.org Action coverage with vertical baselines

Install in Claude Desktop with one config entry. Install in Claude Code with one command. Free. No NeverRanked account required.

We've been arguing for months that businesses should expose machine-readable interfaces so AI agents can interact with them. Shipping the MCP is us eating our own cooking publicly. NeverRanked is now agent-callable.

The agent ecosystem is forming right now. Today there is no canonical AEO toolchain in the public registry, no default Claude Desktop catalog entry, no developer workflow assembling around an AEO API. Whoever ships first takes the category position.

We chose to be first.

Read the launch post: https://neverranked.com/blog/the-first-aeo-mcp-server/
Install: https://www.npmjs.com/package/@neverranked/mcp

#MCP #ModelContextProtocol #ClaudeCode #AEO #AnswerEngineOptimization #AISearch #DevTools

## Posting notes

- **Best window:** Tuesday-Thursday 6:30-9:30am ET. Hits the developer
  feed at peak.
- **Reply velocity:** developers comment with install errors and feature
  requests. Reply to first 5-10 within 30 minutes; the algorithm rewards
  thread depth and the questions seed v0.2 priorities.
- **Cross-post:** if reception is good on LinkedIn, the same caption
  works on X with minor trimming. The hashtags carry to the dev-Twitter
  audience.
- **Submit to /r/mcp and /r/ClaudeAI** as a separate move 24h after
  the LinkedIn post drops. Reddit hates linkbait so frame it as
  "we shipped X, looking for feedback" with the package link in the
  body, not the title.

## Why this works

- **Specificity (named creative lever):** real package, real install
  command, real install path. Reader can verify in 60 seconds by running
  `npx -y @neverranked/mcp` from a terminal.
- **Strategic framing:** "first AEO toolchain in the agent ecosystem"
  is a category-defining claim that's currently true. Owns positioning
  while it's available.
- **Two-track CTA:** the npm link converts developers immediately, the
  blog link converts readers who want context first. Different reader
  paths, both lead to install.
