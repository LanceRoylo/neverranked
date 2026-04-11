# A{N}: Title Tag + Meta Description Rewrites

**Client:** {client-name}
**Action:** A{N} (Title and meta description rewrites for under-optimized pages)
**Roadmap source:** `audits/{client-name}/07-roadmap.md` line {L}, quote: {one-line quote}
**Reference implementation:** `audits/montaic/implementation/A9-title-meta-rewrites.md` _(delete this line if client IS Montaic)_
**Voice rubric:** `remediation-template/voice-rubric-v0.md` _(meta descriptions are marketing prose and must pass the rubric)_
**Status:** pending

---

## What it does

Rewrites the title and meta description for every under-optimized page the technical audit flagged. Titles under 30 characters leave keyword space on the table. Meta descriptions over 160 characters get truncated with an ellipsis. Meta descriptions that echo the title phrase waste the second-most-valuable piece of SERP real estate. These rewrites are small edits that compound with the schema and canonical work in A1/A7.

## Where it goes

Page-level metadata in each page file. Each page is a 30-second edit. Framework-specific:

- Next.js App Router: update `metadata` export in `page.tsx`
- Next.js Pages Router: `<Head>` component in each page
- Astro: frontmatter `title` and `description` passed into the layout
- Hugo: front matter in `.md` files
- Plain HTML: edit `<title>` and `<meta name="description">` directly

---

## Inputs the client must provide

- **Audit findings.** The list of pages with under-optimized titles or metas (from the technical audit's keyword report).
- **Brand name.** Whether it appears first, last, or not at all in titles.
- **Primary keywords.** The commercial-intent keywords the client is targeting per page.
- **Terminology decisions.** Any words the client specifically wants or does not want (e.g., "voice" vs "writing style," "platform" vs "tool").
- **Current titles and metas.** Baseline snapshots so before/after diffs are clean.
- **Page priority.** Which pages are the top 4-6 to do first (homepage, pricing, top tool/feature, top landing page).

## Rewrite rules (lock these before drafting)

1. **Title length.** 50 to 65 characters. Under Google's truncation point, dense enough for 2 to 3 keyword concepts.
2. **Title format.** `[Primary Keyword] [Differentiator] {client-name}`. Brand always goes last (or first consistently. Pick one and stick to it).
3. **Meta description length.** 140 to 155 characters. 160 is the public limit but Google truncates earlier on mobile.
4. **Meta description format.** `[What it is]. [Who it is for]. [Key differentiator].` Three short sentences max.
5. **No em dashes in meta descriptions.** Some crawlers interpret them as word boundaries. Also a voice-rubric hard fail.
6. **Meta description must not start with the title's opening phrase.** Google shows both in SERPs. Duplication burns snippet space.
7. **No AI filler phrases.** Runs through the voice rubric. The canonical banned list lives in `remediation-template/voice-rubric-v0.md`. Any phrase on that list is a hard fail in title or meta.
8. **Client terminology lock.** Once the client's word list is settled, every rewrite uses those words and avoids the banned ones.

## Fill-in checklist

For each page being rewritten:

- [ ] Current title captured (with character count)
- [ ] Current meta captured (with character count)
- [ ] New title drafted, 50 to 65 chars
- [ ] New meta drafted, 140 to 155 chars
- [ ] New meta does not start with the title's first 4 words
- [ ] No em dashes in the new meta
- [ ] No banned filler phrases in title or meta
- [ ] Client terminology lock respected
- [ ] Primary commercial keyword appears in the title
- [ ] Run `./scripts/voice-check.sh` against the metadata block and confirm clean

## Schema required

None. This action is `<title>` and `<meta name="description">` only.

## Validation

After deploy, verify each rewritten page:

```sh
# Title tag check
curl -s {production-url} | grep -oE '<title>[^<]+</title>'

# Meta description check
curl -s {production-url} | grep -oE '<meta[^>]*name="description"[^>]*>'
```

Then:

1. Paste each URL into a SERP snippet simulator (e.g., [mangools SERP simulator](https://mangools.com/free-seo-tools/serp-simulator)) to confirm the title and meta display without truncation
2. Spot-check on mobile. Truncation happens earlier there.
3. Re-run voice-rubric check on the final metadata block if it changed during review

Record the validation date in the client implementation README's status table.

---

## Notes

{Scratch space. Before/after diffs, terminology tension, client pushback on specific rewrites. Delete before the client sees this file.}
