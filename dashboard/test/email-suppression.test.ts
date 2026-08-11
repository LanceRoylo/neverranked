/**
 * A paused send must never be recorded as a delivery.
 *
 * EMAIL_GLOBAL_PAUSE returns synthetic success so callers do not retry
 * or alarm. That is correct for control flow and dangerous for
 * BOOKKEEPING: a caller that reads ok:true and writes "queued" has just
 * created evidence that an email arrived when nothing left the building.
 *
 * This is not hypothetical. On 2026-08-10 the paid digest logged a
 * suppressed send as 'queued', which greened the email_log/digest
 * heartbeat -- the monitor whose only job is proving clients got mail.
 * The free-tier path had the identical bug, unfired only because
 * free_users was empty.
 *
 * These are source-shape assertions rather than integration tests
 * because the failure mode is a future edit re-introducing a naive
 * "ok means sent" log, and that is visible in the source. Each assertion
 * is anchored on the RULE (a suppressed branch exists and precedes the
 * queued write), not on wording, so rephrasing a log message does not
 * break the test while deleting the guard does.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const src = (...p: string[]) => readFileSync(join(HERE, "..", "src", ...p), "utf8");

/** The body of a named async function, up to the next top-level export. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} not found -- was it renamed?`);
  const rest = source.slice(start + 1);
  const nextExport = rest.indexOf("\nexport ");
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

test("the preflight sender reports suppression as a named field, not a magic string", () => {
  const preflight = src("lib", "qa-email-preflight.ts");
  const pauseBranch = preflight.slice(
    preflight.indexOf("EMAIL_GLOBAL_PAUSE"),
    preflight.indexOf("RESEND_API_KEY"),
  );
  assert.match(
    pauseBranch,
    /suppressed:\s*true/,
    "the pause branch must return suppressed:true so callers can tell a swallowed send from a real one",
  );
  assert.match(
    preflight,
    /suppressed\?:\s*boolean/,
    "suppressed must be on the declared return type, or callers cannot read it in TypeScript",
  );
});

test("the free weekly digest records a suppressed send as suppressed, never as queued", () => {
  const body = functionBody(src("email.ts"), "sendFreeWeeklyDigestEmail");

  const suppressedCheck = body.indexOf("result.suppressed");
  const queuedLog = body.indexOf(`status: "queued"`);

  assert.notEqual(suppressedCheck, -1, "no result.suppressed branch: a paused send would log as delivered");
  assert.notEqual(queuedLog, -1, "expected a queued log for the real-delivery case");
  assert.ok(
    suppressedCheck < queuedLog,
    "the suppressed branch must come BEFORE the queued write, otherwise the queued write is reachable while paused",
  );
  assert.match(
    body.slice(suppressedCheck, queuedLog),
    /status:\s*"suppressed"/,
    "the suppressed branch must write status 'suppressed' to the delivery log",
  );
});

test("free-tier digest rows are not filed as client digest rows", () => {
  const source = src("email.ts");
  const body = functionBody(source, "sendFreeWeeklyDigestEmail");

  assert.doesNotMatch(
    body,
    /type:\s*"digest"/,
    "free-tier sends must not log type='digest' -- the Monday reconcile and the " +
      "email_log/digest heartbeat read that type as evidence about PAID client delivery",
  );
  assert.match(
    source,
    /FREE_DIGEST_LOG_TYPE\s*=\s*"free_digest"/,
    "the free-tier delivery type constant is missing or renamed",
  );
});

test("the paid digest still records pause-suppressed sends as suppressed", () => {
  const body = functionBody(src("email.ts"), "sendDigestEmail");
  const headerCheck = body.indexOf("x-email-suppressed");
  assert.notEqual(headerCheck, -1, "the paid path detects suppression via the response header");
  assert.match(
    body.slice(headerCheck, headerCheck + 400),
    /status:\s*"suppressed"/,
    "the paid path must log 'suppressed', not 'queued' -- this regressed once already",
  );
});

test("admin test sends are logged under their own type", () => {
  const source = src("email.ts");
  assert.match(
    source,
    /logType:\s*"digest"\s*\|\s*"digest_test"/,
    "sendDigestEmail must accept a delivery-log type so admin tests stay out of client delivery evidence",
  );
  const route = src("routes", "admin-email-test.ts");
  assert.match(route, /"digest_test"/, "the admin tool must pass digest_test");
});

test("the founder weekly summary does not report a swallowed send as delivered", () => {
  const summary = src("lib", "weekly-summary-email.ts");
  assert.match(
    summary,
    /result\.suppressed/,
    "weekly summary must branch on suppressed, or its cron row claims delivery every paused Monday",
  );
  assert.match(summary, /suppressed\?:\s*boolean/, "suppressed must be on the returned shape");
});
