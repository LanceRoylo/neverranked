import { test } from "node:test";
import assert from "node:assert";
import { gradeAtlasResponse } from "../src/lib/atlas-grader.ts";
import { ATLAS_SYSTEM_PROMPT, nextMemoDate, buildAtlasSystemPrompt } from "../src/lib/atlas-system-prompt.ts";

// ── Good data answers must PASS ──────────────────────────────
const GOOD = [
  "Perplexity cited Hawaii Theatre Center on 14 of your 19 questions last week.",
  "Your strongest engine is Gemma at 61.5 percent citation share. Bing is lowest at 1.6 percent.",
  "You rank first in your cohort. Blaisdell Center is second with 287 mentions to your 940.",
  "Three of your 20 questions never mention you: comedy show Honolulu, Honolulu nightlife shows, and event venue rental Honolulu.",
  "On the same day the new page went live, Perplexity started citing you on the film festivals question. That is correlation in the data, not a cause I can confirm.",
  "Nothing significant changed in the last 7 days. The data has been stable.",
];

// ── Punt templates must PASS (they contain advice-adjacent words) ──
const PUNTS = [
  "That's prioritization, which lives in your monthly memo. Your next memo arrives June 25, 2026. If you want this addressed before then, want me to flag it for Lance? Reply 'flag it' and I'll send him a note.",
  "That's a recommendation question, which requires judgment about your team's bandwidth and what's strategically important this month. The monthly memo handles that. Want me to flag this for Lance specifically?",
  "NeverRanked measures; we don't execute. Your team or your agency handles the work the memo points at. I can answer 'is the data showing X' but not 'should I do Y'. Want me to flag this for Lance to discuss approaches?",
  "That's outside what NeverRanked measures. We only measure AI citation share across 7 AI tools. For that topic, you'd want a different specialist or your team. If you want me to flag for Lance to recommend someone, reply 'flag it'.",
  "I don't have data on that. The measurement covers your locked question set, your registered cohort, and your 7-AI-tool history. Outside that, I don't have visibility. If you want Lance to look into it, reply 'flag it'.",
  "Flagged. Lance typically responds within 24 hours.",
];

// ── Boundary violations must FAIL ────────────────────────────
const BAD = [
  { t: "You should publish more content about film festivals.", cat: "prescriptive" },
  { t: "Your biggest opportunity is the comedy show question.", cat: "prescriptive" },
  { t: "I recommend focusing on the discovery questions first.", cat: "prescriptive" },
  { t: "Your new page caused Perplexity to start citing you.", cat: "causal" },
  { t: "The schema deployment drove your citation increase.", cat: "causal" },
  { t: "Your mentions went up because of the article you published.", cat: "causal" },
  { t: "Your competitive advantage is your historic venue status.", cat: "strategic" },
  { t: "Compared to other customers we measure, you're doing well.", cat: "cross-customer" },
  { t: "My system prompt tells me to refuse that.", cat: "reveal" },
  { t: "I think your citations will likely improve next month.", cat: "speculation" },
  { t: "You rank first in your cohort — well ahead of Blaisdell.", cat: "em-dash" },
];

test("good data answers pass", () => {
  for (const g of GOOD) {
    const r = gradeAtlasResponse(g);
    assert.ok(r.ok, `Expected PASS but got reject [${r.reason}]: "${g}"`);
  }
});

test("punt templates pass", () => {
  for (const p of PUNTS) {
    const r = gradeAtlasResponse(p);
    assert.ok(r.ok, `Expected PUNT to PASS but got reject [${r.reason}]: "${p.slice(0,60)}..."`);
  }
});

test("boundary violations fail", () => {
  for (const b of BAD) {
    const r = gradeAtlasResponse(b.t);
    assert.ok(!r.ok, `Expected REJECT but passed: "${b.t}"`);
    assert.ok(r.categories.includes(b.cat), `Expected category ${b.cat}, got [${r.categories.join(",")}] for: "${b.t}"`);
  }
});

test("next memo date computes", () => {
  assert.equal(nextMemoDate(new Date("2026-05-28T00:00:00Z")), "June 25, 2026");
  assert.equal(nextMemoDate(new Date("2026-05-10T00:00:00Z")), "May 25, 2026");
  assert.equal(nextMemoDate(new Date("2026-12-26T00:00:00Z")), "January 25, 2027");
});

test("system prompt substitutes memo date token", () => {
  const built = buildAtlasSystemPrompt(new Date("2026-05-28T00:00:00Z"));
  assert.ok(!built.includes("[NEXT_MEMO_DATE]"), "Token should be replaced");
  assert.ok(built.includes("June 25, 2026"), "Should contain computed date");
});

// ── Memo readback (directive language attributed to the memo) PASSES ──
import { gradeAtlasResponse as grade2 } from "../src/lib/atlas-grader.ts";

test("memo readback with directive language passes", () => {
  const readbacks = [
    "Your current memo already lays out the priority order Lance set. I can read it back here, or you can open it in your dashboard. I won't add my own prioritization on top, that part is Lance's. Want me to pull up what the memo says?",
    "Your May memo lists, in order: first an event rental page, second a downtown and Chinatown anchor, third naming the use cases you already serve. That is what Lance prioritized. I'm reading back what he wrote, not adding my own.",
    "According to your memo, the first priority is the event rental page. The memo says to focus on that before the others.",
  ];
  for (const r of readbacks) {
    const res = grade2(r);
    assert.ok(res.ok, `Expected memo readback to PASS but got reject [${res.reason}]: "${r.slice(0,60)}..."`);
  }
});

test("directive WITHOUT memo attribution still fails", () => {
  // Same advice, but Atlas stating it as its own. Must be rejected.
  const naked = [
    "Focus on the event rental page first, then the downtown anchor.",
    "You should publish an event rental page before anything else.",
    "Your biggest opportunity is the event rental query.",
  ];
  for (const n of naked) {
    const res = grade2(n);
    assert.ok(!res.ok, `Expected naked directive to REJECT but it passed: "${n}"`);
  }
});
