# NeverRanked — Explainer (1-2 page asset)

A self-contained brief for building the explainer in Claude Design (claude.ai/design).
This file has TWO things:

1. **Final copy** — paste into Claude Design verbatim. Already passes HM Quality Benchmarks (Swap Test, Specificity Lever, Remove-a-Word).
2. **Visual brief** — paste into Claude Design's prompt to give it the visual direction, anti-template guardrails, and brand reference.

**Spine of the document:** *We built the AEO infrastructure. Then we used it on ourselves first.* Every claim, every number, every section is evidence for that one idea.

---

## SECTION 1 — Customer-facing (~60% of visual real estate)

### Top-of-page headline + subhead

> **We built the AEO infrastructure. Then we used it on ourselves first.**
>
> *An AI visibility agency for teams who want to verify the work, not just trust the report.*

### Opening paragraph (one short paragraph, sets the frame)

> Most AEO agencies sell consulting wrapped around someone else's tools — Ahrefs, SEMrush, an AEO module bolted onto a generic SEO suite. We built ours. Citation tracker, schema completeness grader, citation-drift detection, authority audits, the public schema scorer at check.neverranked.com. Same software runs on our domain that runs on yours, with no special treatment. When the dashboard says we're failing at named authorship, our roadmap auto-generates the same fix it would for any client.

### Three distinctive ideas (each gets its own typographic moment)

**Idea 01 — The 90-day brand learning window**

> **90 days.** That is how long it takes AI engines to absorb structural changes to your site. Schema you ship in month one shows up in citation patterns in month three, after the next training window passes. We have a three-month minimum because the math demands it, not because we want a longer contract. Anyone promising AI citations in week two is selling theater.

**Idea 02 — The 18-point partial-schema penalty**

> **18 percentage points.** That is the citation penalty for partial or generic JSON-LD schema versus no schema at all. AI engines treat incomplete structured data as a mismatch between what you claim and what you deliver. Most "schema audits" ship partial implementations and call it a win. Ours grade every block before deploy and block anything under 60 out of 100. Verify the math yourself by pasting any URL into check.neverranked.com.

**Idea 03 — Web-grounded, not training-data**

> **Live grounding.** Several of the seven engines we track (Perplexity, ChatGPT, Gemini, Google AI Overviews, Microsoft Copilot) run live web-grounded queries against the same APIs they use to answer their actual users. Claude is reasoning-grounded. Gemma is open-weight and reproducible. Most "AI tracking" tools query the model's training data, which is months stale. We mark every result with grounding mode (live, reasoning, or reproducible) so you can audit which signals are real-time and which are reference points.

### Tier line (push directly to Signal — skip Audit framing)

> **Signal — $2,000/month, 3-month minimum.**
>
> Weekly citation tracking across ChatGPT, Perplexity, Gemini, Google AI Overviews, Claude, Microsoft Copilot, and Gemma. Reddit thread tracking broken out separately. Schema fixes auto-pushed to your live site (graded for completeness first). Authority audits for trust-platform presence and author-bio depth. Live dashboard with industry-percentile ranking. 90-day roadmap that re-evaluates against drift every quarter. Forward-ready Monday digest.
>
> *Amplify ($4,500/month) adds the content production engine — brand-voice drafting, auto-publish to your CMS, content calendar that fills itself from the roadmap, and Reddit reply briefs (we tell your team what to write about and what angle only you can take, a real human posts the actual reply).*

### Receipts line (typographic, like terminal output)

> **Verify any of this in 30 seconds.**
>
> ```
> check.neverranked.com         our public schema scorer (same grader your audit uses)
> github.com/lanceroylo/neverranked/blob/main/ROADMAP.md      every feature, dated
> neverranked.com               our domain runs in our own dashboard with no special treatment
> ```

### CTA

> **Start Signal →** *(link: https://app.neverranked.com/checkout/signal)*
>
> Or email **hello@neverranked.com** if you want a 20-minute conversation first.

---

## SECTION 2 — Sales / agency-enablement (~40%, denser, reference-card feel)

### Header

> **Carrying the conversation.** *For sales people, agency partners, and anyone explaining NeverRanked to a client.*

### The 30-second pitch (verbatim — paste into emails)

> NeverRanked tracks which AI engines cite you, your competitors, and your industry's reference threads on Reddit. They built the infrastructure (citation tracker, schema completeness grader, drift detection, authority audits) and ran it on themselves before they ran it on clients. The dashboard scoring your prospect sees is the same one scoring NeverRanked. Verify any claim in 30 seconds at check.neverranked.com.

### Three lines of difference (mental models, not features)

> **They built the tools.** Everyone else licenses the same off-the-shelf platforms. NeverRanked owns the entire stack.
>
> **They use them on themselves first.** Their domain runs in their own dashboard, with no special treatment, before any client sees it.
>
> **They refresh every 90 days.** AI models retrain. Citation patterns shift. A static one-time audit goes stale in weeks.

### Common objections + 1-line answers

> **"We already have an SEO agency."**
> AEO is a separate category. Citations from ChatGPT and Perplexity work differently than blue-link rankings. Ask your SEO agency to tell you exactly which queries cite your client today. Most can't answer because they don't have the tooling.
>
> **"Why three months minimum?"**
> AI models retrain on a cycle. Schema deployed in month one gets absorbed into the next training window and surfaces as citations in month three. The minimum protects you from quitting before the work compounds.
>
> **"Why not just use Profound or Otterly or SEMrush's AEO module?"**
> They query training data, not live web-grounded results. That is the difference between "what the model thinks" and "what the model said today." NeverRanked's tracking pulls live, with grounding-mode tagged on every result so you can audit it.
>
> **"Can you guarantee citations?"**
> No. Anyone who guarantees AI citations is selling theater. We guarantee the work — schema graded before deploy, drift detection every 90 days, authority audits, citation-shaped content (Amplify). Citations follow when the work is right.
>
> **"What does NeverRanked actually have access to on our site?"**
> Read-only schema injection via a 20-line public JavaScript snippet (no cookies, no DOM read, no outbound calls — just appends JSON-LD to your <head>). For Amplify, scoped CMS access to create draft posts only — no users, no settings, no themes. Nothing auto-publishes without your click. Full breakdown at neverranked.com/security, including the actual file paths in the public repo so they can verify any claim.

### Who this is NOT for (the constraining philosophy as a feature)

> Teams who want a one-time audit with no ongoing work.
> Teams who want Copilot tracking (we don't track it — Copilot is around 3% of AI discovery, mostly a productivity layer not a search tool).
> Teams looking for short-term tactics to game current model versions.

### Receipts (links, monospace block)

> ```
> Public schema scorer    check.neverranked.com
> Public roadmap          github.com/lanceroylo/neverranked/blob/main/ROADMAP.md
> Live marketing site     neverranked.com
> Get in touch            hello@neverranked.com
> ```

---

## ─── CLAUDE DESIGN BRIEF ───────────────────────────────────────

Paste this into Claude Design as your prompt, with the copy above as the content payload.

---

### Project

A 2-section explainer document for NeverRanked, an AI visibility (AEO) agency. The asset will be emailed to prospects, sales people, and agency partners. Designed as one cohesive document with two sections: customer-facing pitch (60% of real estate) and sales-enablement reference (40%).

### Visual reference

- **Primary brand:** neverranked.com (visit it). The aesthetic is editorial dark-luxury, inspired by MouthWash Studio. Restrained, opinionated, never decorative.
- **Editorial benchmark:** NYT Magazine feature spreads, Mouthwash Studio website, The Browser Company (Arc) press kit. Not "tech startup landing page."

### Color (use these, not Claude Design defaults)

- Background: deep charcoal / near-black (#0a0a0a range, slightly warmed)
- Body copy: cream / warm off-white (#e8e4d8 range)
- Accent: muted antique gold (#c9a84c range) — used sparingly, only for the NeverRanked wordmark, key numbers, or one CTA
- Secondary text: warm muted gray (#8a8470 range)

### Typography

- **Display headlines:** high-contrast editorial serif (Tiempos Headline, Söhne Mono, GT Sectra, or similar). Tight tracking, generous line height.
- **Body copy:** clean sans-serif (Söhne, Inter, or similar). 16-17pt, line-height ~1.6.
- **Numbers / stats:** large in the display serif, with the unit ("days", "%", "of 4") in monospace right next to it. The number is the visual anchor of each "distinctive idea" block.
- **Receipts / links:** monospace (IBM Plex Mono, JetBrains Mono). Should feel like terminal output.

### Layout

- **Section 1** is generously spaced. Big numbers, plenty of white space, each "Idea 01 / 02 / 03" gets its own visual band with the number rendered LARGE (think 6-8x the body type).
- **Section 2** is denser, feels like the "reference card" or "back of brochure." Uses two-column layout where useful. Objections list is tight. Receipts in a monospace block.
- A horizontal rule, color block, or section break clearly transitions from Section 1 to Section 2.
- The wordmark (NeverRanked or NR) appears small and confident in the header. Not a logo lockup, just type.

### Anti-template guardrails (CRITICAL)

- **NO stock illustrations.** No characters, no hands holding phones, no abstract gradients.
- **NO icon libraries.** No checkmarks, no rockets, no lightning bolts, no chat bubbles.
- **NO three-column "feature cards"** that look like a generic SaaS landing page.
- **NO AI-generated futuristic gradient backgrounds.** No "neural network" line patterns. No glowing dots.
- **NO emojis.**
- **White space is encouraged.** Do not fill every pixel.
- **Numbers should feel typographic**, not "infographic" — the number IS the design moment.

### Voice constraints (apply in any visible microcopy you might add)

- No em dashes generated by AI (the copy provided uses them via punctuation, that is intentional).
- No semicolons in body copy.
- No formulaic filler ("Welcome to...", "hidden gem", "rare opportunity", "Nestled in...").
- No exclamation points anywhere.

### Output format

- US Letter, 2 pages, print-ready PDF.
- Optional: same composition as a single scrollable web page, no horizontal scrolling on mobile.

### Test before shipping (apply these to the final design)

- **Swap Test:** replace "NeverRanked" with "any other AEO agency." If the design + copy still reads fine, it is not distinctive enough. Start over.
- **Blind Brand Test:** cover the wordmark. Can you tell this is NeverRanked from typography and tone alone? It should be obvious.
- **Receipts Test:** the customer should be able to verify at least one claim within 30 seconds of finishing the document. Make sure check.neverranked.com appears prominently enough that they can.

---

## How to use this file

1. **Copy the full SECTION 1 + SECTION 2 copy above** as your "content" input to Claude Design.
2. **Paste the CLAUDE DESIGN BRIEF below the divider** as your "prompt" / "design direction" input.
3. **Iterate.** First pass will not be perfect. The Test block at the bottom of the brief tells you what to ask Claude Design to fix.
4. **Final pass:** export PDF + (optionally) the web version. Email the PDF. Link the web version when you want clients to see it indexable / linkable.
