#!/usr/bin/env node
/**
 * @neverranked/mcp — Model Context Protocol server exposing NeverRanked's
 * Answer Engine Optimization (AEO) toolkit to AI agents.
 *
 * The first AEO toolchain in the agent ecosystem. Lets any MCP-aware
 * client (Claude Desktop, Claude Code, Cursor, etc.) score a website's
 * AEO readiness, audit its llms.txt, and check agent-readiness — all
 * without a NeverRanked account.
 *
 * Three tools:
 *   - aeo_scan(url): full AEO score 0-100, schema coverage, signals
 *   - llms_txt_check(url): grade for the site's /llms.txt
 *   - agent_readiness_check(url, vertical?): grade for AI agent task
 *     surfaces (ReserveAction, ApplyAction, etc.)
 *
 * Methodology: https://neverranked.com/standards/methodology
 * Issues: https://github.com/LanceRoylo/neverranked/issues
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { aeoScan } from "./tools/aeo-scan.js";
import { llmsTxtCheck } from "./tools/llms-txt-check.js";
import { agentReadinessCheck } from "./tools/agent-readiness-check.js";
import { PKG_NAME, PKG_VERSION } from "./lib/pkg-info.js";

const SERVER_NAME = PKG_NAME;
const SERVER_VERSION = PKG_VERSION;

// Vertical enum kept in sync with VERTICAL_BASELINES in
// tools/agent-readiness-check.ts. If a vertical is added there but
// not here, MCP clients that validate against this enum will reject
// the call. If a value is here but not there, the call succeeds with
// no vertical-specific comparison.
const VERTICAL_ENUM = [
  "hospitality",
  "restaurants",
  "financial-services",
  "professional-services",
  "healthcare",
  "education",
  "commerce",
  "saas",
  "media",
  "real-estate",
  "nonprofit",
  "government",
  "performing-arts",
];

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "aeo_scan",
      description:
        "Score a website's Answer Engine Optimization (AEO) readiness from 0 to 100. Returns the score, letter grade, schema coverage breakdown, technical signals (og:image, h1 count, canonical, etc.), and red flags. Use this when you want to know how citable a site is to ChatGPT, Claude, Perplexity, Gemini, Microsoft Copilot, and Google AI Overviews. Methodology at neverranked.com/standards/methodology.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Full URL of the website to scan, including protocol. Example: https://example.com",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "llms_txt_check",
      description:
        "Audit a website's /llms.txt file against the published standard. Returns a 0-100 score, grade, presence of required structural elements (H1, blockquote, sections), link health, and freshness. Use this when you want to know if a site is properly exposing its content map to AI engines that respect llms.txt (Anthropic Claude, with OpenAI and others stated to follow). Standard at neverranked.com/standards/llms-txt.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Base URL of the site to check. The tool fetches /llms.txt at the root of this URL.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "agent_readiness_check",
      description:
        "Audit a website for AI agent task-surface readiness. Looks for Schema.org Action types (ReserveAction, ApplyAction, BuyAction, OrderAction, ContactAction) in JSON-LD blocks. Returns a 0-100 score with vertical-specific baselines and validation issues. Use this when you want to know if a site is prepared for the agentic AI shift, where AI agents perform tasks (book, apply, buy) on behalf of users rather than just answering questions. Standard at neverranked.com/standards/agent-readiness.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL of the website to scan.",
          },
          vertical: {
            type: "string",
            enum: VERTICAL_ENUM,
            description:
              "Optional vertical baseline to score against. If omitted, the tool reports actions present without comparing to a vertical-specific expected set.",
          },
        },
        required: ["url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (!args || typeof args !== "object") {
    throw new Error(`Tool ${name} called without arguments`);
  }

  let result: unknown;
  switch (name) {
    case "aeo_scan":
      result = await aeoScan(args as { url: string });
      break;
    case "llms_txt_check":
      result = await llmsTxtCheck(args as { url: string });
      break;
    case "agent_readiness_check":
      result = await agentReadinessCheck(args as { url: string; vertical?: string });
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Connect via stdio transport (standard for Claude Desktop / Claude Code)
const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr so it doesn't pollute the JSON-RPC stream on stdout
console.error(`[${SERVER_NAME}@${SERVER_VERSION}] connected via stdio`);
