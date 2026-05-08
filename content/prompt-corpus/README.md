# Prompt Corpus

The actual prompts buyers ask AI engines in specific verticals,
collected from real customer queries, audit work, and category
research. Used as the canonical test set for measuring citation
share within a vertical.

## Why this exists

Citation tracking is only useful if the prompts being tracked are
the prompts customers actually ask. Generic AEO tools test against
generic prompts. We test against the prompts buyers in a specific
vertical genuinely use.

The corpus is also a moat asset. Each new vertical we add deepens
the dataset competitors cannot reproduce without doing the same
ground-up category research.

## Structure

One file per vertical. Each prompt is tagged by:

- **intent** — informational / comparison / location / branded
- **buyer_stage** — awareness / consideration / decision
- **specificity** — broad / regional / branded
- **engine_observation** — which engines have we observed citing
  for this prompt (filled in as data accumulates)

## How prompts get added

1. Direct customer interviews ("when you Google or ChatGPT for
   X, what do you actually type?")
2. Audit-discovered queries (FAQ pages, search bar logs if
   available, contact form intent fields)
3. Reddit / Quora threads in the category
4. Google Search Console if customer shares it
5. People Also Ask boxes for known vertical queries
