# ASB + MVNP — May 18 live-demo click path

**Purpose:** If Mark or James says "show me what NeverRanked actually does," this is the rehearsed five-to-seven-minute flow. Three scenarios, in priority order. Pick one based on the room temperature when the moment arrives.

**Pre-meeting setup (do night before):**

1. Open Safari (or Chrome) on the laptop you'll demo from
2. Pre-load these four tabs in this order, left to right:
   - Tab 1: `https://neverranked.com/case-studies/hawaii-theatre/` (proof)
   - Tab 2: `https://check.neverranked.com` (live scan)
   - Tab 3: `https://neverranked.com/state-of-aeo/2026-05-11/` (methodology)
   - Tab 4: `https://neverranked.com/pitch/asb-hawaii/` (the brief they already have)
3. Close every other tab, every notification, the Gmail icon badge. Camera off on Zoom apps. Slack quit. Phone face-down.
4. Verify cell data is on as a backup hotspot in case the venue wifi is slow

**Test sequence (run the morning of):**

1. Click each of the four tabs. Each one should load under 1 second from cache.
2. In Tab 2, paste `asbhawaii.com` and click Scan. Verify the scan completes within 25 seconds.
3. If it stalls past 25 seconds, refresh and try with the trailing slash (`asbhawaii.com/`). If that also stalls, the demo defaults to Scenario B (case study only).

---

## Scenario A — Live scan a competitor, then pivot to ASB

**When to use:** Mark or James says "show me what you'd see for someone like us" or "can you do this in real time?"

**Flow (six minutes):**

1. Pull up Tab 2 (`check.neverranked.com`). Say: "This is the same scan engine we run on our daily citation tracker. Free, no signup, anyone can run it."
2. Paste `fhb.com`. Click Scan.
3. While it's running (10-25 seconds), say: "I picked First Hawaiian because they're the closest peer to ASB by size in Hawaii. Same regulatory posture, similar deposit base. Watch what the scan finds."
4. When the score lands, walk through the four breakdown pillars. Schema completeness, llms.txt presence, agent-readiness, citation surface. Name the deficits specifically. ("They're missing FinancialService schema. They've got no llms.txt. They have zero ActionType deployments.")
5. Pivot to Tab 1 (Hawaii Theatre case study). Say: "This is what happens when a Hawaii client we work with deploys the schema layer." Walk the 45 to 95 in ten days story. Stop at the after-state grid.
6. Pivot to Tab 4 (their pitch). Say: "Your audit is the same scan engine, weighted for banking-specific deficits. Mark already has the report. The week-one deployment plan is in section 07."

**Closing line:** "If we deploy week one, the second weekly citation log run is where you start seeing movement. Hawaii Theatre took ten days. A bank that's already as well-organized as ASB content-wise probably takes seven."

---

## Scenario B — Case study only, no live scan

**When to use:** Wifi is slow, the live scan stalls, or the room dynamic suggests "show me proof not process" rather than "show me the tool."

**Flow (four minutes):**

1. Pull up Tab 1 (Hawaii Theatre case study).
2. Hero: "Forty-five out of one hundred. Grade D. Zero AI citations on the queries that mattered for venue discovery."
3. Scroll to "What we shipped" timeline. Walk through the five schema categories. Stop on the schema list — name them out loud so they sink in. ("PerformingArtsTheater for the venue. WebSite. AggregateRating for reviews. FAQPage for the help content. BreadcrumbList across twenty-four sections.")
4. Scroll to the score-compare cards. "Ten days later, second scan: 95. Grade A."
5. Scroll to the eight-card grid. "Same week, first citation log run after deployment: Perplexity named them on 14 of 19 tracked queries."
6. Close with: "The CEO of Hawaii Theatre Center approved use of these numbers in marketing material on May 10. That's why I can show them to you by name. The arithmetic is reproducible — anyone can run the same scan against the same URL and verify."

**Closing line:** "For ASB, the equivalent schema set is FinancialService, Person with award, Service per offering, AggregateRating, and FAQPage. Same playbook, no marketing-copy risk because schema is structured fact about your business, not new claims."

---

## Scenario C — Methodology defense (technical objection)

**When to use:** Someone in the room (more likely James from MVNP) asks "how do you know the citations are real?" or "what stops you from cherry-picking?"

**Flow (three minutes):**

1. Pull up Tab 3 (State of AEO 2026-05-11).
2. Show the seven-engine list. Read the names. Pause on Gemma.
3. Say: "Six of these are commercial APIs. We can't audit them. They could change behind the scenes and we'd have to take their word for it. Gemma is the seventh. It's Google's open-weight model. The weights are public. Anyone with the same model weights can re-run our prompts and verify our citation numbers independently. That's why we added it."
4. Scroll to the data-integrity banner. Say: "When a run has gaps, we say so. Last weekend's run had two engine integrity issues — we caught them, fixed them mid-week, and documented the fix architecture publicly in our repo. That's not how marketing analytics platforms usually behave."
5. Pivot back to Tab 4 section 13 (Hawaii Theatre proof in their pitch). Close with: "Our differentiation is that we're auditable. The math you see in your audit is the same math anyone with the same toolchain can produce."

**Closing line:** "Ask the question that matters: can a third party reproduce what we measured? With us, the answer is yes. With every other AEO vendor, the answer is trust us."

---

## What to do if something breaks mid-demo

**Live scan stalls:**
- After 30 seconds, say "Let me show you the case study version instead — same engine, already-completed run." Switch to Scenario B. Do not try to refresh and re-scan with three people watching.

**A tab won't load:**
- Tab 4 (pitch) is the offline-safe fallback because Mark already has the PDF version. Say "You've got this one in your inbox already; the live version is just the latest copy."

**Someone challenges a number:**
- Don't argue. Say "Good question. The methodology is at neverranked.com/state-of-aeo/ — the run logs and source classifier are public. I'll send you the specific line item after this." Then move on.

**The room goes cold on the demo:**
- Close the laptop. Say "The brief in your inbox has everything I just showed you and more. What's the next step from your side?" Hand the room back to them.

---

## What NOT to do

- Don't open the dashboard. It's not pressure-tested for a "click through it with three people watching" moment.
- Don't run a scan on `asbhawaii.com` live. They've already seen their audit; running it again under pressure adds risk without adding evidence.
- Don't mention HN, the MCP server, or anything technical that isn't on a tab you can point at.
- Don't say "let me check something on my phone" mid-demo.
- Don't apologize for the data-integrity banner if it comes up. State what happened, point at the fix, move on.

---

## Post-demo close

If the demo lands well, the line is:

> "The pricing options are in your inbox. I can answer questions on retention, deployment timeline, or what the first 30 days look like. Or if it's easier, we can set the second meeting to run the deployment proposal."

If the demo is lukewarm:

> "What would you need to see next to feel confident enough to pilot this for ninety days?"

That second question separates polite-no from active-interest. If they have an answer, you have a path. If they don't, you can leave the meeting without burning the relationship.

---

**Document version:** 2026-05-11
**Tested:** check.neverranked.com (368ms), app.neverranked.com/free/signup (208ms), case-studies/hawaii-theatre (89ms) — all healthy as of commit 290e4dd
