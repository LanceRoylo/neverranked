/* The resolver exists because a business is not a domain string.
 * Every case here is a real row measured on prince-waikiki, 2026-09-23. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIdentitySet, identifyEntity, identifyEntities, nameRegex, normHost } from "../src/lib/client-identity";

const PRINCE = buildIdentitySet("prince-waikiki", [
  { kind: "domain", value: "princewaikiki.com", status: "canonical" },
  { kind: "domain", value: "hawaiiprincehotel.com", status: "legacy" },
  { kind: "domain", value: "princehotel.com", status: "legacy" },
  { kind: "domain", value: "princeville.com", status: "deny" },
  { kind: "domain", value: "hawaiiprincegolf.com", status: "deny" },
  { kind: "domain", value: "princewaikiki.honoluluhhotel.com", status: "deny" },
  { kind: "name", value: "Prince Waikiki", status: "canonical" },
  { kind: "name", value: "Hawaii Prince Hotel Waikiki", status: "legacy" },
  { kind: "name", value: "Hawaii Prince Hotel", status: "legacy" },
  { kind: "name", value: "Princeville", status: "deny" },
  { kind: "name", value: "Princeville Resort Kauai", status: "deny" },
]);

test("the current identity resolves as owned and live", () => {
  const v = identifyEntity({ name: "Prince Waikiki", url: "https://www.princewaikiki.com/" }, PRINCE);
  assert.equal(v.named, true); assert.equal(v.owned, true); assert.equal(v.stale, false);
});

test("Claude naming the hotel by its pre-rebrand name is a match, and a stale one", () => {
  // Measured: the single Claude mention in 702 runs, scored as absence.
  const v = identifyEntity({ name: "Hawaii Prince Hotel Waikiki", url: "https://www.hawaiiprincehotel.com/" }, PRINCE);
  assert.equal(v.named, true); assert.equal(v.stale, true); assert.equal(v.via, "Hawaii Prince Hotel Waikiki");
});

test("Gemma's current name on the parent-company domain is live, not stale", () => {
  // 52 of Gemma's 57 mentions. The name is current; only the URL is old.
  const v = identifyEntity({ name: "Prince Waikiki", url: "https://www.princehotel.com/waikiki/" }, PRINCE);
  assert.equal(v.named, true); assert.equal(v.owned, true); assert.equal(v.stale, false);
});

test("Princeville on Kauai is never this client", () => {
  for (const ent of [
    { name: "Princeville Resort Kauai", url: "https://www.princeville.com" },
    { name: "The Makai Club at Princeville", url: "https://www.princeville.com/" },
  ]) {
    const v = identifyEntity(ent, PRINCE);
    assert.equal(v.named, false, `${ent.name} must not match`);
  }
});

test("a naive substring match would have failed these, which is why they are tested", () => {
  assert.equal(/prince/i.test("Princeville Resort Kauai"), true);
  assert.equal(identifyEntity({ name: "Princeville Resort Kauai" }, PRINCE).named, false);
});

test("the affiliated golf club is denied, as a declared decision", () => {
  const v = identifyEntity({ name: "Hawaii Prince Golf Club", url: "https://www.hawaiiprincegolf.com/about/" }, PRINCE);
  assert.equal(v.named, false);
});

test("an aggregator subdomain carrying the client name is not an owned citation", () => {
  const v = identifyEntity({ name: "Prince Waikiki", url: "https://princewaikiki.honoluluhhotel.com/en/" }, PRINCE);
  assert.equal(v.named, false);
});

test("deny wins even when the name would otherwise match", () => {
  const v = identifyEntity({ name: "Prince Waikiki", url: "https://www.princeville.com/" }, PRINCE);
  assert.equal(v.named, false);
});

test("the longer legacy name wins over its own substring", () => {
  const v = identifyEntity({ name: "Hawaii Prince Hotel Waikiki" }, PRINCE);
  assert.equal(v.via, "Hawaii Prince Hotel Waikiki");
});

test("a competitor is simply a miss", () => {
  for (const n of ["Halekulani", "The Royal Hawaiian", "Outrigger Waikiki Beach Resort", "Moana Surfrider"]) {
    assert.equal(identifyEntity({ name: n }, PRINCE).named, false, n);
  }
});

test("across one answer, a live identity outranks a stale one", () => {
  const v = identifyEntities([
    { name: "Hawaii Prince Hotel Waikiki", url: "https://www.hawaiiprincehotel.com/" },
    { name: "Prince Waikiki", url: "https://www.princewaikiki.com/" },
  ], PRINCE);
  assert.equal(v.stale, false); assert.equal(v.owned, true);
});

test("an answer that only ever used the old identity stays stale", () => {
  const v = identifyEntities([
    { name: "Halekulani", url: "https://www.halekulani.com" },
    { name: "Hawaii Prince Hotel Waikiki", url: "https://www.hawaiiprincehotel.com/" },
  ], PRINCE);
  assert.equal(v.named, true); assert.equal(v.stale, true);
});

test("a malformed URL does not throw and falls back to the name", () => {
  // Measured: Claude emitted "https://www.moana surf rider.com" with spaces.
  const v = identifyEntity({ name: "Prince Waikiki", url: "https://www.prince waikiki.com" }, PRINCE);
  assert.equal(v.named, true);
});

test("host normalisation is stable", () => {
  assert.equal(normHost("WWW.PrinceWaikiki.com."), "princewaikiki.com");
});

test("name matching is case and spacing tolerant but not boundary tolerant", () => {
  assert.equal(nameRegex("Prince Waikiki").test("stay at prince  waikiki tonight"), true);
  assert.equal(nameRegex("Prince Waikiki").test("princewaikikihotel"), false);
});

test("an empty entity is a miss, not a crash", () => {
  assert.equal(identifyEntity({}, PRINCE).named, false);
  assert.equal(identifyEntities([], PRINCE).named, false);
});
