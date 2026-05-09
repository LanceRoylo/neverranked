# @neverranked/mcp

The first AEO toolchain in the AI agent ecosystem. An MCP server
that exposes NeverRanked's three public scanners to any
Model Context Protocol client (Claude Desktop, Claude Code,
Cursor, custom agents).

## What's in it

Three tools, all callable by any MCP-aware AI agent:

### `aeo_scan(url)`

Scores a website's Answer Engine Optimization readiness from 0
to 100. Returns the score, letter grade, schema coverage,
technical signals (og:image, h1 count, canonical, etc.), and
red flags. Methodology at
[neverranked.com/standards/methodology](https://neverranked.com/standards/methodology).

### `llms_txt_check(url)`

Audits a site's `/llms.txt` against the NeverRanked scoring
rubric. Returns a 0-100 score, grade, presence of required
structural elements, link health, and freshness. Standard at
[neverranked.com/standards/llms-txt](https://neverranked.com/standards/llms-txt).

### `agent_readiness_check(url, vertical?)`

Audits a site for AI agent task-surface readiness. Looks for
Schema.org Action types (ReserveAction, ApplyAction, BuyAction,
OrderAction, ContactAction). Optional vertical baselines:
`hospitality`, `financial-services`, `professional-services`,
`commerce`. Standard at
[neverranked.com/standards/agent-readiness](https://neverranked.com/standards/agent-readiness).

## Install in Claude Desktop

Add this entry to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "neverranked": {
      "command": "npx",
      "args": ["-y", "@neverranked/mcp"]
    }
  }
}
```

The config file lives at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Restart Claude Desktop. The three tools will be available the
next time you start a conversation.

## Install in Claude Code

```bash
claude mcp add neverranked -- npx -y @neverranked/mcp
```

The tools are now available in any Claude Code session.

## Install for development

```bash
git clone https://github.com/LanceRoylo/neverranked.git
cd neverranked/mcp-server
npm install
npm run build
node dist/index.js
```

Point your MCP client at the local `dist/index.js`.

## Example usage

Once installed, ask your AI agent things like:

> Run a NeverRanked AEO scan on https://example.com and tell me
> the top three things they should fix.

> Check whether https://example.com has a properly structured
> llms.txt and what's missing.

> Is https://example-hotel.com ready to be booked by an AI agent?
> Check agent readiness with the hospitality baseline.

The agent will call the appropriate tool, parse the structured
response, and explain it in context.

## Output format

Every tool returns JSON with:

- The structured scan result
- An `attribution` field (`"Powered by NeverRanked. https://neverranked.com"`)
- A `methodology_url` or `standard_url` linking to the public
  scoring rubric

Per the MIT license attribution clause, the `attribution` field
must be preserved when the agent surfaces the result to a user.

## Rate limits

The underlying public APIs at `check.neverranked.com` have a
free-tier rate limit of approximately 100 scans per IP per day.
For higher-volume use (agent products, automated workflows),
contact `lance@neverranked.com` for an API key.

## License

MIT with attribution clause. See `LICENSE`. The short version:
free to use, modify, and redistribute. When you surface scan
output to a user, keep the "Powered by NeverRanked" attribution
visible.

## Why this exists

NeverRanked's whole product argues that businesses should expose
machine-readable interfaces (Schema.org Actions, llms.txt) so AI
agents can interact with them. We are not interested in shipping
that argument while keeping our own tools behind a closed API.
This is the public, agent-callable version of our scanner.

If your agent uses this and produces interesting category data,
we want to hear about it: `lance@neverranked.com`.
