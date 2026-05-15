#!/usr/bin/env node
/**
 * Conversation decision indexer.
 *
 * Reads Claude Code session transcript .jsonl files and extracts
 * structured decisions Lance made during those sessions. Output is
 * inspected before being written to the lance_decisions table.
 *
 * Architecture:
 *   1. Parse a .jsonl file line by line. Each line is a message in the
 *      session. Messages have role=user (Lance) or role=assistant (Claude).
 *   2. For each Lance message, grab the immediately-preceding Claude
 *      message as context.
 *   3. Send both to GPT-4o-mini with a strict JSON schema. The LLM
 *      classifies whether the message is a decision and, if so, what
 *      kind (option_pick / approval / rejection / direction / pushback /
 *      clarification_pick).
 *   4. Print results as a pretty table to stdout. Optionally emit a
 *      SQL file Lance can execute via `wrangler d1 execute --file=`.
 *
 * Usage:
 *   export OPENAI_API_KEY=sk-...
 *   node scripts/decision-indexer.mjs --file=<path>            # dry-run, just print extractions
 *   node scripts/decision-indexer.mjs --file=<path> --sql=<out>  # also emit SQL inserts
 *   node scripts/decision-indexer.mjs --file=<path> --limit=20    # only process first N user messages
 *
 * Bulk mode:
 *   node scripts/decision-indexer.mjs --all --sql=<out>  # all 39 session files; one combined SQL file
 *
 * Cost note: roughly $0.001-0.005 per Lance message. A session with
 * 100 messages costs about $0.10-0.50. The full 39-file historical
 * sweep should cost $10-30 total at current scale.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

// Stable 31-bit positive int from a string. Used as artifact_id so
// re-running the indexer against the same session transcript is idempotent
// (combined with the partial unique index in migration 0078).
function stableId(sessionId, lanceUuid, fallbackIndex) {
  const key = `${sessionId}::${lanceUuid || `idx:${fallbackIndex}`}`;
  const hex = createHash("sha1").update(key).digest("hex").slice(0, 8);
  return parseInt(hex, 16) & 0x7fffffff;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function arg(name) {
  const flag = args.find(a => a.startsWith(`--${name}=`));
  return flag ? flag.split("=").slice(1).join("=") : null;
}
function hasFlag(name) { return args.includes(`--${name}`); }

const FILE = arg("file");
const ALL = hasFlag("all");
const SQL_OUT = arg("sql");
const LIMIT = arg("limit") ? parseInt(arg("limit"), 10) : null;
const SKIP_DONE = hasFlag("skip-done");

// Fetch every (session_id, lance_uuid) pair that has already been
// indexed into lance_decisions, organized as Map<session_id, Set<lance_uuid>>.
// Used with --skip-done so re-runs only spend tokens on un-indexed pairs.
//
// The 2026-05-13 upgrade: was previously session-level (skip the whole
// session if any row exists), but that meant rate-limit-truncated
// sessions were stuck permanently incomplete. Per-pair skip lets us
// recover gaps cheaply -- the bulk overnight pass left 25K pairs
// processed but only 320 classified; with this logic the next run only
// pays API cost for the ~24K gap.
function fetchProcessedPairKeys() {
  try {
    const out = execSync(
      `cd ${join(__dirname, "..", "dashboard")} && npx wrangler d1 execute neverranked-app --remote --command "SELECT json_extract(metadata, '$.session_id') AS sid, json_extract(metadata, '$.lance_uuid') AS uid FROM lance_decisions WHERE artifact_type = 'conversation_decision'" --json`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const parsed = JSON.parse(out);
    const rows = parsed?.[0]?.results ?? [];
    const map = new Map();
    let totalPairs = 0;
    let nullUuidCount = 0;
    for (const r of rows) {
      if (!r.sid) continue;
      // Older rows may have null lance_uuid in metadata; those can't be
      // pair-deduped, so we count them but they fall through to normal
      // INSERT OR IGNORE protection at write time.
      if (!r.uid) { nullUuidCount++; continue; }
      if (!map.has(r.sid)) map.set(r.sid, new Set());
      map.get(r.sid).add(r.uid);
      totalPairs++;
    }
    console.log(`[skip-done] loaded ${totalPairs} (session,uuid) pairs across ${map.size} sessions (${nullUuidCount} rows had null lance_uuid and will fall through to row-level dedupe).`);
    return map;
  } catch (e) {
    console.error(`[skip-done] failed to fetch processed pairs: ${e.message}. Proceeding without skip.`);
    return new Map();
  }
}

if (!FILE && !ALL) {
  console.error("Usage: node scripts/decision-indexer.mjs --file=<path> [--sql=<out>] [--limit=N] [--skip-done]");
  console.error("       node scripts/decision-indexer.mjs --all [--sql=<out>] [--skip-done]");
  console.error("");
  console.error("--skip-done queries lance_decisions in remote D1 and skips individual (session,lance_uuid) pairs that are already indexed. Lets re-runs cheaply recover rate-limit-truncated sessions.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY env variable required. Run:");
  console.error("  read -s OPENAI_KEY && export OPENAI_API_KEY=$OPENAI_KEY");
  console.error("Then re-run this script.");
  process.exit(1);
}

const SESSIONS_DIR = "/Users/lanceroylo/.claude/projects/-Users-lanceroylo-Desktop-neverranked";

// ---------------------------------------------------------------------------
// JSONL parsing
// ---------------------------------------------------------------------------

function extractTextContent(content) {
  // Content can be: a string, or an array of content blocks (text/tool_use/etc)
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(b => {
        if (typeof b === "string") return b;
        if (b && b.type === "text" && b.text) return b.text;
        if (b && b.type === "tool_use") return `[tool_use: ${b.name}]`;
        if (b && b.type === "tool_result") return `[tool_result]`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseSession(filepath) {
  const raw = readFileSync(filepath, "utf8");
  const messages = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      // Different Claude Code versions structure things differently.
      // We want top-level messages with role + content.
      const role = obj.role ?? obj.message?.role;
      const content = obj.content ?? obj.message?.content;
      const ts = obj.timestamp ?? obj.createdAt ?? null;
      if (role && content !== undefined) {
        const text = extractTextContent(content);
        if (text.trim().length > 0) {
          messages.push({ role, text, timestamp: ts, uuid: obj.uuid ?? null });
        }
      }
    } catch { /* skip unparseable lines */ }
  }
  return messages;
}

// ---------------------------------------------------------------------------
// LLM extraction
// ---------------------------------------------------------------------------

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_decision", "decision_kind", "summary", "extracted_choice", "reasoning_if_any"],
  properties: {
    is_decision: { type: "boolean", description: "Is this Lance message actually a decision? Most clarifying questions, status checks, and data shares are NOT decisions." },
    decision_kind: {
      type: "string",
      enum: ["option_pick", "approval", "rejection", "direction", "pushback", "clarification_pick", "not_a_decision"],
      description: "Type of decision. Use 'not_a_decision' if is_decision is false.",
    },
    summary: { type: "string", description: "One-sentence summary of what Lance decided (or what he said if not a decision)." },
    extracted_choice: { type: "string", description: "If option_pick, what option did he choose. Otherwise empty string." },
    reasoning_if_any: { type: "string", description: "If Lance gave explicit reasoning, capture it. Otherwise empty string." },
  },
};

const SYSTEM_PROMPT = `You are analyzing a back-and-forth conversation between Lance Roylo (founder of NeverRanked, an AI-search-visibility company) and Claude (an AI assistant helping him build the product).

Given Claude's preceding message and Lance's response, extract structured decision data.

CRITICAL: Most Lance messages are NOT decisions. They're status updates ("page loaded"), data shares (pasting terminal output), clarifying questions ("what does that mean?"), or technical interactions. Only set is_decision=true when Lance is genuinely choosing between options, approving/rejecting a plan, or directing Claude to do specific work.

Decision kinds:
- "option_pick" — Lance picked between multiple options Claude offered (e.g. "1", "B", "let's go with option 2")
- "approval" — Lance approved a Claude proposal ("approved", "go", "ship it", "let's do it")
- "rejection" — Lance rejected a Claude proposal ("no", "scrub this", "don't do that")
- "direction" — Lance gave instructions Claude didn't propose ("now let's also build X", "audit before continuing")
- "pushback" — Lance pushed back or course-corrected ("this is too complex", "this looks terrible", "remember Y")
- "clarification_pick" — Lance answered a yes/no or short question Claude asked
- "not_a_decision" — everything else (questions, data, status, errors, confusion)

Always return strict JSON matching the schema.`;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, options, attempts = 4) {
  // Retry on transient network/socket errors (ECONNRESET, ETIMEDOUT, etc).
  // Long --all runs against the OpenAI API will hit at least one transient
  // blip; without retry the whole run dies and we lose all in-memory work.
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      const backoff = 1000 * Math.pow(2, i); // 1s, 2s, 4s, 8s
      console.log(`  [fetch retry ${i + 1}/${attempts} after ${backoff}ms: ${err?.cause?.code || err?.code || err?.message}]`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function extractDecision(claudeMsg, lanceMsg) {
  // Truncate to keep tokens reasonable. Claude messages can be huge; we care
  // about the LAST chunk (the actual question/proposal). Lance messages are
  // usually short anyway.
  const claudeContext = claudeMsg.slice(-3000);
  const lanceContent = lanceMsg.slice(0, 2000);

  const resp = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `CLAUDE SAID (preceding message, last 3000 chars):\n---\n${claudeContext}\n---\n\nLANCE SAID:\n---\n${lanceContent}\n---\n\nClassify this exchange.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "decision_extraction",
          strict: true,
          schema: EXTRACTION_SCHEMA,
        },
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { error: `OpenAI ${resp.status}: ${err.slice(0, 200)}` };
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  try {
    return { ok: true, parsed: JSON.parse(raw), usage: data.usage };
  } catch (e) {
    return { error: `JSON parse failed: ${raw.slice(0, 200)}` };
  }
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------

function pairUserMessages(messages) {
  // Return [{ claudeContext, lanceMessage, lanceTimestamp, lanceUuid }, ...]
  const pairs = [];
  let lastAssistant = "";
  for (const m of messages) {
    if (m.role === "assistant") {
      lastAssistant = m.text;
    } else if (m.role === "user") {
      pairs.push({
        claudeContext: lastAssistant,
        lanceMessage: m.text,
        lanceTimestamp: m.timestamp,
        lanceUuid: m.uuid,
      });
    }
  }
  return pairs;
}

async function processFile(filepath, sqlOutPath, processedPairs) {
  const sessionId = basename(filepath, ".jsonl");
  console.log(`\n=== Session ${sessionId} ===`);
  console.log(`File: ${filepath}`);

  // Per-pair skip: look up which lance_uuids in this session are already
  // in lance_decisions. Pairs in this set are skipped at zero token cost.
  const sessionDoneUuids = processedPairs?.get(sessionId) || new Set();

  const messages = parseSession(filepath);
  console.log(`Parsed ${messages.length} messages`);

  let pairs = pairUserMessages(messages);
  console.log(`Found ${pairs.length} Lance messages`);
  if (sessionDoneUuids.size > 0) {
    console.log(`[skip-done] ${sessionDoneUuids.size} pair(s) already indexed in this session; will skip those.`);
  }

  if (LIMIT) {
    pairs = pairs.slice(0, LIMIT);
    console.log(`Limited to first ${LIMIT}`);
  }

  if (pairs.length === 0) return { processed: 0, decisions: 0 };

  let decisions = 0;
  let processed = 0;
  let skippedAlreadyIndexed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let pairIndex = -1;

  for (const p of pairs) {
    pairIndex++;
    // Per-pair skip: zero token cost for already-indexed pairs.
    if (p.lanceUuid && sessionDoneUuids.has(p.lanceUuid)) {
      skippedAlreadyIndexed++;
      continue;
    }
    // Skip messages that look like pasted terminal output (very long, no question)
    if (!p.claudeContext) continue;
    if (p.lanceMessage.length > 4000) {
      // Very long Lance messages are almost always pasted terminal output, not decisions.
      // Skip them to save tokens.
      processed++;
      continue;
    }

    const result = await extractDecision(p.claudeContext, p.lanceMessage);
    processed++;

    if (result.error) {
      console.log(`  [error] ${result.error}`);
      continue;
    }

    if (result.usage) {
      totalInputTokens += result.usage.prompt_tokens ?? 0;
      totalOutputTokens += result.usage.completion_tokens ?? 0;
    }

    const r = result.parsed;
    if (r.is_decision) {
      decisions++;
      const kindEmoji = r.decision_kind === "approval" ? "✓"
        : r.decision_kind === "rejection" ? "✗"
        : r.decision_kind === "option_pick" ? "→"
        : r.decision_kind === "direction" ? "▶"
        : r.decision_kind === "pushback" ? "⤳"
        : "?";
      const preview = r.summary.slice(0, 100);
      const choice = r.extracted_choice ? ` [${r.extracted_choice.slice(0, 60)}]` : "";
      console.log(`  ${kindEmoji} ${r.decision_kind}${choice}: ${preview}`);
      if (r.reasoning_if_any) {
        console.log(`    reasoning: ${r.reasoning_if_any.slice(0, 150)}`);
      }

      if (sqlOutPath) {
        const note = (r.reasoning_if_any || "").replace(/'/g, "''");
        const summary = (r.summary || "").replace(/'/g, "''");
        const choiceClean = (r.extracted_choice || "").replace(/'/g, "''");
        const metadata = JSON.stringify({
          source: "decision_indexer",
          session_id: sessionId,
          summary: r.summary,
          extracted_choice: r.extracted_choice,
          claude_context_preview: p.claudeContext.slice(-200),
          lance_uuid: p.lanceUuid,
        }).replace(/'/g, "''");
        const ts = p.lanceTimestamp ? Math.floor(new Date(p.lanceTimestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);
        const artifactId = stableId(sessionId, p.lanceUuid, pairIndex);
        const stmt = `INSERT OR IGNORE INTO lance_decisions (artifact_type, artifact_id, decision_kind, prior_state, new_state, note, metadata, user_id, created_at) VALUES ('conversation_decision', ${artifactId}, '${r.decision_kind}', NULL, '${choiceClean.slice(0, 200)}', '${(note || summary).slice(0, 1500)}', '${metadata.slice(0, 1900)}', 2, ${ts});\n`;
        appendFileSync(sqlOutPath, stmt, "utf8");
      }
    }
  }

  const cost = (totalInputTokens * 0.15 / 1_000_000) + (totalOutputTokens * 0.60 / 1_000_000);
  const skipNote = skippedAlreadyIndexed > 0 ? ` (skipped ${skippedAlreadyIndexed} already-indexed pairs at zero cost)` : "";
  console.log(`Processed ${processed} pairs, found ${decisions} decisions${skipNote}. Tokens: in=${totalInputTokens}, out=${totalOutputTokens}, cost=$${cost.toFixed(4)}`);

  return { processed, decisions, skippedAlreadyIndexed, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Initialize the SQL output file fresh at the start of each run. Subsequent
// writes happen statement-by-statement via appendFileSync inside processFile,
// so a mid-run Ctrl-C / network error / rate limit only loses the in-flight
// decision (~1 pair), not the whole run.
if (SQL_OUT) {
  writeFileSync(SQL_OUT, "", "utf8");
  console.log(`SQL output streaming to ${SQL_OUT} (one INSERT per line as decisions are extracted).`);
}

const processedPairs = SKIP_DONE ? fetchProcessedPairKeys() : null;

if (FILE) {
  await processFile(FILE, SQL_OUT, processedPairs);
} else if (ALL) {
  const files = readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => join(SESSIONS_DIR, f))
    .sort((a, b) => statSync(a).size - statSync(b).size);  // smallest first to fail-fast

  console.log(`Found ${files.length} session files. Smallest first.`);
  let totalDecisions = 0;
  let totalProcessed = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalSkipped = 0;
  for (const f of files) {
    const r = await processFile(f, SQL_OUT, processedPairs);
    if (r.skipped) totalSkipped++;
    totalDecisions += r.decisions || 0;
    totalProcessed += r.processed || 0;
    totalInput += r.inputTokens || 0;
    totalOutput += r.outputTokens || 0;
  }
  const totalCost = (totalInput * 0.15 / 1_000_000) + (totalOutput * 0.60 / 1_000_000);
  console.log(`\n=== TOTAL ===\nProcessed ${totalProcessed} pairs, found ${totalDecisions} decisions across ${files.length - totalSkipped} files (${totalSkipped} skipped). Total cost: $${totalCost.toFixed(2)}`);
}

if (SQL_OUT && existsSync(SQL_OUT)) {
  const sqlText = readFileSync(SQL_OUT, "utf8");
  const stmtCount = sqlText.split("\n").filter(l => l.startsWith("INSERT")).length;
  console.log(`\nWrote ${stmtCount} INSERT statements to ${SQL_OUT}`);
  console.log(`Apply with: npx wrangler d1 execute neverranked-app --remote --file=${SQL_OUT}`);
}
