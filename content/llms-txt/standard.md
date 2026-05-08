# NeverRanked Position on llms.txt

The llms.txt standard, proposed at [llmstxt.org](https://llmstxt.org)
by Jeremy Howard, is the cleanest answer to a real problem: AI
engines need a curated, machine-readable map of a site's most
citable content, separate from what crawlers index for human users.

NeverRanked treats llms.txt as a first-class deployment artifact
alongside Schema.org JSON-LD. Both layers feed the same goal:
make a site reliably citable.

## The standard, in one paragraph

A markdown file at `/llms.txt` (root). Begins with an H1 that
names the site. Followed by a blockquote that summarizes what the
site does in one or two sentences. Then optional H2 sections —
typically `## Docs`, `## Examples`, `## API`, `## Optional` — each
listing curated links in the form `- [Title](url): one-line
description`. A companion `/llms-full.txt` may concatenate the
full content of all linked pages for direct AI ingestion.

## What good looks like

The minimum viable llms.txt is a half-dozen well-chosen links.
The maximum is a curated information architecture.

A good llms.txt:

- Has an H1 that uses the canonical brand name (matches your
  Organization schema)
- Has a one-paragraph description that mirrors your site's
  meta description
- Lists 5-30 links in 2-5 sections
- Every link points to a 200 OK URL
- Every link's title and description match the linked page's
  actual title and content
- Sections are organized by intent, not by site IA — group by
  what an AI is most likely to need

A bad llms.txt:

- Auto-generated from sitemap (no curation)
- Includes broken or 301-redirected links
- Mismatches between titles in llms.txt and titles on the page
- Over-inclusive (lists every blog post)
- Missing the H1 or blockquote
- Stale (last-modified > 90 days)

## Engine adoption status, May 2026

| Engine | Respects llms.txt? | Notes |
|---|---|---|
| Anthropic / Claude | Yes | Anthropic proposed the standard; Claude reads it preferentially |
| OpenAI / ChatGPT | Stated intent | Public statements indicate respect; behavior inconsistent in scans |
| Perplexity | Inconsistent | Sometimes follows the curated set, sometimes ignores |
| Google AI Overviews | No | Currently uses standard search index |
| Microsoft Copilot | No | Currently uses Bing index |
| Gemini | No | Currently uses Google Search index |

This table changes month to month. NeverRanked's engine changelog
(`content/engine-changelog/`) tracks shifts as they happen.

## Why this matters for AEO score

Sites that publish a curated llms.txt give the engines that respect
it a deterministic citation surface. Engines that respect llms.txt
will weight content listed there above content discovered via crawl.
Sites without llms.txt get crawled indiscriminately, with all the
noise that implies.

The compounding effect: once one major engine starts treating
llms.txt as a strong signal, the others follow. We expect this to
happen in the second half of 2026. Sites with llms.txt deployed by
that point inherit the advantage. Sites without lose two-to-three
months of citation share to faster movers.

## NeverRanked's deployment path

For each customer:

1. Audit current llms.txt (present, absent, valid, stale)
2. Generate vertical-aware template (banking, real estate, legal,
   healthcare, hospitality, education)
3. Customize with the customer's actual canonical pages
4. Deploy via the same snippet that handles schema injection
5. Track weekly: which engines respect it, what gets cited from it
6. Update quarterly as the customer's content evolves

The NeverRanked snippet handles llms.txt the same way it handles
JSON-LD: a curated, validated layer that updates as the site does.

## Anti-patterns NeverRanked refuses to ship

- **Auto-generated llms.txt from sitemap.** Curation is the point.
  An auto-gen file is worse than nothing because it dilutes the
  signal.
- **llms.txt that exposes paywalled or gated content links.** The
  engines that respect llms.txt will follow links. Linking to
  paywalled content is functionally equivalent to making it
  public.
- **llms.txt that includes affiliate or tracking parameters.**
  AI engines will cite the URL with the parameters intact. Ugly,
  noisy, sometimes leaks attribution data.
- **Different llms.txt per region or device.** The standard is one
  canonical file at /llms.txt. Region targeting goes via hreflang
  or Schema.org `areaServed`, not by serving different llms.txt
  files.

## Public commitment

NeverRanked publishes its own llms.txt at
[neverranked.com/llms.txt](https://neverranked.com/llms.txt) as
the reference implementation. Anyone can verify our position is
not aspirational by reading what we ship for ourselves.
