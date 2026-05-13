# Visible FAQ marker

The NeverRanked snippet always injects `<script type="application/ld+json">` schema into a client's page. As of 2026-05-13 it can also render the FAQPage schema as **visible HTML** alongside the JSON-LD, for crawlers that don't parse JSON-LD deeply.

This visible rendering is **opt-in by placement**. We don't add visible content to a client's site unless they explicitly say where it should go.

## How a client opts in

Add a single empty `<div>` to the page where the FAQs should appear:

```html
<div data-nr-faq></div>
```

That's it. The snippet detects the marker and injects the FAQ content into it on page load. No CSS required (it uses native `<details>`/`<summary>` for the accordion).

## What gets rendered

For each `mainEntity` Question in the FAQPage schema:

```html
<div data-nr-faq itemscope itemtype="https://schema.org/FAQPage" data-nr-faq-rendered="1">
  <details class="nr-faq-item" itemscope itemtype="https://schema.org/Question" itemprop="mainEntity">
    <summary class="nr-faq-q" itemprop="name">Where can I see live music in Honolulu?</summary>
    <div class="nr-faq-a" itemscope itemtype="https://schema.org/Answer" itemprop="acceptedAnswer">
      <div itemprop="text">Hawaii Theatre Center at 1130 Bethel Street...</div>
    </div>
  </details>
  <!-- more <details> per Question... -->
</div>
```

Microdata attributes mirror the JSON-LD structure so the visible content is independently parseable by crawlers that use Schema.org microdata.

## Styling

Optional. The snippet sets two class names a client's CSS can target:

- `.nr-faq-item` on each `<details>` element
- `.nr-faq-q` on the question `<summary>`
- `.nr-faq-a` on the answer wrapper

Without any custom CSS, browsers render `<details>` as a collapsed accordion with a triangle disclosure. Clients can style or completely override.

## Why opt-in via marker

1. Respect: we don't add visible content to a client's site without explicit placement consent
2. No surprise layout changes: existing snippet installations (no marker) see zero visual change after this feature ships
3. No hidden-content penalty: we never render visible HTML that's hidden via CSS or aria-hidden
4. Client controls placement: the FAQ block goes exactly where the client puts the marker

## Idempotency

The snippet checks `data-nr-faq-rendered="1"` before injecting. If the snippet runs twice on the same page (rare; cache refresh, route change in a SPA, etc.), the FAQ block renders exactly once.
