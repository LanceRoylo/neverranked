# Contributing to NeverRanked

This is primarily a single-author repository (Lance), but enough
external eyes review commits and PRs that the working rules are
worth writing down. This file is the rule, the README is the
product overview.

## Tests

All packages with tests run on CI via `.github/workflows/test.yml`.

Local invocation:

```bash
# Per package
cd tools/reddit-tracker && npm test
cd tools/citation-gap   && npm test
cd dashboard            && npm test

# Or all together (runs ~132 tests in ~50ms)
node --test "tools/reddit-tracker/test/*.test.mjs" "tools/citation-gap/test/*.test.mjs"
cd dashboard && npm test
```

CI fires on push to `main` and on every pull request. A failing test
blocks merge by convention. Nothing currently auto-blocks the merge
button (no branch protection rule yet).

## Brand voice

NeverRanked follows the Hello Momentum brand voice rules. Output that
goes to customers (briefs, dashboards, marketing copy, generated
content) must satisfy:

- **No em dashes.** Use `--` (double hyphen), `:`, or restructure into
  two sentences. Em dashes read as AI-generated text and the rule is
  enforced via grep audits.
- **No semicolons in body copy.** Use periods. Code is exempt
  (statement terminators, `for` loops, etc.) but prose inside
  template literals, strings, and documentation is not.
- **No banned words:** unlock, leverage, effortless, seamless,
  cutting-edge, revolutionize, supercharge, elevate (in marketing
  contexts). Meta-references explaining what's banned are acceptable.
- **No emojis** in code, docs, or professional content unless
  explicitly requested. Instagram captions are an exception.

These rules apply to:

- Brief generator output (`tools/*/src/brief.mjs`)
- Dashboard HTML (`dashboard/src/**/*.ts`)
- Documentation (`content/**/*.md`, all `README.md` files, methodology
  docs)
- **Commit messages.** Yes, including subject lines. Commit messages
  are public on GitHub, get referenced in changelogs, and inform
  release notes.
- CLI help text and error messages

The rules do NOT apply to:

- Variable names, function names, or other code identifiers (e.g.
  `mdLiteToHtml` is fine, the rule is about prose not naming)
- Inline code comments describing implementation (these are usually
  fine, the rule mostly bites in user-facing strings)
- Test descriptions (a passing reference to "leverage" inside a test
  name documenting an inferGap branch is acceptable)
- Commit message bodies that quote prior brand-violation text being
  fixed (e.g. "removed `effortless` from the brief copy" -- the word
  appears as a literal reference, not in voice)

Before committing changes that touch user-facing prose, sweep with:

```bash
# Em dashes
grep -c "—" path/to/file

# Body-copy semicolons
grep -nE "[a-z]+;[ ]+[a-z]" path/to/file

# Banned words (excluding meta-references)
grep -nE "\bunlock\b|\bleverage\b|\beffortless\b|\bseamless\b" path/to/file
```

The `# em dashes after sweep` checks should return `0` for every
modified file.

## Commit message style

- Subject line: imperative mood, sentence case, under 70 chars where
  possible. No em dashes (see above). Period at end optional.
- Body: short paragraphs explaining the why, not the what. Reference
  audit findings by ID (H1, M2, L4, etc.) when applicable.
- Co-author trailers for AI-assisted commits:
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

## Plan-first discipline

The CLAUDE.md global instruction "Plan First" applies to AI-assisted
work in this repo. Before any non-trivial code change:

1. Outline the plan in the conversation, including affected files
   and rollback points.
2. Get explicit approval.
3. Then execute.

Trivial fixes (typos, single-line tweaks) can skip the plan step.
Multi-file features cannot.

## Audit checkpoints

For larger sessions, it's normal to insert audit pauses. The pattern
is: ship a coherent unit of work, then explicitly review (test
coverage, voice scan, doc drift, edge cases) before continuing. The
audit is the discipline. The resulting commits are the artifact.
