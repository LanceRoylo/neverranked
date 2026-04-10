# Remediation Action Catalog

The canonical list of Never Ranked remediation actions. Each action has a reference implementation in the Montaic engagement (client #1). When a new client needs an action, copy the Montaic reference as the starting point and adapt to the client's stack.

This catalog is the INDEX. The reference implementations are the source of truth for "how this action actually works."

---

## Action IDs

Actions are numbered A1-A11 in order of impact-per-hour, based on the Montaic engagement. A new client's implementation order is determined by their roadmap, NOT by this catalog.

| # | Action | Impact | Typical effort | Reference |
|---|---|---|---|---|
| A1 | Root Layout Schema (Organization + WebSite) | CRITICAL | 30 min | [Montaic A1](../audits/montaic/implementation/A1-root-schema.md) |
| A2 | BreadcrumbList schema | HIGH | 40 min | [Montaic A2](../audits/montaic/implementation/A2-breadcrumbs.md) |
| A3 | HowTo schema (tool/calculator pages) | HIGH | 70 min | [Montaic A3](../audits/montaic/implementation/A3-howto-schema.md) |
| A4 | BlogPosting schema upgrade | MEDIUM | 60 min | [Montaic A4](../audits/montaic/implementation/A4-blogposting-schema.md) |
| A5 | SoftwareApplication + AggregateRating | HIGH (gated on reviews) | 70 min | [Montaic A5](../audits/montaic/implementation/A5-software-application.md) |
| A6 | Free tool page full stack (WebApp + HowTo + FAQPage + Breadcrumbs) | HIGH | 40 min | [Montaic A6](../audits/montaic/implementation/A6-free-grader-full-stack.md) |
| A7 | Canonical tags + robots meta | HIGH | 20 min | [Montaic A7](../audits/montaic/implementation/A7-canonicals-robots.md) |
| A8 | og:image generation (Vercel @vercel/og or static) | HIGH | 45-100 min | [Montaic A8](../audits/montaic/implementation/A8-og-images.md) |
| A9 | Title + meta rewrites (top 4-6 pages) | HIGH | 15 min per page | [Montaic A9](../audits/montaic/implementation/A9-title-meta-rewrites.md) |
| A10 | Entity registration (Wikidata, Crunchbase, LinkedIn, + 7 directories) | CRITICAL | 3-5 hours | [Montaic A10](../audits/montaic/implementation/A10-entity-registration.md) |
| A11 | Pillar article (single strategic positioning piece) | HIGH | 90 min draft + 60 min voice pass + publish | [Montaic A11](../audits/montaic/implementation/A11-fair-housing-pillar-article.md) |

---

## How to pick actions for a client

1. Read the client's `audits/{client}/07-roadmap.md`
2. For each Month 1 item in the roadmap, match it to an action ID in this catalog
3. For each matched action, create a client-specific implementation file at `audits/{client}/implementation/{action-id}-{client-topic}.md`
4. Use the Montaic reference as the starting point, adapt to the client's stack, client's voice, client's audit findings
5. Ship actions in the order the roadmap specifies, not in the order this catalog lists

Typical Month 1 for a new client is 5-7 actions from this catalog, plus A11 (the pillar article for the client's positioning topic).

---

## Quick-win tracks

**30-minute track (if the client only has 30 minutes today):**
- A1 only

**90-minute track:**
- A1 -> A7 -> A9

**Half-day sprint (3-4 hours):**
- A1 -> A7 -> A6 -> A9 -> A2 -> A3

**Full Month 1 (10-15 hours):**
- All of the above plus A4, A5, A8, A10, A11

---

## What's NOT in this catalog

Actions that are too client-specific to template. These need to be built from scratch per engagement:

- **Custom calculators or free tools** — the tool itself must be built per client topic. A6 only templates the SCHEMA stack around the tool, not the tool itself.
- **Industry-specific compliance frameworks** — Montaic has Fair Housing screening. A law firm client would need a different compliance layer. A medical client would need HIPAA. These don't generalize.
- **Backlink campaigns** — distribution, not remediation. Belongs in the distribution playbook (not yet written).
- **Email sequences and outreach** — same. Distribution, not remediation.

When a new client needs something that isn't in this catalog, do the work, then promote the pattern to a new action (A12, A13...) once you've seen it at two clients. First client = custom. Second client = promote to template. Third client = it's officially part of the catalog.

---

## Evolution policy

This catalog will change. Every new client adds pressure on the templates. Rules:

1. **Don't generalize on client #1.** Montaic is the baseline. We don't know which parts are Montaic-specific and which are universal until we ship client #2.
2. **Promote patterns after 2 clients.** If an action works the same way on clients #1 and #2, extract the shared pieces into the catalog.
3. **Version the catalog after 3 clients.** Once three clients have used the catalog, freeze the current version as v1 and start iterating toward v2.
4. **Kill actions that stop being used.** If no client has needed A5 (SoftwareApplication + AggregateRating) in 6 engagements, remove it from the default quick-win tracks. It stays in the catalog but drops out of the "usual order."
