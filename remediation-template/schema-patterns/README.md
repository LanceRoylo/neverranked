# Schema Patterns

This directory is intentionally mostly empty in v0.

---

## Why it's empty

Schema utility code (TypeScript functions like `blogPostingSchema()`, `faqPageSchema()`, `breadcrumbListSchema()`) is the most valuable thing to templatize across clients. It is also the thing most likely to leak client-specific assumptions if you generalize too early.

The v0 policy is: **point to the canonical implementation in Montaic's codebase, don't copy it here yet.**

After the second Never Ranked client ships, we'll have two implementations of each schema utility. The shared parts get extracted into `schema-patterns/` as actual template code. The client-specific parts stay in the client codebases.

---

## Canonical reference implementations

All of these live in the Montaic codebase at `listing-pipeline-ai`:

| Schema type | File path |
|---|---|
| Organization + WebSite (@graph root) | `apps/dashboard/app/layout.tsx` (inline JSON-LD) |
| BreadcrumbList | `apps/dashboard/lib/schema/breadcrumbs.ts` |
| HowTo | `apps/dashboard/lib/schema/howto.ts` |
| BlogPosting | `apps/dashboard/lib/schema/blog-posting.ts` |
| FAQPage | `apps/dashboard/lib/schema/faq-page.ts` |
| SoftwareApplication | `apps/dashboard/lib/schema/software-application.ts` |
| WebApplication (free tools) | `apps/dashboard/lib/schema/web-application.ts` |

*Note: file paths are the expected convention as of the A1-A11 implementation. If Claire moved or renamed any of these during implementation, update this table.*

Every new Never Ranked client's schema utilities should START as a copy of the Montaic version and diverge only where the client's stack or data model requires it.

---

## The `@id` reference convention

Across every Montaic schema block, three `@id` references appear consistently:

```
https://montaic.com/#organization
https://montaic.com/#website
https://montaic.com/#founder
```

These are the root entity references. Every per-page schema (BlogPosting, HowTo, FAQPage) references them using `{"@id": "..."}` syntax instead of duplicating the full Organization object.

**For a new client:**
1. Substitute the client's domain for `montaic.com`
2. Keep the `#organization`, `#website`, `#founder` anchors as-is (they're the schema.org convention)
3. Add client-specific `@id` references where the client's data model has additional root entities (e.g., `#software` for product companies)

This is the single biggest thing that makes Montaic's schema read as a coherent entity graph instead of a bag of disconnected per-page schemas. Every client should follow the same convention.

---

## When to promote patterns here

**Promotion rule:** a schema utility gets extracted into this directory when TWO clients have implementations that are at least 70% identical.

**Specific criteria for each utility:**
- **BlogPosting:** ready to promote after client #2 publishes their first blog post
- **FAQPage:** ready to promote after client #2 uses the FAQPage schema
- **BreadcrumbList:** ready to promote after client #2 has at least 10 indexed URLs
- **HowTo:** may never promote — tool pages are often too custom to generalize. Re-evaluate after client #3.
- **SoftwareApplication:** ready to promote after a second product company client (Montaic is client #1 product)
- **Organization/WebSite root schema:** ready to promote after client #2 — this is the easiest one to generalize because the structure is stable across all companies

---

## What NOT to template here

Schema patterns that are so client-specific they'll never generalize:

- Product-specific structured data (Montaic's Fair Housing screening count, specific feature lists)
- Review data (AggregateRating, Review) — each client's review schema is shaped by their review collection system
- Event data (webinars, conferences) — event schedules don't reuse
- Job postings — these are always custom to the client's ATS

Put these in client codebases, not here.

---

## v1 target

After Never Ranked has shipped 3 clients, this directory should contain:

1. `organization-website-root.ts` — drop-in root schema for any client domain
2. `blog-posting.ts` — generic blog post schema with required fields + optional enrichments
3. `faq-page.ts` — generic FAQ schema with a typed `FAQItem` interface
4. `breadcrumb-list.ts` — path-based breadcrumb generator
5. `README.md` — this file, updated with the extracted-pattern versioning

Everything else stays in client codebases.
