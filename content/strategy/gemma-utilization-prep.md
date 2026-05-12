---
title: "Where Gemma fits in NeverRanked"
prepared: 2026-05-10
status: discussion prep for tomorrow
source: https://ai.google.dev/gemma/docs/core
---

# Gemma + NeverRanked: where it fits, where it doesn't

Discussion prep for tomorrow. The goal is to figure out whether adding
Gemma (Google's open-weight LLM family) to the stack is a strategic win,
a tactical cost-saver, or a distraction.

## What Gemma is, in one paragraph

Gemma is Google's family of open-weight LLMs -- the same lab as Gemini,
but the weights are released publicly and the models can be run anywhere
(your laptop, a GPU server, Vertex AI, Hugging Face Inference Endpoints,
Together AI, Replicate, Modal). Production uses Gemma 4 31B Instruct
(the largest serverless Gemma variant on Together as of May 2026).
Multimodal in the larger sizes. Commercially usable
under a permissive license. Not a hosted product like ChatGPT -- it's a
model you call via API or run yourself.

## Three plausible utility paths for NR, ranked by strategic fit

### A. Add Gemma as the 7th tracked engine on The Citation Tape (strongest fit)

**The idea:** the Citation Tape currently measures citation share across 6
commercial AI engines (ChatGPT, Perplexity, Claude, Gemini, Microsoft
Copilot, Google AI Overviews). Adding Gemma -- queried via Vertex AI or
a hosted endpoint -- makes it 7. The angle in the sales story becomes:

> "We measure across both commercial APIs (closed-weight) and open-weight
> models (transparent). Open-weight models are what most companies
> actually run in production for internal AI tools. If your brand isn't
> being cited there, you're invisible to a fast-growing share of the
> AI surface."

**Why this is the strongest fit:**
- The Citation Tape is positioned as "reproducible from public schema."
  An open-weight model strengthens that claim materially -- anyone with
  the model weights can re-run our queries and verify our numbers
- Differentiates from Muck Rack and other AEO competitors who only
  test commercial APIs
- The query pattern is identical to existing engines (just another
  `runGemma()` async closure in the Promise.allSettled engine fan-out)
- Cost is comparable or lower than the commercial APIs we already use
- Strengthens the "we measure where AI actually lives, not just where
  it shows up" positioning

**Effort:** ~2-3 hours. New `runGemma` engine handler in
`dashboard/src/citations.ts`, new env secrets, snapshot aggregator
extension for the 7th engine label. Same pattern as adding any engine.

**Open question:** which hosted Gemma endpoint? Three options:
  - **Vertex AI** (Google's hosted Gemma) -- ~$0.50 per 1M input tokens
    for Gemma 27B. Same auth pattern we just set up for GSC (service
    account JWT). Cleanest from an infra-coherence standpoint.
  - **Together AI** -- ~$0.30 per 1M input tokens. Simpler API key auth.
    Fastest to integrate.
  - **Self-hosted on Modal or Replicate** -- ~$0.20 per 1M tokens
    amortized but more ops overhead. Probably overkill.

**Recommendation:** start with Together AI for speed-to-ship, migrate
to Vertex AI later if we want fewer vendor relationships.

### B. Replace OpenAI in AEO scoring + schema generation (cost-saver, modest strategic value)

**The idea:** the AEO scoring pipeline and schema generators both call
OpenAI for content evaluation. Swapping in Gemma reduces per-call cost
~5-10x and makes the methodology fully open-weight.

**Why it's a modest fit:**
- Cost savings are real but small at current scale (~$50-200/month max)
- "Our methodology runs on an open-weight model anyone can audit" is a
  decent transparency claim, but most customers won't care about the
  underlying model -- they care about the score being right
- OpenAI is a known-good baseline for content evaluation; swapping
  carries quality risk that needs A/B testing

**Effort:** ~1 hour to swap one call site, plus several hours of A/B
testing to make sure Gemma's scores correlate with OpenAI's on the
same content.

**Recommendation:** defer. Not worth disrupting a working scoring
pipeline for a small cost win, unless the open-weight transparency
becomes a sales objection from a specific customer.

### C. Run Gemma locally for fast/cheap iteration on prompt engineering (developer ergonomic)

**The idea:** when we're iterating on AEO scoring prompts or audit
content prompts, running Gemma locally on a MacBook (via Ollama or
LM Studio) gives instant feedback without burning API calls.

**Why it's worth a mention but not a project:**
- Useful for Lance + Claude pair-programming on prompts
- Doesn't ship to production; just speeds up local dev
- Already possible today without any code change

**Effort:** zero (just `brew install ollama && ollama pull gemma3:27b`, or
pull whatever Gemma generation is current on Ollama -- production runs
Gemma 4 31B on Together but any open-weight Gemma is fine for local prompt work)

**Recommendation:** install it tomorrow, use it ad-hoc for prompt work.

## What Gemma does NOT do for NR

- **It is not a hosted "AI search" with an answer interface.** Unlike
  Perplexity or ChatGPT, you don't ask Gemma "what's the best community
  bank in Hawaii" and get an answer with citations. You ask Gemma and
  get text generation. We construct the "is the brand named" measurement
  ourselves the same way we do for Anthropic (which also has no
  search-engine front-end). So Gemma's citation-share signal is more
  like "would this model surface your brand if asked" rather than
  "does Gemini AI Overview cite you."
- **It does not give us access to Google's search infrastructure.** That
  remains gated by Gemini's API and AI Overviews via DataForSEO.
- **It is not a substitute for any of the 6 commercial engines we
  already track.** It's an addition, not a replacement. (Decision
  locked 2026-05-10: Gemma shipped as the 7th engine on 2026-05-10
  evening HST. This doc is the prep that led to that decision.)

## The strategic question to answer tomorrow

Is adding "open-weight engine coverage" to the Citation Tape's sales
narrative worth ~3 hours of engineering plus an ongoing API cost?

My read is yes, but only if it's framed correctly in the sales story.
"We measure across commercial and open-weight engines" is a real
differentiator. Just adding a 7th engine for completeness without that
narrative is incremental at best.

Worth pairing with the May 22 release: the Citation Tape rebrand goes
live, we ship Gemma coverage at the same time, the public methodology
page says "we measure across 7 engines including the leading open-weight
model so anyone can reproduce our numbers."

## What to discuss tomorrow

- [ ] Sales story: does "open-weight engine coverage" actually move
      meetings, or is it noise for our customer profile?
- [ ] Cost: ~$10-50/month additional ongoing API cost at current scale.
      Acceptable?
- [ ] Hosted endpoint: Together AI for speed, or Vertex AI for
      infra-coherence?
- [ ] Timing: ship for May 22 release, or hold for a bigger moment?
- [ ] Lance's own use case: do you want Ollama installed locally for
      prompt iteration tomorrow morning?

## Adjacent thought: Gemma 3 is multimodal

The 12B and 27B sizes can read images. That opens a small door for
features like "scan the customer's actual website screenshots and score
them on visual hierarchy / AI-readability" -- but this is speculative
and unrelated to current roadmap. Flagged here for completeness, not
for action.
