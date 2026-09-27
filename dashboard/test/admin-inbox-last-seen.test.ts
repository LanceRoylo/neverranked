/**
 * Every admin_inbox writer stamps last_seen_at, and every reader reports it.
 *
 * Two sweeps on 2026-09-27 found the same shape twice. First: addInboxItem
 * upserted without bumping any timestamp, so a check firing daily kept the
 * date of its first occurrence and two live problems read as 147 and 146 days
 * old. Second: adding last_seen_at to addInboxItem fixed nothing visible,
 * because two other files write admin_inbox with their own SQL and all three
 * render sites still printed `created_at` alone.
 *
 * These are source-shape assertions rather than behaviour tests on purpose.
 * The defect is always a writer or reader that was never wired up, which no
 * behavioural test of the wired ones can see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Matches the convention in migrations-guardrail.test.ts. import.meta.dirname
// is undefined once tsx compiles this to CJS.
const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const files = walk(SRC).map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

/** Every INSERT INTO admin_inbox statement, with its file, column list and body. */
function inboxInserts() {
  const out: { file: string; stmt: string }[] = [];
  for (const f of files) {
    // From "INSERT INTO admin_inbox" to the closing backtick of the template.
    for (const m of f.text.matchAll(/INSERT INTO admin_inbox[\s\S]*?`/g)) {
      out.push({ file: f.path.slice(SRC.length + 1), stmt: m[0] });
    }
  }
  return out;
}

test("every admin_inbox writer names last_seen_at", () => {
  const inserts = inboxInserts();
  // Guard the guard: if the regex stops matching, this test silently passes.
  assert.ok(inserts.length >= 7, `expected to find the known writers, found ${inserts.length}`);

  const missing = inserts.filter((i) => !/last_seen_at/.test(i.stmt));
  assert.deepEqual(
    missing.map((m) => m.file),
    [],
    "these writers insert into admin_inbox without stamping last_seen_at; a row " +
      "they create reads as NULL and its age falls back to first-seen forever",
  );
});

test("an upserting admin_inbox writer refreshes last_seen_at in DO UPDATE", () => {
  // created_at must NOT be in the DO UPDATE (it is when the problem started);
  // last_seen_at must be (it is whether the problem is still happening).
  const upserts = inboxInserts().filter((i) => /ON CONFLICT/.test(i.stmt));
  assert.ok(upserts.length >= 3, `expected the known upserting writers, found ${upserts.length}`);

  for (const u of upserts) {
    const doUpdate = u.stmt.slice(u.stmt.indexOf("DO UPDATE"));
    assert.match(
      doUpdate,
      /last_seen_at\s*=\s*excluded\.last_seen_at/,
      `${u.file}: upserts admin_inbox but never refreshes last_seen_at, so a ` +
        `re-fire keeps the original date and the item reads as stale`,
    );
    assert.doesNotMatch(
      doUpdate,
      /created_at\s*=/,
      `${u.file}: bumps created_at on re-fire, which erases how long the ` +
        `problem has gone unfixed`,
    );
  }
});

test("no admin_inbox writer uses a status no reader matches", () => {
  // 'open' was written by both checkout signup paths. getPendingInbox selects
  // pending/snoozed, getResolvedInbox selects approved/rejected/resolved, and
  // the hub count and digest filter 'pending'. An 'open' row was in no list
  // and no count: the highest-value event in the system, invisible.
  const VALID = new Set(["pending", "approved", "rejected", "snoozed", "resolved"]);
  for (const i of inboxInserts()) {
    for (const m of i.stmt.matchAll(/'([a-z_]+)'\)?\s*`?\s*$|,\s*'([a-z]+)'\)/g)) {
      const v = m[1] ?? m[2];
      if (!v || !/^(pending|open|approved|rejected|snoozed|resolved|closed|new)$/.test(v)) continue;
      assert.ok(
        VALID.has(v),
        `${i.file}: writes admin_inbox status '${v}', which is not in the ` +
          `InboxStatus union and which no reader selects`,
      );
    }
  }
});

test("no inbox render site reports age from created_at alone", () => {
  // The three sites that printed `<age> old` from created_at: the list, the
  // detail page, and the digest email that actually reaches Lance.
  //
  // Scanning for the bad pattern naively matches two innocent things: this
  // rule quoted inside a comment, and inboxAge's own body, which reads
  // created_at because computing the first-seen age is its job. Both bit
  // earlier versions of this file. So: strip comment lines, strip the helper's
  // own body, then scan what is left.
  const RENDERS = ["admin-inbox.ts", join("routes", "admin-inbox.ts")];
  for (const rel of RENDERS) {
    const f = files.find((x) => x.path.endsWith(join("src", rel)));
    assert.ok(f, `render site ${rel} not found`);

    const lines = f!.text.split("\n");
    const start = lines.findIndex((l) => l.includes("export function inboxAge"));
    // The helper ends at the next line that is exactly a closing brace.
    const end = start === -1 ? -1 : lines.findIndex((l, i) => i > start && l === "}");
    const code = lines
      .filter((l, i) => !(start !== -1 && i >= start && i <= end))
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");

    assert.doesNotMatch(
      code,
      /fmtAge\(\s*now\s*-\s*\w+\.created_at\s*\)/,
      `${rel}: still ages an inbox item from created_at alone. Use inboxAge(), ` +
        `which reports last-fired too, or a recurring problem reads as ancient.`,
    );
    assert.match(
      code,
      /inboxAge\(/,
      `${rel}: renders inbox items but never calls inboxAge()`,
    );
  }
});
