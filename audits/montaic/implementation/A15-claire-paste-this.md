# A15 Publish Path: Claire lands, Lance flips

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Scope:** Land a new blog post (HUD Just Quietly Withdrew Nine Fair Housing Guidance Documents), wire up the full JSON-LD schema payload, leave `draft: true`. Lance does the final voice read and flips the draft himself.
**Cluster context:** A15 is the third pillar in the Fair Housing cluster. A11 (`fair-housing-ai-compliance-agents`) and A12 (`fair-housing-listing-description-rules`) are the other two. A14 (`chatgpt-53-nashville-listings`) is the Listing Differentiation cross-cluster neighbor and gets a mention edge. A15 carries A11, A12, and A14 as `mentions` in the schema. Back-propagation to A11 and A12 happens in A15.P2.

---

## Sanity check before you begin

```bash
# Blog index renders
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog
# Expected: 200

# A11 is live (schema mentions and back-propagation target)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-ai-compliance-agents
# Expected: 200

# A12 is live (schema mentions and back-propagation target)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-listing-description-rules
# Expected: 200

# A14 is live (schema mentions, cross-cluster bind)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/chatgpt-53-nashville-listings
# Expected: 200 (or 404 if A14 is still draft, which is fine, just flag it)
```

If any of those fail except the last, stop and flag before creating the new post.

---

## A15.P1: Add the post to posts.ts

Add the following entry to the `POSTS` array in `apps/dashboard/lib/blog/posts.ts`. Place it after the A14 entry (`chatgpt-53-nashville-listings`). Leave `draft: true`.

```typescript
{
  slug: "hud-2026-fair-housing-guidance-withdrawal",
  title: "HUD Just Quietly Withdrew Nine Fair Housing Guidance Documents. Here Is What Still Applies to Your Listings.",
  description:
    "Federal Register Notice 2026-06624 withdrew nine Fair Housing guidance documents, not eight as trade press reported. Here is what statute and regulation still cover.",
  publishedAt: "2026-04-11",
  updatedAt: "2026-04-11",
  author: "Lance Roylo",
  readingTime: "15 min read",
  category: "Fair Housing",
  tags: ["HUD guidance withdrawal", "Federal Register 2026-06624", "Fair Housing Act", "24 C.F.R. 100.75", "digital advertising compliance", "real estate Fair Housing"],
  draft: true,
  citation: [
    { "@type": "CreativeWork", name: "Federal Register Notice 2026-06624: Notification of Withdrawal of Fair Housing and Equal Opportunity Guidance Documents (April 6, 2026)", url: "https://www.federalregister.gov/documents/2026/04/06/2026-06624/notification-of-withdrawal-of-fair-housing-and-equal-opportunity-guidance-documents" },
    { "@type": "CreativeWork", name: "HUD FHEO Notice of Withdrawal of Guidance Documents (September 17, 2025, signed by John Gibbs)", url: "https://www.hud.gov/sites/dfiles/Main/documents/Notice-of-Withdrawal-of-Guidance-Documents.pdf" },
    { "@type": "CreativeWork", name: "42 U.S.C. Section 3604 (Fair Housing Act, discriminatory housing practices)", url: "https://www.govinfo.gov/app/details/USCODE-2023-title42/USCODE-2023-title42-chap45-subchapI-sec3604" },
    { "@type": "CreativeWork", name: "24 C.F.R. Section 100.75 (Discriminatory advertisements, statements and notices)", url: "https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-B/section-100.75" },
    { "@type": "CreativeWork", name: "Texas Dept. of Housing and Community Affairs v. Inclusive Communities Project, Inc., 576 U.S. 519 (2015)", url: "https://supreme.justia.com/cases/federal/us/576/519/" },
    { "@type": "CreativeWork", name: "United States v. Meta Platforms, Inc., No. 1:22-cv-05187 (S.D.N.Y. 2022)", url: "https://www.justice.gov/opa/pr/justice-department-secures-groundbreaking-settlement-agreement-meta-platforms-formerly-known" },
    { "@type": "CreativeWork", name: "Rodriguez v. Village Green Realty, Inc., 788 F.3d 31 (2d Cir. 2015)", url: "https://law.justia.com/cases/federal/appellate-courts/ca2/13-3887/13-3887-2015-06-09.html" },
  ],
  mentions: [
    { "@type": "CreativeWork", name: "The Fair Housing Act Applies to AI Now. Here's What Every Agent Needs to Know.", url: "https://montaic.com/blog/fair-housing-ai-compliance-agents" },
    { "@type": "CreativeWork", name: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026", url: "https://montaic.com/blog/fair-housing-listing-description-rules" },
    { "@type": "CreativeWork", name: "We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.", url: "https://montaic.com/blog/chatgpt-53-nashville-listings" },
  ],
  about: [
    { "@type": "Thing", name: "Fair Housing Act" },
    { "@type": "Thing", name: "HUD FHEO guidance" },
    { "@type": "Thing", name: "Federal Register Notice 2026-06624" },
    { "@type": "Thing", name: "Real estate advertising compliance" },
  ],
  sections: [
    {
      body: `On April 6, 2026, the Federal Register published Notice 2026-06624. The notice confirms that HUD has withdrawn a set of Fair Housing and Equal Opportunity guidance documents. Industry trade press reported eight withdrawn documents. The actual count is nine.\n\nThe miss is not trivial. Items six and seven on the withdrawal list are both criminal records guidance, both issued in June 2022. One is the FHEO substantive guidance. The other is the Office of General Counsel implementation memo that operationalized it. They are listed as two separate rows in the memo table. Trade press appears to have counted them as one.\n\nThere is a second fact the Federal Register notice does not lead with. The underlying memo, signed by Principal Deputy Assistant Secretary for FHEO John Gibbs, took effect on September 17, 2025. The Federal Register caught up 201 days later. FHAP agencies and FHIP grantees were notified when the memo was signed. The general public found out this week.\n\nNeither fact changes what statute still prohibits. What they change is how well you can read what HUD intends, what your compliance vendor is actually citing, and whether any of the training materials on your shelf still point at a document that exists. This piece walks through each of the nine withdrawn items, maps each to the statute, regulation, and case law that still covers the same territory, and explains why Montaic's compliance layer did not change on either date.`,
    },
    {
      heading: "What HUD actually withdrew",
      body: `The Gibbs memo is dated September 17, 2025. The effective date is "Upon receipt." The memo names two executive orders as authority for the withdrawal action: Executive Order 14192 on deregulation, signed January 31, 2025, and Executive Order 14219 on the Department of Government Efficiency deregulatory initiative, signed February 19, 2025.\n\nHUD applies a three-part test to each guidance document under review. A document is retained only if all three hold.\n\n1. The guidance is statutorily prescribed.\n2. The interpretation is consistent with the relevant statute or regulation.\n3. The guidance decreases compliance burdens.\n\nEach withdrawn document failed at least one of the three.\n\nThe nine withdrawn items, in the order they appear in the memo table:\n\n| # | Title | Date issued |\n|---|---|---|\n| 1 | LEP Title VI Guidance for Federal Financial Assistance Recipients | January 22, 2007 |\n| 2 | FHEO Notice 2013-01: Service Animals and Assistance Animals | April 25, 2013 |\n| 3 | FHEO 2020-01: Assessing a Request for an Animal as a Reasonable Accommodation | January 28, 2020 |\n| 4 | Implementation of Executive Order 13988 on FHA Enforcement | February 11, 2021 |\n| 5 | FHEO Statement on the FHA and Special Purpose Credit Programs | December 7, 2021 |\n| 6 | Application of FHA Standards to the Use of Criminal Records | June 10, 2022 |\n| 7 | Implementation of OGC Guidance on Use of Criminal Records | June 20, 2022 |\n| 8 | FHEO Memorandum on Source of Income Testing under FHAP | February 12, 2024 |\n| 9 | FHA Guidance on Advertising through Digital Platforms | April 29, 2024 |\n\nThe memo also states that FHEO will deprioritize enforcement against parties whose conduct does not conform to the withdrawn guidance during the pendency of the withdrawal. Conduct from the 201-day gap window is not retroactively exposed.`,
    },
    {
      heading: "The 201-day gap",
      body: `The gap is a transparency story, not an exposure story.\n\nFHAP agencies and FHIP grantees received the memo when it was signed. Any state or local fair housing office running a HUD-funded enforcement program knew on September 17, 2025 that nine interpretive documents were no longer controlling. The general public did not know until this week.\n\nThat matters for two reasons. First, compliance vendors and training providers that built materials against the withdrawn items have been out of sync with the federal framework for most of a year without knowing it. Second, brokers and agents relying on those training materials have been reading an interpretive layer that HUD had already unwired.\n\nTwo notes on what the gap does not mean.\n\nIt does not mean retroactive liability. HUD's own memo deprioritizes enforcement against conduct inconsistent with a withdrawn document during the withdrawal period. A broker who wrote listings against the digital platforms guidance in October 2025 is not facing a retroactive enforcement action for that choice.\n\nIt also does not mean the statute stopped applying. Fair Housing Act section 3604 was in force every day of the 201-day gap. 24 C.F.R. section 100.75 was in force every day of the 201-day gap. Case law precedent was in force every day of the 201-day gap. The interpretive layer narrowed. The underlying floor did not move.\n\nThe reason to name the gap anyway is that it tells you something about how tight your compliance vendor's feedback loop actually is. If the vendor updated its rules on September 18, 2025, the loop is tight. If it still has not noticed, the loop is loose, and the next narrowing will catch it the same way.`,
    },
    {
      heading: "What this sits on top of",
      body: `The Gibbs memo does not land on a clean legal backdrop. It sits inside a coordinated narrowing that spans executive orders, agency enforcement priorities, and proposed rulemaking. Three shifts matter most for reading what still applies.\n\n**Executive Order 14281, signed April 23, 2025.** The order establishes federal policy to eliminate disparate impact liability to the maximum degree possible. It is the direct policy source for the narrower posture that runs through the Gibbs memo and the rulemaking below.\n\n**The September 16, 2025 FHEO enforcement priorities memo.** Issued one day before Gibbs signed the guidance withdrawal. The priorities memo deprioritizes disparate impact investigations and prioritizes facially discriminatory conduct. That is the lane Boston is being investigated in right now, under the December 11, 2025 FHEO review of the City of Boston Anti-Displacement Action Plan.\n\n**The January 14, 2026 HUD proposed rule on disparate impact.** Published in the Federal Register while the nine items sat withdrawn without public notice. The proposed rule would eliminate 24 C.F.R. Part 100, Subpart G, including section 100.500, the Discriminatory Effects standard. The rationale cites Executive Order 14281 and the 2025 Supreme Court decision in Loper Light Enterprises v. Raimondo, which overturned Chevron deference. The comment period closed February 13, 2026. The rule is not final as of the date this piece publishes. Until it is, section 100.500 and the 2015 Supreme Court holding in [Texas Dept. of Housing v. Inclusive Communities Project](https://supreme.justia.com/cases/federal/us/576/519/) still bind.\n\nTwo more items on the nine-item list were already dead-letter before Gibbs signed the withdrawal. Item 4 depends on Executive Order 13988, which was rescinded January 20, 2025. Item 1 depends on Executive Order 13166, which was revoked by Executive Order 14224 on March 1, 2025, and DOJ rescinded its related 2002 LEP guidance on April 15, 2025. Those two were formal cleanups, not new narrowings.\n\nPutting these together, the read is that the withdrawal is step three of a three-step sequence, not an isolated event. It matters for how you read the current-authority map that follows.`,
    },
    {
      heading: "What each of the nine items maps back to",
      body: `The nine withdrawn items do not leave nine holes in the law. Each one maps back to a statute, a regulation, or a case law anchor that still covers the same territory. The interpretive layer is thinner. The underlying floor is not.\n\n**Item 1, LEP Title VI guidance.** Title VI itself is unchanged. 24 C.F.R. Part 1 is unchanged. Lau v. Nichols, 414 U.S. 563 (1974), still establishes that national origin discrimination can include failure to provide language access. What is gone is the federal executive framework for how recipients should comply, because Executive Order 13166 is revoked and DOJ rescinded its related 2002 LEP guidance on April 15, 2025.\n\n**Item 2, Service and assistance animals.** FHA section 3604(f)(3)(B) still requires reasonable accommodations for disability. 24 C.F.R. section 100.204 still implements it. The detailed framework for evaluating animal requests is in interpretive limbo until HUD reissues or courts fill the gap.\n\n**Item 3, FHEO 2020-01 animal request framework.** Same statutory and regulatory anchors as Item 2. Items 2 and 3 together were the HUD rulebook on emotional support animals. Both are withdrawn. The statute still requires accommodation. The operational detail is gone.\n\n**Item 4, EO 13988 implementation.** Already dead-letter. EO 13988 was rescinded January 20, 2025. FHA section 3604 still prohibits sex discrimination. Whether Bostock v. Clayton County extends to FHA sex protections is unsettled. Agents in jurisdictions with state-level sexual orientation and gender identity protections still have state-law obligations.\n\n**Item 5, Special Purpose Credit Programs.** SPCPs are authorized under the Equal Credit Opportunity Act, 15 U.S.C. section 1691 et seq., and 12 C.F.R. section 1002.8 (Regulation B). Not FHA-primary. SPCPs remain lawful. Lenders lost HUD's coordination statement confirming FHA compatibility. The legal risk profile increased modestly. The programs are not foreclosed.\n\n**Items 6 and 7, Criminal records screening.** The pair trade press conflated. Item 6 is the FHEO substantive guidance. Item 7 is the OGC implementation memo that operationalized it. FHA section 3604 still applies. 24 C.F.R. section 100.500 still implements disparate impact, although it is proposed for elimination. [Texas Dept. of Housing v. Inclusive Communities Project](https://supreme.justia.com/cases/federal/us/576/519/), 576 U.S. 519 (2015), is still the Supreme Court anchor. The November 25, 2025 Secretary Turner letter on criminal screening narrowed the federal posture further in the 201-day gap window.\n\n**Item 8, Source of income testing under FHAP.** FHA section 3614 still authorizes pattern-or-practice enforcement. Source of income is not a federal protected class under the FHA directly, but it can be a proxy for one. FHAP agencies in states with substantially equivalent source-of-income laws continue to have state-law basis for testing. Federal affirmation that source-of-income testing qualifies as protected-class proxy testing is withdrawn.\n\n**Item 9, Digital platforms advertising.** The next section.`,
    },
    {
      heading: "Item 9, the digital platforms guidance",
      body: `Item 9 was issued April 29, 2024 and withdrawn 17 months later. It is the shortest-lived of the nine items on the list. It is also the one that sits directly on top of every online real estate listing in the country, which is why it gets the deepest read here.\n\nThe guidance was 12 pages and covered three categories of advertising tools. Audience categorization, where the platform lets advertisers select by characteristics. Custom and mirror audiences, where the advertiser uploads a seed list and the platform builds a lookalike. Algorithmic delivery functions, where the platform chooses what to show to whom regardless of advertiser intent. The guidance confirmed that the FHA reaches all three.\n\nHUD used concrete examples. A rental ad targeted to predominantly Black neighborhoods that carried "no criminal records" and "good credit only" language while an otherwise identical ad to White neighborhoods omitted the same language. A mortgage ad to men that included rate detail while the version shown to women said a mortgage was easy to get. An agent uploading an open-house attendee list as a custom audience when all the attendees were White, then letting the mirror tool amplify the demographic. HUD's position was that each of these violated [42 U.S.C. section 3604(c)](https://www.govinfo.gov/app/details/USCODE-2023-title42/USCODE-2023-title42-chap45-subchapI-sec3604) because each deterred applicants or provided unequal information on a protected basis.\n\nWhat still applies after the withdrawal is not a trivial list.\n\n42 U.S.C. section 3604(c), the discriminatory advertising prohibition, is unchanged. The ordinary reader standard for what counts as discriminatory advertising comes from [Rodriguez v. Village Green Realty](https://law.justia.com/cases/federal/appellate-courts/ca2/13-3887/13-3887-2015-06-09.html), Corey v. HUD ex rel. Walker, and White v. HUD. All three are still good law. [24 C.F.R. section 100.75](https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-B/section-100.75) is the actual phrase-level rule. It is unchanged. It prohibits using words, phrases, photographs, illustrations, symbols, or forms that convey protected-class preference.\n\nDisparate impact under 24 C.F.R. section 100.500 is in jeopardy at the regulatory level because of the January 14, 2026 proposed rule, but Texas Dept. of Housing v. Inclusive Communities Project, 576 U.S. 519 (2015), remains the Supreme Court anchor and still binds in the meantime.\n\nThe live enforcement anchor for algorithmic advertising under the FHA is [DOJ v. Meta Platforms](https://www.justice.gov/opa/pr/justice-department-secures-groundbreaking-settlement-agreement-meta-platforms-formerly-known), No. 1:22-cv-05187 (S.D.N.Y. 2022). The settlement entered on June 27, 2022 and runs through June 27, 2026. It is still active as of this publication and for roughly 77 more days after. The Meta settlement is case law for algorithmic advertising liability under the FHA, and it does not depend on the withdrawn guidance to exist.\n\nWhat the withdrawal actually changes on item 9 is the tool-level translation. The statute still reaches the same conduct. The regulation still defines the phrase-level rule. The Meta settlement still binds the largest digital ad platform in the country. What is gone is the HUD document that walked advertisers through the specific audit steps for audience tools, mirror audiences, and algorithmic delivery.`,
    },
    {
      heading: "What Montaic checks",
      body: `This is the short section. Montaic screens every generated listing against 42 U.S.C. section 3604(c), 24 C.F.R. section 100.75, and a case law corpus maintained and updated as new decisions land.\n\nNone of those authorities are on the withdrawal list. Montaic never cited any of the nine withdrawn guidance documents as the authority for a phrase-level rule. The rules Montaic enforces against a listing today are the same rules Montaic enforced against a listing on September 16, 2025, on September 18, 2025, on April 5, 2026, and on April 7, 2026.\n\nThat is a specific claim, and it sits on top of a specific choice about how the tool was built. When the compliance layer is built against statute and regulation directly, a guidance withdrawal is a news item to read, not a product update to ship. When the compliance layer is built against guidance documents, a guidance withdrawal is a rebuild.\n\nEvery other compliance vendor that cited any of the nine withdrawn items in its rules engine now has to decide whether to remove the withdrawn citations or defend them. Defending is expensive and, after April 6, 2026, awkward. Removing is faster, but it also exposes how much of the rules engine was sitting on top of an interpretive layer rather than the underlying law.\n\nMontaic did not make that choice in 2024 because of a prediction. It was made because a rules engine that cites anything other than a statute, a regulation, or a case law anchor is a rules engine that will eventually have to rebuild. The deeper argument on that point lives in [Fair Housing Act Listing Description Rules](/blog/fair-housing-listing-description-rules), which walks through the specific phrase-level rules Montaic enforces against 24 C.F.R. section 100.75.`,
    },
    {
      heading: "What agents should do this week",
      body: `Four items, in order of size.\n\n**Audit your review checklist or training materials for direct citations to any of the nine withdrawn items.** Nothing happens to the listings you already published. But any checklist that cites item 6, item 7, or item 9 as authority should be updated to cite 42 U.S.C. section 3604(c) and 24 C.F.R. section 100.75 directly. That will survive the next narrowing the same way it survived this one.\n\n**Confirm with your compliance vendor whether it cited any of the nine withdrawn items in its rules engine.** If it did, ask what it replaced the citation with. If the answer is unclear, the vendor's rules engine is probably still running on the withdrawn guidance.\n\n**Read 42 U.S.C. section 3604(c) once.** It is one paragraph. It is shorter than this section.\n\n**Keep publishing.** The underlying law did not move.\n\nOne honest note on compliance tools, which [Fair Housing Act Listing Description Rules](/blog/fair-housing-listing-description-rules) and [the 53 Nashville ChatGPT run](/blog/chatgpt-53-nashville-listings) also made in different words. No scanner catches 100 percent. The right baseline for Fair Housing compliance is a tool that cites statute, regulation, and case law directly, plus a human review pass before anything goes public. A scanner is a floor, not a ceiling, and the floor is still exactly where it was on September 16, 2025.`,
    },
    {
      heading: "Frequently asked questions",
      body: `How many Fair Housing guidance documents did HUD withdraw on April 6, 2026? Nine, not eight. Federal Register Notice 2026-06624 announced the withdrawal of nine Fair Housing and Equal Opportunity guidance documents. Industry trade press reported eight because they counted two separate June 2022 criminal records guidance documents as one item. The underlying HUD memo lists them as two distinct rows, items 6 and 7.\n\nWhen did the withdrawal actually take effect? The memo was signed September 16, 2025, dated September 17, 2025, and took effect "upon receipt" by FHEO, FHAP agencies, and FHIP grantees. Federal Register publication did not occur until April 6, 2026. The gap is 201 days.\n\nDoes this withdrawal affect listings I already published? No. The Fair Housing statute and the implementing regulations were in force every day of the 201-day gap and continue to apply. The withdrawal narrows the federal interpretive layer, not the underlying law. HUD's own memo deprioritizes enforcement against conduct inconsistent with a withdrawn document during the pendency of the withdrawal, so agents who relied on the withdrawn guidance in the gap window are not facing retroactive exposure.\n\nWhat statute and regulation still govern Fair Housing listing language? 42 U.S.C. section 3604(c) prohibits publishing discriminatory statements in connection with the sale or rental of housing. 24 C.F.R. section 100.75 implements the statute at the phrase level and prohibits words, phrases, photographs, illustrations, symbols, or forms that convey protected-class preference. Case law including Rodriguez v. Village Green Realty, Corey v. HUD, and White v. HUD establishes the ordinary reader standard for discriminatory advertising. None of these are on the withdrawal list.\n\nWhat did the digital platforms guidance cover? The April 29, 2024 guidance covered the application of the Fair Housing Act to three categories of digital advertising tools. Audience categorization, custom and mirror audiences, and algorithmic delivery functions. HUD's position was that each category could violate 42 U.S.C. section 3604(c) by deterring applicants or providing unequal information on a protected basis. The guidance is withdrawn. The underlying statute still reaches the same conduct, and DOJ v. Meta Platforms, No. 1:22-cv-05187 (S.D.N.Y. 2022), still provides the live case law anchor for algorithmic advertising liability through June 27, 2026.\n\nDoes Montaic cite any of the withdrawn guidance documents? No. Montaic's compliance layer cites 42 U.S.C. section 3604(c), 24 C.F.R. section 100.75, and a case law corpus directly. None of the nine withdrawn guidance documents are cited as authority for any phrase-level rule in the Montaic rules engine. The rules in effect on September 16, 2025 are the same rules in effect today.`,
    },
    {
      body: `HUD narrowed the guidance layer on September 17, 2025 and told the public on April 6, 2026. The statute is unchanged. The regulation is unchanged. The Supreme Court anchor for disparate impact is unchanged. The Meta settlement still binds the largest digital ad platform in the country through June 27, 2026.\n\nIf your compliance tool points at any of the nine withdrawn documents, it is pointing at something that is no longer there. If it points at 42 U.S.C. section 3604(c) and 24 C.F.R. section 100.75, it is pointing at the same place it was pointing a year ago.\n\nThe piece you are reading is the first to publish the accurate count of nine withdrawn items, the 201-day gap between effective date and public notice, and the full current-authority mapping for each of the nine. If your compliance vendor told you it was eight, that is the first thing to ask about.`,
    },
  ],
  faqs: [
    {
      question: "How many Fair Housing guidance documents did HUD withdraw on April 6, 2026?",
      answer: "Nine, not eight. Federal Register Notice 2026-06624 announced the withdrawal of nine Fair Housing and Equal Opportunity guidance documents. Industry trade press reported eight because they counted two separate June 2022 criminal records guidance documents as one item. The underlying HUD memo lists them as two distinct rows, items 6 and 7.",
    },
    {
      question: "When did the HUD guidance withdrawal actually take effect?",
      answer: "The memo was signed September 16, 2025, dated September 17, 2025, and took effect upon receipt by FHEO, FHAP agencies, and FHIP grantees. Federal Register publication did not occur until April 6, 2026. The gap between effective date and public notice is 201 days.",
    },
    {
      question: "Does the HUD guidance withdrawal affect listings I already published?",
      answer: "No. The Fair Housing statute and implementing regulations were in force every day of the 201-day gap and continue to apply. The withdrawal narrows the federal interpretive layer, not the underlying law. HUD's own memo deprioritizes enforcement against conduct inconsistent with a withdrawn document during the pendency of the withdrawal, so agents who relied on the withdrawn guidance in the gap window are not facing retroactive exposure.",
    },
    {
      question: "What statute and regulation still govern Fair Housing listing language?",
      answer: "42 U.S.C. section 3604(c) prohibits publishing discriminatory statements in connection with the sale or rental of housing. 24 C.F.R. section 100.75 implements the statute at the phrase level and prohibits words, phrases, photographs, illustrations, symbols, or forms that convey protected-class preference. Case law including Rodriguez v. Village Green Realty, Corey v. HUD, and White v. HUD establishes the ordinary reader standard for discriminatory advertising. None of these are on the withdrawal list.",
    },
    {
      question: "What did the withdrawn digital platforms guidance cover?",
      answer: "The April 29, 2024 guidance covered the application of the Fair Housing Act to three categories of digital advertising tools: audience categorization, custom and mirror audiences, and algorithmic delivery functions. HUD's position was that each category could violate 42 U.S.C. section 3604(c) by deterring applicants or providing unequal information on a protected basis. The guidance is withdrawn. The underlying statute still reaches the same conduct, and DOJ v. Meta Platforms, No. 1:22-cv-05187 (S.D.N.Y. 2022), still provides the live case law anchor for algorithmic advertising liability through June 27, 2026.",
    },
    {
      question: "Does Montaic cite any of the withdrawn guidance documents?",
      answer: "No. Montaic's compliance layer cites 42 U.S.C. section 3604(c), 24 C.F.R. section 100.75, and a case law corpus directly. None of the nine withdrawn guidance documents are cited as authority for any phrase-level rule in the Montaic rules engine. The rules in effect on September 16, 2025 are the same rules in effect today.",
    },
  ],
  cta: { text: "Grade your listing free", href: "/listing-grader" },
},
```

---

## A15.P2: Post-publish back-propagation

When A15 is live, update A11 and A12 in `posts.ts` to add A15 as a reciprocal `mentions` entry in each.

**A11 (`fair-housing-ai-compliance-agents`) mentions array:**

```typescript
// In the fair-housing-ai-compliance-agents post, update the mentions array:
mentions: [
  { "@type": "CreativeWork", name: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026", url: "https://montaic.com/blog/fair-housing-listing-description-rules" },
  { "@type": "CreativeWork", name: "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)", url: "https://montaic.com/blog/zillow-listings-all-sound-the-same" },
  { "@type": "CreativeWork", name: "HUD Just Quietly Withdrew Nine Fair Housing Guidance Documents. Here Is What Still Applies to Your Listings.", url: "https://montaic.com/blog/hud-2026-fair-housing-guidance-withdrawal" },
],
```

**A12 (`fair-housing-listing-description-rules`) mentions array:**

```typescript
// In the fair-housing-listing-description-rules post, update the mentions array:
mentions: [
  { "@type": "CreativeWork", name: "The Fair Housing Act Applies to AI Now. Here's What Every Agent Needs to Know.", url: "https://montaic.com/blog/fair-housing-ai-compliance-agents" },
  { "@type": "CreativeWork", name: "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)", url: "https://montaic.com/blog/zillow-listings-all-sound-the-same" },
  { "@type": "CreativeWork", name: "HUD Just Quietly Withdrew Nine Fair Housing Guidance Documents. Here Is What Still Applies to Your Listings.", url: "https://montaic.com/blog/hud-2026-fair-housing-guidance-withdrawal" },
],
```

Preserve whatever else is already in each mentions array. If A11 or A12 already has entries beyond what is shown here, keep them and add the A15 entry at the end. The shape above reflects the expected state after A13 and A14 reciprocal updates have landed.

Build, commit, push after the back-propagation update. Same pattern as the A11/A12 reciprocal update that shipped 2026-04-10 and the A13 reciprocal that shipped with A14.

---

## Report back to Lance

After landing:
1. Confirm `https://montaic.com/blog/hud-2026-fair-housing-guidance-withdrawal` returns 200 (may return 404 until Vercel deploys)
2. Confirm the post does NOT yet appear in the blog index at `https://montaic.com/blog` because `draft: true` hides it
3. Ping Lance with "A15 is staged, draft: true, ready for your read"
