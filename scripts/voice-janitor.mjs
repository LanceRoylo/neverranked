#!/usr/bin/env node
/**
 * Voice janitor. Phase 4 automation.
 *
 * Walks content/ and scans every markdown file for Hello Momentum
 * brand voice violations. Two classes of action:
 *
 *   1. Auto-fix (safe, mechanical): em dashes -> double hyphens,
 *      smart quotes -> straight quotes, unicode ellipsis -> three dots.
 *      Rewrites the file in place. Always applied unless --dry-run.
 *
 *   2. Flag (judgment call, do not fix): banned words ("leverage",
 *      "unlock", etc.), AI tells ("Welcome to...", "Nestled in...",
 *      "Hidden gem"), semicolons in marketing copy. These need Lance's
 *      eyes -- the janitor prints a report but never edits.
 *
 * Code blocks (between triple backticks) and URLs are EXCLUDED from
 * all substitutions and flag checks. This is content prose only.
 *
 * Usage:
 *   node scripts/voice-janitor.mjs              # dry-run (default; prints report, makes no edits)
 *   node scripts/voice-janitor.mjs --fix        # apply safe auto-fixes, write to disk
 *   node scripts/voice-janitor.mjs --strict     # exit nonzero if ANY judgment flags exist
 *
 * CI usage: see .github/workflows/voice-janitor.yml. The workflow runs
 * with --fix, commits any auto-fixes back to the repo via the
 * neverranked-bot account, and opens a GitHub issue if --strict would
 * have failed (judgment flags present).
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = join(ROOT, "content");

const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const STRICT = args.includes("--strict");

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Skip these subdirectories entirely. They're internal docs, machine
// logs, or technical specs where brand voice rules don't apply.
const SKIP_DIRS = new Set([
  "handoff-questions",
  "autonomy-log",
  "design",
  "audits",            // internal client audit reports
  "leaderboards",      // generated content
  "prompt-corpus",     // LLM prompt source; banned words appear as literal examples
  "meeting-evidence",  // internal meeting prep, not customer-facing
  "compliance-schema", // internal schema spec docs; "leverage" used analytically
]);

// Files to skip by name (allow-list of internal docs that aren't
// customer-facing). Note: strategy/email-*.md stays IN scope -- those
// are real customer email copy. Only internal planning docs are listed.
const SKIP_FILES = new Set([
  "MEMORY.md",
  "operating-principles.md",
  "template.md",                       // blog template; lists banned words as the rule
  "triggered-builds.md",               // internal build notes
  "launch-post-v2.md",                 // meta-discussion of cliche avoidance
  "phase-1-5-qa-auditor-scope.md",     // internal scope spec; quotes banned words
  "hn-submission-mcp-launch.md",       // internal launch planning, not marketing copy
  "linkedin-citation-tape-launch.md",  // internal posting playbook, not the post itself
  "asb-mvnp-meeting-prep.md",          // internal meeting prep + its own voice-rule reminder
  "README.md",                         // blog system rule docs list banned words literally
  "qa-checklist.md",                   // blog QA rule doc; lists banned words as the rule
]);

// SAFE AUTO-FIX SUBSTITUTIONS. These rewrite the file. Applied only in
// prose regions (outside fenced code blocks and outside URLs).
//
// Each entry: { pattern, replacement, name }
const AUTO_FIXES = [
  { name: "em_dash", pattern: /—/g, replacement: "--" },         // — to --
  { name: "smart_quote_left", pattern: /“/g, replacement: '"' }, // " to "
  { name: "smart_quote_right", pattern: /”/g, replacement: '"' },// " to "
  { name: "smart_apost_left", pattern: /‘/g, replacement: "'" }, // ' to '
  { name: "smart_apost_right", pattern: /’/g, replacement: "'" },// ' to '
  { name: "unicode_ellipsis", pattern: /…/g, replacement: "..." },// … to ...
];

// JUDGMENT-CALL FLAGS. The janitor reports these but never fixes them.
// They require Lance to evaluate context -- some are legitimate in
// some contexts (e.g. "leverage" is OK as a noun in finance, not as a
// verb in marketing copy).
const BANNED_WORDS = [
  "leverage",
  "unlock",
  "seamless",
  "seamlessly",
  "effortless",
  "effortlessly",
  "cutting-edge",
  "synergy",
  "synergies",
  "bandwidth",
  "circle back",
  "touch base",
  "moving forward",
  "at the end of the day",
  "hidden gem",
  "rare opportunity",
];

const AI_TELL_PHRASES = [
  /^Welcome to /i,
  /^Nestled in /i,
  /Discover the /i,
  /a journey of /i,
  /in the heart of /i,
];

// Marketing-copy paths get the semicolon flag. Internal docs are
// allowed to use semicolons (technical accuracy > voice purity there).
const MARKETING_PATH_PATTERNS = [
  /^content\/blog\//,
  /^content\/strategy\/email-/,
  /^content\/strategy\/linkedin-/,
  /^content\/strategy\/hn-/,
  /^content\/strategy\/instagram-/,
  /^content\/social-posts/,
  /^content\/launch-post/,
];

function isMarketingPath(relPath) {
  return MARKETING_PATH_PATTERNS.some(p => p.test(relPath));
}

// ---------------------------------------------------------------------------
// Region-aware scanning
// ---------------------------------------------------------------------------

/**
 * Given a markdown source string, return an array of {text, isProse,
 * lineOffset} segments. Prose segments are eligible for fixes and
 * flags. Non-prose (code blocks, URLs) are passed through unchanged.
 *
 * This is intentionally simple (no full markdown parser). We track:
 *   - Fenced code blocks (``` ... ```)
 *   - Inline code spans (`...`)
 *   - URLs (http://, https://, or markdown links)
 *
 * Anything else is prose.
 */
function splitIntoSegments(source) {
  const segments = [];
  const lines = source.split("\n");
  let inFence = false;
  let buffer = "";
  let bufferIsProse = true;

  function flush() {
    if (buffer.length > 0) {
      segments.push({ text: buffer, isProse: bufferIsProse });
      buffer = "";
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Fence detection
    if (/^\s*```/.test(line)) {
      // Flush whatever was accumulating
      if (bufferIsProse !== !inFence) {
        // about to switch -- flush
      }
      // Toggle fence state. The fence line itself + the body get
      // treated as non-prose.
      if (inFence) {
        // closing fence: append this line then flush as non-prose
        if (bufferIsProse) flush();
        bufferIsProse = false;
        buffer += line + (i < lines.length - 1 ? "\n" : "");
        flush();
        inFence = false;
        bufferIsProse = true;
        continue;
      } else {
        // opening fence: flush prose buffer, start non-prose
        if (bufferIsProse && buffer.length > 0) flush();
        inFence = true;
        bufferIsProse = false;
        buffer += line + (i < lines.length - 1 ? "\n" : "");
        continue;
      }
    }
    if (inFence) {
      buffer += line + (i < lines.length - 1 ? "\n" : "");
      continue;
    }
    // Prose line: scan for inline code and URLs and split inline
    // For simplicity, we treat the whole line as prose but apply
    // sub-segmenting within the prose-fix step.
    if (!bufferIsProse) {
      flush();
      bufferIsProse = true;
    }
    buffer += line + (i < lines.length - 1 ? "\n" : "");
  }
  flush();
  return segments;
}

/**
 * Within a prose segment, apply AUTO_FIXES outside inline code spans
 * and URLs. Returns {transformed, fixesApplied}.
 */
function applyAutoFixesToProse(prose) {
  // Split into prose subspans, code subspans, url subspans.
  // Inline code: `...`
  // URL: https?://[^\s)]+
  // We rebuild the prose by token type.
  const tokens = [];
  let i = 0;
  while (i < prose.length) {
    if (prose[i] === "`") {
      // inline code: find next `
      const end = prose.indexOf("`", i + 1);
      if (end === -1) {
        // unmatched backtick, treat rest as prose
        tokens.push({ kind: "prose", text: prose.slice(i) });
        i = prose.length;
      } else {
        tokens.push({ kind: "code", text: prose.slice(i, end + 1) });
        i = end + 1;
      }
      continue;
    }
    // URL check at this position
    const urlMatch = prose.slice(i).match(/^https?:\/\/[^\s)]+/);
    if (urlMatch) {
      tokens.push({ kind: "url", text: urlMatch[0] });
      i += urlMatch[0].length;
      continue;
    }
    // Otherwise accumulate prose until next backtick or URL start
    let j = i;
    while (j < prose.length) {
      if (prose[j] === "`") break;
      if (prose.slice(j).match(/^https?:\/\//)) break;
      j++;
    }
    tokens.push({ kind: "prose", text: prose.slice(i, j) });
    i = j;
  }

  const fixesApplied = {};
  for (const t of tokens) {
    if (t.kind !== "prose") continue;
    for (const fix of AUTO_FIXES) {
      const matches = t.text.match(fix.pattern);
      if (matches) {
        fixesApplied[fix.name] = (fixesApplied[fix.name] ?? 0) + matches.length;
        t.text = t.text.replace(fix.pattern, fix.replacement);
      }
    }
  }

  return {
    transformed: tokens.map(t => t.text).join(""),
    fixesApplied,
  };
}

/**
 * Scan a prose segment for judgment-call flags. Returns an array of
 * flag objects {kind, snippet, line}.
 */
function findFlags(prose, relPath, baseLine) {
  const flags = [];
  const lines = prose.split("\n");
  const isMarketing = isMarketingPath(relPath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = baseLine + i;

    // Skip code spans inline
    const cleanLine = line.replace(/`[^`]*`/g, "").replace(/https?:\/\/[^\s)]+/g, "");
    const lowerLine = cleanLine.toLowerCase();

    // Meta-reference filter: if the line is talking ABOUT banned words
    // (rules docs, voice-quickref, checklists, "do not use" lines),
    // skip banned-word flagging. The line says the word to call it out,
    // not to use it.
    const isMetaReference = /\b(banned|don'?t use|avoid|never use|no\s+banned|brand[- ]voice\s+rule|voice\s+rule|voice\s+violation|skip\s+these|rules?\s+say)\b/i.test(lowerLine);

    // Banned words
    if (!isMetaReference) {
      for (const word of BANNED_WORDS) {
        // Word boundary check
        const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (re.test(lowerLine)) {
          flags.push({
            kind: "banned_word",
            word,
            line: lineNum,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }

    // AI tells
    for (const tell of AI_TELL_PHRASES) {
      if (tell.test(cleanLine)) {
        flags.push({
          kind: "ai_tell",
          line: lineNum,
          snippet: line.trim().slice(0, 120),
        });
      }
    }

    // Semicolons in marketing copy. Allow them in code/non-marketing.
    if (isMarketing && /;/.test(cleanLine)) {
      flags.push({
        kind: "semicolon_in_marketing",
        line: lineNum,
        snippet: line.trim().slice(0, 120),
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walkMarkdown(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walkMarkdown(full, out);
    } else if (s.isFile() && extname(name) === ".md" && !SKIP_FILES.has(name)) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------

function processFile(fullPath) {
  const relPath = relative(ROOT, fullPath);
  const original = readFileSync(fullPath, "utf8");
  const segments = splitIntoSegments(original);

  const fixesApplied = {};
  let lineCursor = 1;
  const flags = [];
  const rebuilt = [];

  for (const seg of segments) {
    if (seg.isProse) {
      const { transformed, fixesApplied: localFixes } = applyAutoFixesToProse(seg.text);
      for (const [k, v] of Object.entries(localFixes)) {
        fixesApplied[k] = (fixesApplied[k] ?? 0) + v;
      }
      const localFlags = findFlags(transformed, relPath, lineCursor);
      flags.push(...localFlags);
      rebuilt.push(transformed);
      // Advance line cursor by number of newlines in the original (so
      // line numbers in flags map back to the file)
      lineCursor += (seg.text.match(/\n/g) || []).length;
    } else {
      rebuilt.push(seg.text);
      lineCursor += (seg.text.match(/\n/g) || []).length;
    }
  }

  const transformed = rebuilt.join("");
  const changed = transformed !== original;
  const totalFixes = Object.values(fixesApplied).reduce((a, b) => a + b, 0);

  return { relPath, original, transformed, changed, fixesApplied, totalFixes, flags };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allFiles = walkMarkdown(CONTENT_DIR);
const allReports = [];
let filesWithFixes = 0;
let filesWithFlags = 0;
let totalFixesAcross = 0;
let totalFlagsAcross = 0;

for (const file of allFiles) {
  const report = processFile(file);
  allReports.push(report);
  if (report.changed) filesWithFixes++;
  if (report.flags.length > 0) filesWithFlags++;
  totalFixesAcross += report.totalFixes;
  totalFlagsAcross += report.flags.length;

  // Apply fix if --fix
  if (FIX && report.changed) {
    writeFileSync(file, report.transformed, "utf8");
  }
}

// Print report
console.log(`Voice janitor scan complete.`);
console.log(`Scanned ${allFiles.length} markdown files in content/.`);
console.log(``);
console.log(`Auto-fixes (mechanical, ${FIX ? "applied" : "would apply with --fix"}): ${totalFixesAcross} across ${filesWithFixes} files`);
console.log(`Judgment flags (require Lance's review): ${totalFlagsAcross} across ${filesWithFlags} files`);
console.log(``);

if (filesWithFixes > 0) {
  console.log(`=== Auto-fixes ===`);
  for (const r of allReports) {
    if (!r.changed) continue;
    const summary = Object.entries(r.fixesApplied).map(([k, v]) => `${k}=${v}`).join(", ");
    console.log(`  ${r.relPath}  (${summary})`);
  }
  console.log(``);
}

if (filesWithFlags > 0) {
  console.log(`=== Judgment flags (not auto-fixed) ===`);
  for (const r of allReports) {
    if (r.flags.length === 0) continue;
    console.log(`  ${r.relPath}`);
    for (const f of r.flags.slice(0, 20)) {
      console.log(`    line ${f.line}  [${f.kind}${f.word ? `:${f.word}` : ""}]  ${f.snippet}`);
    }
    if (r.flags.length > 20) {
      console.log(`    ... and ${r.flags.length - 20} more`);
    }
  }
  console.log(``);
}

if (!FIX && filesWithFixes > 0) {
  console.log(`Run again with --fix to apply the auto-fixes above.`);
}

// Strict mode: exit nonzero if any judgment flags exist (CI uses this
// to open an issue).
if (STRICT && totalFlagsAcross > 0) {
  console.error(`STRICT mode: ${totalFlagsAcross} judgment flag(s) found. Exit 1.`);
  process.exit(1);
}

process.exit(0);
