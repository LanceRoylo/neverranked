# A{N}: {Topic Title} Pillar Article

**Client:** {client-name}
**Action:** A{N} (Pillar article)
**Roadmap source:** `audits/{client-name}/07-roadmap.md` line {L} — {one-line quote}
**Skeleton:** `remediation-template/content-skeletons/pillar-article-skeleton.md`
**Voice rubric:** `remediation-template/voice-rubric-v0.md`
**Reference implementation:** `audits/montaic/implementation/A11-fair-housing-pillar-article.md` _(delete this line if client IS Montaic)_
**Neighbor reference (cluster only):** `audits/{client-name}/implementation/A{N-1}-{neighbor-slug}.md` _(delete if not part of a cluster)_
**Status:** pending

---

## Topic

{Declarative title with specific stakes. Not "a guide to X" — "X is broken, here's the fix by Y date".}

## Why this topic for this client

{2-3 sentences. What does this client know that their competitors don't? What's the statute / authority / positioning lever that makes this piece distinctive? If you cannot answer, stop and rethink the topic.}

## Authority anchor (skeleton section 4)

{Primary statute, court decision, regulatory document, or named industry authority the piece builds on. The piece should feel like the client is showing you how the underlying source actually works, not summarizing what a blog post would say.}

## Required external citations (exactly 5)

Per pillar-article-skeleton rule: exactly five external primary-source citations, no fewer.

1. {source 1}
2. {source 2}
3. {source 3}
4. {source 4}
5. {source 5}

## Skeleton section checklist

Tick each as it's drafted. Order matches `pillar-article-skeleton.md`.

- [ ] Title (declarative, specific stakes)
- [ ] Meta description (<=155 chars, does not repeat title phrase)
- [ ] TL;DR (80-150 words)
- [ ] Statute / authority section
- [ ] Two to three "things worth understanding"
- [ ] Real-world problem (3-5 paragraphs)
- [ ] Violations / gotchas list (5-7 items)
- [ ] What to do about it (4 steps)
- [ ] What {client} does differently (product section, first-person origin)
- [ ] FAQ (5-8 questions, marked up as FAQPage schema)
- [ ] Closing + CTA

## Voice rubric pass (pre-publish)

Run `remediation-template/voice-rubric-v0.md` and confirm each hard-fail is clean:

- [ ] Em dash count: 0
- [ ] Semicolon count in marketing prose: 0
- [ ] AI filler phrase scan: clean
- [ ] Meta description does not start with title phrase
- [ ] No emojis in body
- [ ] Closing does not restate the intro
- [ ] Swap test: would it feel wrong if a competitor published it? (If no, rewrite.)
- [ ] Lever test: can you name the creative lever? (If no, rewrite.)

## Schema required

- BlogPosting (primary)
- FAQPage (from the FAQ section)
- BreadcrumbList

All three in a single `@graph` payload on the page. Match the pattern in the Montaic reference.

## Verification

After publish, from the neverranked repo root:

```sh
./scripts/verify-deploy.sh \
  https://{client-domain}/blog/{slug} \
  https://{client-domain}/blog \
  https://{client-domain}/sitemap.xml
```

Expected: 5/5 checks pass. Then paste the Rich Results Test URL printed by the script and confirm 0 errors on the live URL.

Record the pass date in the client implementation README's status table.

---

## Draft notes

{Scratch space. Outline, source excerpts, angle options, tension between the client's voice and the topic. Delete anything here before the client sees this file.}
