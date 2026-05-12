# Engine Changelog

A weekly log of how the seven AI engines (ChatGPT, Perplexity, Claude,
Gemini, Microsoft Copilot, Google AI Overviews, and Gemma) change the
way they cite and rank sources.

This is a moat asset. The longer it runs, the more it documents what
nobody else is tracking. It also feeds the marketing site as
indexable AEO authority content.

## How entries are generated

1. Each Monday, the citation tracker runs the same control prompt set
   it ran the previous Monday.
2. Diffs in citation patterns, source weighting, schema sensitivity,
   or response structure get logged.
3. Each entry is dated, names the engine, names what changed, and
   links to the test prompt that surfaced it.

## Format

Entries live in this folder as `YYYY-MM-DD-<slug>.md`. One entry per
distinct observation. Short. Verifiable. No speculation about why the
engine changed — only what changed and what it means for citation
strategy.

## Why this exists

When ChatGPT changes how it weights schema, in-house teams find out
months later if at all. Customers paying for the recurring tracking
layer find out the same week. This changelog is the public-facing
proof that the layer works and that we are watching.
