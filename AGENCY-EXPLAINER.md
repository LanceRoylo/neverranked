# NeverRanked — Agency Explainer (1-2 page hand-off paper)

A self-contained brief for building the agency-facing explainer in Claude Design (claude.ai/design).
This file has TWO things:

1. **Final copy** — paste into Claude Design verbatim. Already passes HM Quality Benchmarks (Swap Test, Specificity Lever, Remove-a-Word).
2. **Visual brief** — paste into Claude Design's prompt to give it the visual direction, anti-template guardrails, and brand reference.

**Spine of the document:** *You don't need to build an AEO team. You need to add an AEO product. We're the back office; the brand on the dashboard is yours.* Every claim is evidence for that single idea.

---

## SECTION 1 — The pitch + how the partnership works

### Top-of-page headline + subhead

> **You don't need to build an AEO team. You need to add an AEO product.**
>
> *A reseller partnership for agencies whose clients are about to start asking why they're not being cited by AI.*

### Opening paragraph

> Your clients are going to ask within twelve months. Some already are. AEO (Answer Engine Optimization) is the work of getting cited by ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma when their customers ask the questions your clients want to answer. Building this in-house means hiring people who do not exist yet on the open market, buying a tool stack nobody has built, and writing a methodology nobody has tested. Reselling NeverRanked means adding a line item to next month's proposal.

### Who this is for

> **Yes, if:** you run a small-to-mid digital, SEO, or content agency with an existing book of retainer clients. You want to add AEO as a product line under your brand without hiring a specialist.
>
> **No, if:** you are a solo freelancer without operational capacity to manage another retainer. You don't currently sell SEO or content (no client overlap to speak of). You need to maintain your own proprietary AEO methodology branding (we sell ours, not yours).

### How the partnership works (compressed four steps)

**01. You introduce.** You send us a client. We do not contact them without you.

**02. We onboard in 48 hours.** Schema, dashboard, citation tracking, scan setup, baseline. Your client sees your brand.

**03. We execute the work.** Schema fixes auto-pushed to their site, weekly citation tracking, quarterly drift refresh, authority audits, content drafts (Amplify). Every recommendation visible in the dashboard so nothing is hidden from your client and nothing is hidden from you.

**04. You forward the Monday digest.** Plain English, forward-ready under your brand. What changed last week, what mattered most, what we recommend next. You stay the account lead. You bill the client. We bill you.

### White-label assurance, said directly

> Your name is on the dashboard. Your brand is on the digest. We never reach out to your client. If your client cancels, they cancel with you, not us, because we were never in the room. If you cancel the partnership, you keep the client. The relationship was always yours.

### Pricing

> Tier — Retail (what you bill the client) — Your share (what you keep monthly per active client)
>
> **Audit** — $500 retail one-time — **$300 to you** (60/40 split, delivered in 48 hours)
>
> **Signal** — $2,000/mo retail — **$1,200/mo to you** (60/40 split)
>
> **Amplify** — $4,500/mo retail — **$2,700/mo to you** (60/40 split, capped at 6 active clients globally)

> *Billed monthly to you on the active-client count. No annual lock. One client unlocks the reseller rate.*

---

## SECTION 2 — The toolkit you'll actually use

### Header

> **What you'll say to your clients. What we built so you don't have to.** *For your sales team, your account managers, and anyone explaining NeverRanked to a client.*

### The 30-second pitch (verbatim, paste into client emails)

> When your customers ask ChatGPT, Perplexity, or Gemini "best [your category] for [their use case]," the AI picks one or two brands. We track which brands get cited for the queries that matter to you, audit your schema and authority signals against the engines that decide, and ship the fixes through a partner who specializes in nothing else. Same software they run on their own domain, you can verify any line of it.

### Three things your team can carry into a client conversation

> **AEO is a separate category from SEO.** Citations from ChatGPT and Perplexity work differently than blue-link rankings. Your existing SEO work isn't replaced. It's extended.
>
> **The platform is built and used in the open.** The codebase is public on GitHub. The schema grader is a public tool at check.neverranked.com. The roadmap is published. Most agencies in the AEO space hide behind opacity. We don't have to.
>
> **It refreshes every 90 days.** AI models retrain on a cycle. Citation patterns shift. A static one-time audit goes stale in weeks. Drift detection is built in.

### Common client objections + 1-line answers

> **"We already have an SEO agency. Why this?"**
> AEO is a separate practice. Ask your SEO agency to tell you which queries cite your brand on ChatGPT today. Most can't because they don't have the tooling. We do.
>
> **"Why three months minimum?"**
> AI models retrain on a cycle. Schema deployed in month one is absorbed in the next training window and surfaces as citations in month three. The minimum protects you from quitting before the work compounds.
>
> **"What does NeverRanked actually have access to on our site?"**
> Read-only schema injection via a 20-line public JavaScript snippet (no cookies, no DOM read, no outbound calls — just appends JSON-LD to your <head>). For Amplify, scoped CMS access to create draft posts only. Nothing auto-publishes without your click. Full breakdown at neverranked.com/security with the actual file paths in the public repo.
>
> **"Can you guarantee citations?"**
> No. Anyone who guarantees AI citations is selling theater. We guarantee the work — schema graded before deploy, drift detection every 90 days, authority audits, citation-shaped content (Amplify). Citations follow when the work is right.
>
> **"What happens if NeverRanked makes a mistake?"**
> Every change is auditable in your client's dashboard before and after it ships. If a fix needs to be rolled back, that is one click. You see what we see. There is no version of "we shipped something while you weren't looking."

### Operational division of labor

> **You do:** the client relationship, the proposal, the onboarding call, the upsell, the renewal conversation, billing the client, the Monday digest forward, brand-aligned communication.
>
> **We do:** all the technical execution. Schema design, schema injection, citation tracking infrastructure, drift detection, authority audits, content drafting (Amplify), dashboard maintenance, weekly digest generation, the Monday brief itself.

### Exit conditions, said directly

> Monthly billing on active clients only. No annual lock. No contract penalties. If you decide reselling NeverRanked isn't a fit, you stop sending us new clients. Existing engagements run out their three-month minimum. Your clients stay your clients.

### Receipts (verifiable in 60 seconds)

> ```
> Public schema scorer       check.neverranked.com
> Public security page       neverranked.com/security
> Public source code         github.com/lanceroylo/neverranked
> Public roadmap             github.com/lanceroylo/neverranked/blob/main/ROADMAP.md
> Case study                 neverranked.com/case-studies/montaic
> Apply to partner           app.neverranked.com/agency/apply
> ```

### Your next move

> **Two paths:**
>
> Apply directly at **app.neverranked.com/agency/apply** if you've already done the math. Setup takes ~24 hours.
>
> Or book a 30-minute call first at **lance@neverranked.com**. Bring your client list and we'll tell you which ones are likely to win on this in the first 90 days.

---

## ─── CLAUDE DESIGN BRIEF ───────────────────────────────────────

Paste this into Claude Design as your prompt, with the copy above as the content payload.

---

### Project

A 2-section agency-facing reseller brief for NeverRanked, an AI visibility (AEO) reseller partnership. The asset will be hand-delivered to small/mid-size digital, SEO, and content agencies considering reselling NeverRanked under their own brand. Designed as one cohesive document with two sections: the partnership pitch (60% of real estate) and the agency-toolkit reference card (40%).

### Visual reference

- **Primary brand:** neverranked.com (visit it). Editorial dark-luxury aesthetic, MouthWash Studio-inspired. Restrained, opinionated, never decorative. Confident without being loud.
- **Editorial benchmarks:** NYT Magazine feature spreads, Mouthwash Studio website, The Browser Company press kit.
- **Already exists:** neverranked.com/for-agencies — its tonal direction is what we're matching here, but tightened for handoff use.

### Color (use these, not Claude Design defaults)

- Background: deep charcoal / near-black (#0a0a0a range, slightly warmed)
- Body copy: cream / warm off-white (#e8e4d8 range)
- Accent: muted antique gold (#c9a84c range) — used sparingly, only for the NeverRanked wordmark, key numbers ($1,200, $2,700), the headline em-tag, or one CTA
- Secondary text: warm muted gray (#8a8470 range)

### Typography

- **Display headlines:** high-contrast editorial serif (Playfair Display, Tiempos Headline, GT Sectra, or similar). Tight tracking, generous line height.
- **Body copy:** clean sans-serif (Söhne, Inter, or similar). 16-17pt, line-height ~1.6.
- **Numbers in the pricing table:** rendered LARGE in the display serif, with the unit ("/mo", "to you") in monospace right next to it. The dollar figures are the visual anchor of Section 1.
- **Receipts / links:** monospace (IBM Plex Mono, JetBrains Mono). Should feel like terminal output.

### Layout

- **Section 1** is generously spaced. Pricing table gets its own visual moment with large dollar figures. The four-step partnership is laid out vertically with restrained step numbers (01, 02, 03, 04), not iconified.
- **Section 2** is denser, feels like the "reference card" section. Two-column where useful (objection list works in two columns). Receipts in a monospace block.
- A horizontal rule, color block, or section break clearly transitions from Section 1 to Section 2.
- The wordmark (NeverRanked or NR with a small "Reseller Brief" subtitle) appears small and confident in the header. Not a logo lockup, just type.

### Anti-template guardrails (CRITICAL)

- **NO stock illustrations.** No characters, no hands holding phones, no abstract gradients.
- **NO icon libraries.** No checkmarks, no rockets, no lightning bolts, no chat bubbles, no handshake icons. Especially no handshake icons.
- **NO three-column "feature cards"** that look like a generic SaaS landing page.
- **NO "Trusted by" logo wall** unless populated with real client logos (we have one, Montaic).
- **NO AI-generated futuristic gradient backgrounds.** No neural-network line patterns. No glowing dots.
- **NO emojis.**
- **White space is encouraged.** Do not fill every pixel.
- **Numbers should feel typographic**, not "infographic" — the number IS the design moment.

### Voice constraints (apply in any visible microcopy you might add)

- No em dashes generated by AI. The copy provided uses them sparingly via punctuation, that is intentional.
- No semicolons in body copy.
- No formulaic filler ("Welcome to...", "hidden gem", "rare opportunity", "Nestled in...").
- No exclamation points anywhere.
- No "Trusted by leading agencies" without proof. We don't have that yet. Don't fake it.

### Output format

- US Letter, 2 pages, print-ready PDF.
- Optional: same composition as a single scrollable web page, no horizontal scrolling on mobile.

### Test before shipping (apply these to the final design)

- **Swap Test:** replace "NeverRanked" with "any other white-label AEO reseller." If the design + copy still reads fine, it is not distinctive enough. Start over.
- **Blind Brand Test:** cover the wordmark. Can you tell this is NeverRanked from typography and tone alone? It should be obvious.
- **Receipts Test:** an agency owner reading this should be able to verify at least one claim within 60 seconds (the public source repo, the security page, or the schema scorer). Make sure those are surfaced prominently enough to act on.

---

## How to use this file

1. **Copy the full SECTION 1 + SECTION 2 copy above** as your "content" input to Claude Design.
2. **Paste the CLAUDE DESIGN BRIEF below the divider** as your "prompt" / "design direction" input.
3. **Iterate.** First pass will not be perfect. The Test block at the bottom of the brief tells you what to push back on.
4. **Final pass:** export PDF + (optionally) the web version. Hand the PDF to agency owners after intro calls. Link the web version when you want it indexable / shareable.

## Pairs with

- `EXPLAINER.md` — the direct-prospect / sales-people version (different audience, similar structure)
- `https://neverranked.com/for-agencies/` — the public sales page (this brief is the take-away artifact for after the agency has read or skimmed that page)
- `https://neverranked.com/security/` — the source-of-truth security page that handles the "what can NeverRanked actually access" objection
