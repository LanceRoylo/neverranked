# A10 — Entity Registration Checklist

**What it does:** Gets Montaic registered in the entity databases AI engines use to disambiguate brands and build knowledge panels. Without these, Google can't tell "Montaic" apart from "Monti" / "Monte" / "Montana," and AI engines have no authoritative source to cite about what Montaic actually is.

**Where it goes:** External platforms. This is account creation + profile population.

**Time to implement:** 3-4 hours of focused work, spread across one or two sessions.

**Impact:** HIGHEST for the brand entity problem. This is the ONLY way to fix the "Google thinks you're Montana" issue.

---

## Priority order (do in this sequence)

1. **Wikidata** — The single most important registration. Google's knowledge graph pulls from Wikidata. Registering here is how you force Google to recognize Montaic as a distinct entity.
2. **Crunchbase** — Second most important. Crunchbase is in every major AI training corpus.
3. **LinkedIn Company Page** — Massive trust signal, required for every B2B SaaS.
4. **Product Hunt** — If you haven't launched yet, this is also a launch event.
5. **G2** — Free product listing, reviews eventually flow here, AI engines heavily cite G2.
6. **Capterra** — Same as G2 but different audience.
7. **AlternativeTo.net** — Often cited in "alternatives to X" queries.
8. **BetaList** (if pre-launch) — Cheap entity signal.
9. **SaaSHub** — Free SaaS directory that surfaces in comparison queries.
10. **Twitter/X** — Brand protection + sameAs anchor.

---

## 1. Wikidata (the single most important one)

**URL:** https://www.wikidata.org/wiki/Special:CreateAccount (to create an account)
**Then:** https://www.wikidata.org/wiki/Special:NewItem (to create the entity)

**Critical:** Wikidata has notability requirements. Brand-new startups sometimes get their entries deleted for "failing notability." To survive, make sure the entry cites at least 2 external sources — preferably a TechCrunch / HackerNews / Product Hunt mention, or a peer-reviewed industry publication reference.

**Entity fields to populate:**

| Property | Value |
|---|---|
| Label (English) | Montaic |
| Description (English) | American AI-native real estate listing content platform |
| Aliases | Montaic AI, Montaic.com |
| Instance of (P31) | software, company |
| Industry (P452) | real estate technology, artificial intelligence |
| Headquarters location (P159) | (your actual HQ city) |
| Country (P17) | United States |
| Founded (P571) | (year founded) |
| Founded by (P112) | Lance Roylo |
| CEO (P169) | Lance Roylo |
| Official website (P856) | https://montaic.com |
| Logo image (P154) | (upload to Wikimedia Commons first) |
| Subclass of | AI writing tool |

**Reference sources needed:** Wikidata requires sources for every claim. Use the Montaic homepage as the primary source for company info, and cite any press mentions or interviews as secondary sources.

**Expected result:** Within 2-7 days, Google may start showing a knowledge panel for "Montaic" when searched. This is when the Monti/Monte/Montana fuzzy matching stops.

---

## 2. Crunchbase

**URL:** https://www.crunchbase.com/person/submit-organization (or use the "Create profile" link)

**Required fields:**
- Company name: Montaic
- Website: https://montaic.com
- Industry: Real Estate Technology, Software, Artificial Intelligence
- Company type: Private
- Founded date: (year)
- Headquarters: (city, state)
- Employees: (range)
- Founders: Lance Roylo (link to LinkedIn profile if exists)
- Description: "Montaic is the AI-native listing content platform for real estate professionals and yacht brokers. MLS descriptions, social posts, fact sheets, and marketing copy in your writing style with Fair Housing compliance scanning built in."
- Logo (upload)
- Social profiles: LinkedIn, Twitter, Instagram

**Notes:** Crunchbase free profiles can be created by anyone, but claiming and editing them requires verification (usually domain-based email verification). Use `lance@montaic.com` during signup.

**Expected result:** Within 48 hours, profile is live. Crunchbase is cited by Perplexity and ChatGPT for company facts.

---

## 3. LinkedIn Company Page

**URL:** https://www.linkedin.com/company/setup/new/

**Required fields:**
- Company name: Montaic
- LinkedIn public URL: `linkedin.com/company/montaic` (claim this before someone else does)
- Website URL: https://montaic.com
- Industry: Computer Software
- Company size: (range)
- Company type: Privately Held
- Logo
- Cover image (use the Montaic hero image or generate a branded one)
- Tagline: "AI-native listing content for real estate agents and yacht brokers"
- About: Detailed description including the Montaic Method writing style calibration + Fair Housing compliance positioning

**After creation:**
- Post the Montaic introduction as the first company update
- Tag Lance's personal LinkedIn profile as an employee
- Invite existing Pro/Broker users to follow
- Start posting 2-3x per week with product updates

**Expected result:** LinkedIn Company Pages are indexed by Google within 24-48 hours and appear in the knowledge panel data for the brand name.

---

## 4. Product Hunt

**URL:** https://www.producthunt.com/posts/new

**Before posting:**
- Create a Product Hunt account for Lance
- Build a 6-8 image gallery showing Montaic's UI
- Write a tagline: "AI-native listing content for real estate agents"
- Write a description: 2-3 paragraphs that explain what Montaic does and why it's different (Fair Housing compliance angle is strong here)
- Have 5-10 users ready to upvote on launch day (don't buy upvotes, use real users)

**Launch day strategy:**
- Schedule the launch for a Tuesday, Wednesday, or Thursday at 12:01am PST
- Respond to every single comment within 30 minutes for the first 6 hours
- Cross-post to Twitter, LinkedIn, Hacker News, and r/realestate subreddit
- DM 20 real estate Twitter influencers before launch day to ask for upvotes

**Expected result:** A top 10 finish in a product category gets you a Product Hunt badge that becomes a permanent backlink from producthunt.com. Even a mid-tier finish gives you the listing as a sameAs anchor.

---

## 5. G2

**URL:** https://www.g2.com/products/new

**Process:**
1. Create a profile under "Real Estate CRM Software" or "AI Writing Assistants"
2. Fill in basic company info (similar to Crunchbase fields)
3. Upload screenshots, logo, feature list, pricing
4. Wait for G2 approval (can take 3-7 days for new products)
5. Once live, email existing Pro/Broker users asking for honest G2 reviews

**Category:**
Montaic should probably be in "AI Writing Assistants" AND "Real Estate CRM Software" if the dual categorization is allowed. G2 surfaces in both category queries.

**Expected result:** 3-7 day approval, then within 14 days of collecting first 5 reviews, Montaic starts appearing in G2's AI Writing Assistants category and gets cited by Perplexity for "best AI writing tool" queries.

---

## 6. Capterra

**URL:** https://www.capterra.com/vendors/sign-up

**Process:** Nearly identical to G2. Fill in the product info, upload screenshots, pick categories. Capterra is owned by Gartner so inclusion gives you some Gartner credibility by association.

**Category:** Real Estate Marketing Software OR AI Content Generator

**Expected result:** 5-7 day approval. Capterra is heavily cited by ChatGPT for SaaS comparison queries.

---

## 7. AlternativeTo.net

**URL:** https://alternativeto.net/add-software/

**Process:** Submit Montaic as a new software entry. List competitors (ChatGPT, Jasper, ListingAI, etc.) so Montaic gets linked as an alternative to them.

**Expected result:** Within 3-5 days, Montaic appears in "alternatives to ChatGPT," "alternatives to Jasper," "alternatives to ListingAI" queries.

---

## 8. BetaList (if you're still in growth phase)

**URL:** https://betalist.com/submit

**Process:** Submit a short pitch. BetaList prioritizes cleanly-designed startups with a distinctive angle. The Fair Housing compliance positioning should get it approved.

**Expected result:** A backlink from betalist.com (which is a high-authority domain) and visibility to early adopters.

---

## 9. SaaSHub

**URL:** https://www.saashub.com/submit-a-service

**Process:** Submit a SaaS listing. Free, no approval delay. SaaSHub surfaces in comparison queries like "best SaaS for real estate."

---

## 10. Twitter/X (if `@montaic` isn't already taken)

**URL:** https://twitter.com/signup

**Process:** Create the account. Link back to montaic.com in bio. Post the Montaic introduction.

**Expected result:** Twitter is a major sameAs anchor and the profile itself is indexed by Google.

---

## Bonus — Specific to real estate

Beyond the general SaaS registries, there are real-estate-specific platforms where Montaic should be listed:

- **PropTech Outlook** — niche real estate tech directory
- **Inman Tech Landscape** — inman.com maintains a proptech directory
- **HousingWire Tech100** — annual list, apply if you qualify
- **Real Estate Webmasters Directory**
- **NAR REACH Program** — National Association of Realtors' startup program
- **PropertyTechTimes**

Each of these is a niche backlink + entity anchor that helps Montaic rank in real estate-specific queries.

---

## Post-registration: update the Organization schema

Once each profile is live, add the URL to the `sameAs` array in the root Organization schema (from A1):

```json
"sameAs": [
  "https://www.wikidata.org/wiki/Q12345678",
  "https://www.crunchbase.com/organization/montaic",
  "https://www.linkedin.com/company/montaic",
  "https://www.producthunt.com/products/montaic",
  "https://www.g2.com/products/montaic",
  "https://www.capterra.com/p/montaic",
  "https://alternativeto.net/software/montaic/",
  "https://betalist.com/startups/montaic",
  "https://www.saashub.com/montaic",
  "https://twitter.com/montaicai"
]
```

Every URL added to `sameAs` strengthens the entity signal by 1 unit. Ten authoritative sameAs URLs is the inflection point where AI engines start treating the brand as a confirmed entity.

---

## Effort estimate

- Wikidata: 60 min (the trickiest one)
- Crunchbase: 30 min
- LinkedIn Company: 20 min
- Product Hunt: 45 min to prep the launch (plus launch day effort)
- G2: 30 min
- Capterra: 30 min
- AlternativeTo: 15 min
- BetaList: 15 min
- SaaSHub: 10 min
- Twitter: 10 min
- Real estate-specific: 60 min total

**Total active time: ~5 hours**, but can be split across two or three sessions.

**Minimum viable registration (if you only do 3):** Wikidata, Crunchbase, LinkedIn Company. These three alone will solve 60% of the brand entity problem.
