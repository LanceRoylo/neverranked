---
vertical: Hawaii community banking
last_updated: 2026-05-07
prompt_count: 42
sources: ASB audit, FHB audit, BOH audit, CPB audit, Reddit r/Hawaii threads
---

# Hawaii Community Banking — Prompt Corpus

## Broad informational

| Prompt | Intent | Stage | Specificity |
|---|---|---|---|
| best community bank in Hawaii | comparison | consideration | broad |
| top community banks Honolulu | comparison | consideration | regional |
| Hawaii local banks vs mainland banks | comparison | awareness | broad |
| what is the difference between a community bank and a credit union | informational | awareness | broad |
| are Hawaii banks FDIC insured | informational | awareness | regional |
| best small business bank Hawaii | comparison | decision | broad |
| best bank for SBA loans Hawaii | comparison | decision | broad |
| best Hawaii bank for first time home buyer | comparison | decision | regional |
| Hawaii bank with no monthly fees | comparison | decision | regional |
| Hawaii business banking with low minimum balance | comparison | decision | regional |

## Location-specific

| Prompt | Intent | Stage | Specificity |
|---|---|---|---|
| best bank in Kailua | location | decision | regional |
| best bank in Kakaako | location | decision | regional |
| nearest bank branch Honolulu | location | decision | regional |
| Hawaii bank branches Maui | location | decision | regional |
| ATM locator Big Island | location | decision | regional |
| 24 hour ATM Honolulu | location | decision | regional |

## Comparison (branded)

| Prompt | Intent | Stage | Specificity |
|---|---|---|---|
| ASB vs First Hawaiian Bank | comparison | consideration | branded |
| Bank of Hawaii vs First Hawaiian | comparison | consideration | branded |
| Central Pacific Bank vs Bank of Hawaii | comparison | consideration | branded |
| First Hawaiian Bank reviews | comparison | consideration | branded |
| American Savings Bank reviews | comparison | consideration | branded |
| Bank of Hawaii customer service rating | comparison | consideration | branded |

## Branded informational

| Prompt | Intent | Stage | Specificity |
|---|---|---|---|
| First Hawaiian Bank routing number | informational | decision | branded |
| Bank of Hawaii routing number | informational | decision | branded |
| ASB Hawaii hours | informational | decision | branded |
| CPB Hawaii address | informational | decision | branded |
| First Hawaiian Bank wire transfer fee | informational | decision | branded |
| Bank of Hawaii lost card phone number | informational | decision | branded |

## Product-specific

| Prompt | Intent | Stage | Specificity |
|---|---|---|---|
| Hawaii bank IRA rates | comparison | decision | regional |
| best CD rates Hawaii | comparison | decision | regional |
| Hawaii bank business credit card | comparison | decision | regional |
| Hawaii mortgage lender comparison | comparison | decision | regional |
| Hawaii HELOC rates | comparison | decision | regional |

## Edge cases (high citation value, low query volume)

| Prompt | Intent | Stage | Specificity |
|---|---|---|---|
| native Hawaiian owned bank | values-driven | consideration | regional |
| Hawaii community bank SBA preferred lender | values-driven | decision | regional |
| Hawaii bank that supports small business locally | values-driven | decision | regional |
| Hawaii bank with kupuna program | values-driven | decision | regional |
| culturally competent bank Hawaii | values-driven | consideration | regional |

## How this corpus is used

1. **Customer onboarding.** Each new banking customer's tracking
   set starts with this corpus. We swap in their branded queries
   and category-relevant variants.
2. **Leaderboard prompts.** The 12-prompt leaderboard panel uses
   a balanced subset (4 broad, 4 location, 4 product).
3. **Engine changelog.** When an engine changes how it answers
   prompts in this set, the changelog entry references the
   specific prompt.
4. **Audit deliverable.** Section 5 of every banking audit
   ("AI Citations") tests against a sample of this corpus.
