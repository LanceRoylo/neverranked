/**
 * Migration safety guardrail.
 *
 * Why this exists: a drifted d1_migrations ledger caused
 * `wrangler d1 migrations apply` to re-run 0073, whose
 * `CREATE INDEX` had no `IF NOT EXISTS`. That single non-idempotent
 * statement turned a recoverable bookkeeping blip into a weeks-long
 * production deploy outage (every deploy died there, silently).
 *
 * This test makes that class of failure impossible to reintroduce:
 * every NEW migration must be idempotent, and migration numbers must
 * be unique. Historical migrations (<= BASELINE) are grandfathered
 * on purpose -- they are already applied in prod and recorded in the
 * ledger; rewriting or renaming an applied migration to satisfy a
 * linter is exactly the kind of retro-edit that causes incidents.
 * The goal is forward safety, not history rewriting.
 *
 * Runs in the dashboard test job (test.yml) -- the reliable lane
 * that has always been green -- not the deploy pipeline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Highest migration number that existed when this guardrail landed.
// Files at or below this are grandfathered (already applied in prod).
// Every migration ABOVE this must satisfy the rules below.
const BASELINE = 95;

// Known historical duplicate migration number. Documented and frozen:
// both 0079_* files are already applied in prod under their own
// names; renaming either would make wrangler treat it as a new
// pending migration. New duplicates are NOT allowed.
const DUPLICATE_NUMBER_ALLOWLIST = new Set(["0079"]);

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

test("migration numbers are unique (except documented history)", () => {
  const byNumber = new Map<string, string[]>();
  for (const f of files) {
    const m = f.match(/^(\d{4})_/);
    if (!m) continue;
    const arr = byNumber.get(m[1]) ?? [];
    arr.push(f);
    byNumber.set(m[1], arr);
  }
  const offenders = [...byNumber.entries()]
    .filter(([num, fs]) => fs.length > 1 && !DUPLICATE_NUMBER_ALLOWLIST.has(num))
    .map(([num, fs]) => `${num}: ${fs.join(", ")}`);
  assert.deepEqual(
    offenders,
    [],
    `Duplicate migration numbers (rename to the next free number BEFORE it is applied):\n${offenders.join("\n")}`,
  );
});

test("new migrations are idempotent (CREATE ... IF NOT EXISTS)", () => {
  // Matches CREATE TABLE/INDEX/TRIGGER/VIEW and UNIQUE INDEX, allowing
  // "CREATE UNIQUE INDEX". Flags any such statement lacking the
  // IF NOT EXISTS guard so a re-apply can never hard-fail the way
  // 0073 did.
  const createRe = /\bCREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER|VIEW)\b/i;
  const guardRe = /IF\s+NOT\s+EXISTS/i;
  const offenders: string[] = [];

  for (const f of files) {
    const m = f.match(/^(\d{4})_/);
    if (!m) continue;
    if (Number(m[1]) <= BASELINE) continue; // grandfathered history
    const sql = readFileSync(`${migrationsDir}/${f}`, "utf8");
    // Strip line + block comments so a commented example never trips it.
    const stripped = sql
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const stmt of stripped.split(";")) {
      const cm = stmt.match(createRe);
      if (cm && !guardRe.test(stmt)) {
        offenders.push(`${f}: CREATE ${cm[1].toUpperCase()} without IF NOT EXISTS`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Non-idempotent DDL in new migrations (add IF NOT EXISTS):\n${offenders.join("\n")}`,
  );
});
