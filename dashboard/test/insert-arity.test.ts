import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Every INSERT must supply one value per column.
 *
 * On 2026-09-15 two new columns were added to all 14 citation_runs inserts.
 * The column NAMES went in and the bind arguments went in; the two matching
 * placeholders in VALUES did not. Eleven columns, nine values. SQLite rejects
 * that outright, so the next sweep would have written nothing at all, on every
 * engine, for every client.
 *
 * Nothing caught it, and nothing could. Typecheck does not parse SQL, the whole
 * suite passed because no test touches D1, and three deploys went green on top
 * of it. It was found by hand, hours before the sweep that would have gone
 * dark.
 *
 * This is that check, made permanent. It also validates placeholder count
 * against the bind() argument count, which is the other half of the same
 * mistake. */

const SRC = "src";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Return the contents of the parenthesised group starting at `open`, and the
 *  index just past its closing paren. Depth-aware so unixepoch() does not end
 *  the group early, which is a mistake this file's first draft made. */
function balanced(s: string, open: number): { inner: string; end: number } | null {
  if (s[open] !== "(") return null;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return { inner: s.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Strip // line comments. A bind list carrying `// ~$0.03/run, refined later`
 *  has a comma inside a comment, which split as an extra argument and made a
 *  correct statement look wrong. */
function stripLineComments(s: string): string {
  return s
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      if (i < 0) return l;
      // Not inside a string: count unescaped quotes before the marker.
      const before = l.slice(0, i);
      const odd = (q: string) => (before.split(q).length - 1) % 2 === 1;
      if (odd("'") || odd('"') || odd("`")) return l;
      return before;
    })
    .join("\n");
}

/** Split on top-level commas only. Quote-aware, because a description column
 *  containing "coverage, strategy, and signals" is one value, not three. */
function splitTop(raw: string): string[] {
  const s = stripLineComments(raw);
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote && s[i - 1] !== "\\") quote = null;
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

interface Insert {
  file: string;
  table: string;
  cols: string[];
  vals: string[];
  placeholders: number;
  binds: number | null;
}

function findInserts(file: string): Insert[] {
  const s = readFileSync(file, "utf8");
  const out: Insert[] = [];
  const head = /INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(\w+)\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = head.exec(s))) {
    const colOpen = s.indexOf("(", m.index + m[0].length);
    if (colOpen < 0) continue;
    const colGroup = balanced(s, colOpen);
    if (!colGroup) continue;
    const valsKeyword = /^\s*VALUES\s*/i.exec(s.slice(colGroup.end));
    if (!valsKeyword) continue; // INSERT ... SELECT has no VALUES list
    const valOpen = s.indexOf("(", colGroup.end + valsKeyword[0].length - 1);
    if (valOpen < 0) continue;
    const valGroup = balanced(s, valOpen);
    if (!valGroup) continue;

    const vals = splitTop(valGroup.inner);
    // Both placeholder spellings count: bare `?` and numbered `?1`, `?2`.
    // track-pitch.ts uses the numbered form, and counting only bare `?` scored
    // a correct 7-bind statement as having none.
    const placeholders = vals.filter((v) => /^\?\d*$/.test(v)).length;

    // Bind arity, when the call is the usual .bind(...) shape.
    //
    // The bind group is extracted by paren balance, NOT by searching for
    // ").run()". The first draft did the latter and matched a `).run()`
    // belonging to a statement further down the file, reporting things like
    // "5 placeholders vs 23 bind arguments". A checker that cries wolf gets
    // muted, which would have cost more than the bug it was written for.
    let binds: number | null = null;
    const bindAt = s.indexOf(".bind(", valGroup.end);
    if (bindAt > 0 && bindAt - valGroup.end < 200) {
      const bindGroup = balanced(s, bindAt + ".bind".length);
      if (bindGroup) binds = splitTop(bindGroup.inner).length;
    }

    out.push({
      file,
      table: m[1],
      cols: splitTop(colGroup.inner),
      vals,
      placeholders,
      binds,
    });
  }
  return out;
}

const ALL = walk(SRC).flatMap(findInserts);

test("the sweep actually finds the INSERT statements", () => {
  // A parser that silently matches nothing would make every test below pass.
  assert.ok(ALL.length > 100, `only found ${ALL.length} inserts, parser is probably broken`);
  assert.ok(ALL.some((i) => i.table === "citation_runs"), "citation_runs inserts not found");
});

test("every INSERT supplies one value per column", () => {
  const bad = ALL.filter((i) => i.cols.length !== i.vals.length)
    .map((i) => `${i.file} ${i.table}: ${i.cols.length} columns vs ${i.vals.length} values`);
  assert.deepEqual(bad, [], "Column and value counts disagree:\n" + bad.join("\n"));
});

test("every INSERT binds one argument per placeholder", () => {
  const bad = ALL.filter((i) => i.binds !== null && i.placeholders !== i.binds)
    .map((i) => `${i.file} ${i.table}: ${i.placeholders} placeholders vs ${i.binds} bind arguments`);
  assert.deepEqual(bad, [], "Placeholder and bind counts disagree:\n" + bad.join("\n"));
});

test("citation_runs, the one that broke, is checked on both axes", () => {
  const runs = ALL.filter((i) => i.table === "citation_runs");
  assert.ok(runs.length >= 14, `expected at least 14 citation_runs inserts, found ${runs.length}`);
  for (const i of runs) {
    assert.equal(i.cols.length, i.vals.length, `${i.file}: ${i.cols.length} cols vs ${i.vals.length} vals`);
    if (i.binds !== null) assert.equal(i.placeholders, i.binds, `${i.file}: ${i.placeholders} ? vs ${i.binds} binds`);
  }
});
