# Schema Review — {Client Name}

**Auditor:** Never Ranked
**Sample date:** {YYYY-MM-DD}
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

{2-3 sentence overview of schema coverage. What's present? What's missing? How does it compare to the category average?}

**Schema grade: {A/B/C/D/F}** ({one-line justification})

---

## What exists today

| Page type | FAQPage | SoftwareApplication | Article | Organization | BreadcrumbList | HowTo | Review |
|---|---|---|---|---|---|---|---|
| Homepage | | | | | | | |
| Pricing | | | | | | | |
| {page type 3} | | | | | | | |
| {page type 4} | | | | | | | |
| {page type 5} | | | | | | | |

---

## Findings

### 1. {Most critical schema gap} ⚠ {priority}

{Description of the gap. Why it matters.}

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "{Type}",
  // ... full schema block ready to paste
}
```

**Why this specific structure:** {Explain the design decisions in the schema block so the client understands what to adapt.}

---

### 2. {Next gap} ⚠ {priority}

{...}

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | {fix} | {HIGH/MED/LOW} | {LOW/MED/HIGH} |
| 2 | {fix} | {HIGH/MED/LOW} | {LOW/MED/HIGH} |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] Per-page-type schemas (HowTo on tools, BlogPosting on blog, etc.)
- [ ] `@graph` with `@id` references linking schemas together
