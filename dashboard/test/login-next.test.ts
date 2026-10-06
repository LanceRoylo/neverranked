/* A client clicking their readout link while signed out used to land on the
 * dashboard home after signing in, not the readout. 2026-10-05. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { safeNextPath } from "../src/routes/login";
import { customerAuthLink } from "../src/lib/auth-link";

test("the readout path survives sign-in", () => {
  assert.equal(safeNextPath("/c/client-a/readouts/2026-09"), "/c/client-a/readouts/2026-09");
  const link = customerAuthLink("t".repeat(64), { next: "/c/client-a/readouts/2026-09" });
  assert.match(link, /^https:\/\/neverranked\.com\/signin\?token=t+&next=%2Fc%2Fclient-a%2Freadouts%2F2026-09$/);
});

test("nothing can redirect off the site", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil.example", "", null, undefined]) {
    assert.equal(safeNextPath(bad as string), null, String(bad));
  }
});

test("sign-in pages are never a destination, so no loop", () => {
  for (const p of ["/login", "/login?next=/x", "/auth/verify?token=x", "/logout"]) assert.equal(safeNextPath(p), null, p);
});

test("the signed-out redirect, the form and the email all carry it", () => {
  const idx = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(idx, /redirect\(method === "GET" && path !== "\/" \? `\/login\?next=\$\{encodeURIComponent\(path\)\}` : "\/login"\)/);
  const login = fs.readFileSync(new URL("../src/routes/login.ts", import.meta.url), "utf8");
  assert.match(login, /<input type="hidden" name="next" value="\$\{esc\(next\)\}">/);
  assert.match(login, /sendMagicLinkEmail\(email, token, env, agency, next\)/);
  const email = fs.readFileSync(new URL("../src/email.ts", import.meta.url), "utf8");
  assert.match(email, /customerAuthLink\(token, next \? \{ next \} : undefined\)/);
});
