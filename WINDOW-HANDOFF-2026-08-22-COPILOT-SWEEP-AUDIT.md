# WINDOW HANDOFF — Copilot-sweep damage audit, 2026-08-22

Read-only audit of the public site after the 2026-08-22 scripted sweep
(commits 78a636f, bd8db6a, c9e8941, 73a55b2). The sweep reclassified
"Microsoft Copilot" -> "Bing search (control)", changed seven AI tools ->
six and five citation-grade -> four, and retired the first-mover claim on
24 pages. check-claims.mjs and the other six gates pass; everything below
is what they cannot see. ~120 defects across ~45 files. Nothing has been
fixed yet — this file IS the work list.

Tags: [MEANING] = the sentence now asserts something different or false
(retired claim surviving, Copilot behavior claimed from data that does not
exist, number mislabeled). [WORDING] = reads broken or machine-edited.

## Standing rules — do not violate while fixing

- Measured figures stay. Zero numerators, percentages, mention counts
  (802, 801, 792, 810, 787, 779, 559, 191, 5,775, 5,836, 0%, 2%...) were
  deliberately KEPT. Do not recompute a measured number to make a label fit;
  fix the label. One exception flagged below (atlas-preview 37%) needs
  verification against source data before deciding.
- "7 measured surfaces" and "378 calls" are INTENTIONAL wherever the count
  covers everything queried (6 AI tools + Bing control). 18 x 3 x 7 = 378.
- House formulation to converge on (from vs/index.html:115, the cleanest on
  the site): "7 surfaces: 4 citation-grade AI + 2 model-knowledge + 1
  search control." Prose version: "six AI tools plus a Bing organic
  control — seven measured surfaces."
- The control does not cite, answer, mention, recognize, or get pushed.
  House verb: "Bing organic returns...".
- The retired first-mover claim must not survive in any wording. Replacement
  is the boundary: whether ranking in Bing organic changes any AI answer is
  not something the measurement tested.
- No sentence may claim Copilot behavior "in our data". There is no Copilot
  data; the channel measured Bing organic top-5.
- check-claims walks dist/, not source. No fix is verified until rebuild.
- HTC (Hawaii Theatre Center) is a NON-PAYING beta client. Rank stakes
  accordingly.

## TIER 1 — Live deliverable promise (fix first)

### hawaii-wealth-aeo/index.html
- [x] :152 [MEANING] "We report which firms Copilot cites today and where
      Bing organic visibility sits for the named queries, run over run."
      Promises Copilot citation reporting we cannot produce for anyone who
      signs. -> "We report where Bing organic visibility sits for the named
      queries, run over run."
- [x] :151 [MEANING] "In our data, Copilot answers track Bing organic
      results, so the firms ranking in Bing organic ... are the ones
      Copilot currently cites, and absent firms are absent." Delete or
      rewrite as a plain control statement + boundary.
- [x] :166 [MEANING] "(2) the Bing organic visibility that Copilot
      citations track in our data," -> "(2) Bing organic visibility,
      tracked as a classic-search control,".
- [x] :162 [WORDING] "four citation-grade engines that search the live web
      (Perplexity, ChatGPT search, Gemini grounded, Bing search (control),
      Google AI Overviews)" — five items under "four". Move control out:
      "... (Perplexity, ChatGPT search, Gemini grounded, Google AI
      Overviews) ... alongside Bing organic as a classic-search control."

## TIER 2 — Sent pitches and their preview images

### pitch/hamada-financial-group/index.html (sent to Shawn Hamada 2026-05-05)
- [x] :199-208 [MEANING] Path 3 lost its rationale: it sells Bing-ranking
      investment while disclaiming twice (:200, :206, near-identical
      sentences) that it may change nothing. Cut Path 3 and renumber
      ("Three concrete paths" at :176 -> two), or demote to a
      control-observation note.
- [x] :199 [WORDING] h3 "Path 3. Show up in Bing search (control) (the gap
      everyone has)" — double parenthetical; "show up in a control" is
      self-contradicting.
- [x] :200 [WORDING] "whichever firm shows up first in Bing search results
      for these questions would be the one classic search surfaces" —
      tautology left where the first-mover claim was cut. Delete clause.
      Also "Bing search (control) mentions zero Hawaii wealth-management
      firms" -> "Bing organic returns no Hawaii wealth-management firm in
      its top 5."
- [x] :201 [MEANING] "Hamada appears in Bing search (control) for 3 to 5 of
      the 17 open-ended questions within 90 days, ahead of any other Hawaii
      wealth manager." Last surviving first-mover clothing, and a goal
      state for a control (category error). Delete with Path 3.
- [x] :206 [WORDING] boundary sentence pasted as third bullet of a
      requirements list; duplicates :200. Remove from list.
- [x] :208 [WORDING] "Hamada appearances on Bing search (control) per
      measurement window" -> "Hamada's appearances in Bing organic top-5
      results per measurement window."
- [x] :92 [MEANING] "all 6 AI tools ... across ChatGPT, Perplexity, Gemini,
      Bing search (control), Google AI Overviews, Claude, and Gemma" —
      count six, list seven, control mid-list. -> list six, "plus Bing
      organic search as a control."
- [x] :101 [WORDING] table header "AI tool" over seven rows incl. control.
      -> "Surface", rule off the control row.
- [x] :121-133 [MEANING] column "AI tools" with values 6/7, 5/7, 4/7, 3/7 —
      denominator is surfaces. -> "Surfaces (of 7)".

### pitch/hamada-financial-group/og.html + og.png
- [x] og.html:27 [MEANING] recipient tag "Wealth Advisor · Seven Engines ·
      AEO Audit" -> "Six AI Tools".
- [x] og.png STALE — last rendered 2026-05-10 (commit c293a97), still shows
      "Seven Engines". Re-render after og.html fix. THE HTML EDIT ALONE
      DOES NOTHING for link previews.
- [x] og.html:28 [WORDING, low confidence] h1 "Five things AI engines can't
      see" — nothing in the brief is a set of five. Confirm before
      re-render.

### pitch/asb-hawaii/index.html (sent to Mark Cunningham, ASB, 2026-04-29)
- [x] :269 [MEANING] "Four engines that search the live web ... Two engines
      that answer purely from model knowledge ... We watch all seven" —
      4+2=6; the seventh (control) never introduced. Introduce it as a
      third thing, then "all seven surfaces".
- [x] :272 [MEANING] "Citation-grade engines (5). Perplexity. ChatGPT with
      web search. Gemini with grounded search. Bing search (control) via
      Bing. Google AI Overviews via DataForSEO. These pull from the live
      web and surface their sources." Three defects: (5) never became (4);
      "via Bing" dangler (was "Microsoft Copilot via Bing"); control
      asserted to surface sources. Split: "Citation-grade engines (4). ...
      Control channel (1). Bing organic search, top-5 results. Classic
      keyword search, not an AI answer."
- [x] :476 [WORDING, low confidence] "one-fifteenth the depth" — check
      whether derived from the retired 7-engine denominator; if not
      reconstructable, use "a fraction of the depth".

### pitch/asb-hawaii/og.html + og.png
- [x] og.html:103 [MEANING] tag "Seven Engines · Schema Layer · AEO Audit"
      directly above an h1 saying "the six AI tools". -> "Six AI Tools".
- [x] og.png STALE — still renders "Seven Engines" and "the seven AI
      engines that now route banking decisions." Re-render.

### first-look/prince-waikiki/index.html (prospect verbally committed)
- [x] :145 [MEANING] "the full seven-tool version of any of this" in the
      closing CTA — hyphenated form slipped the patterns. -> "six-tool".
- [x] :87 [WORDING] "no presence on Bing Business Profile, which feeds
      Bing's organic results" — circular rewrite of the known-garbled
      sentence; explains nothing to the reader. -> "...no Bing Business
      Profile at all, one of the entity signals search and AI systems read
      when deciding whether a business exists."
- [x] :10 [WORDING] comment "NOT the formal 18Q / 7-tool / 3-run protocol"
      -> 6-tool.

### pitch/hulas/index.html (Jack Law leave-behind, live)
- [x] :89 [WORDING] same circular Bing Business Profile sentence as Prince
      Waikiki :87. Same fix.
- [x] :9 [WORDING] comment "18-question / 7-tool / 3-run" -> 6-tool.

### Orphaned pitch OG cards (nothing links them; cleanest fix is deletion)
- [x] pitch/blue-note-hawaii/og.html:27, pitch/darrell-chock/og.html:27,
      pitch/hawaii-energy/og.html:27 — "Seven Engines" recipient tags. The
      briefs behind them are retired stubs. Delete the dead og.html/og.png
      pairs rather than editing dead files.

## TIER 3 — Homepage (index.html)

- [x] :751-753 [MEANING] "378 prompts per run" beside "18 questions x 3
      reps x 6 AI tools per run (5 citation-grade)". 18x3x6=324; and
      citation-grade is four. -> "18 questions x 3 reps x 7 measured
      surfaces (6 AI tools + Bing control)".
- [x] :1009-1017 + :797, :800, :828 [MEANING] citation map renders SEVEN
      engine rows under copy saying "Six AI tools" (lead, sr-only, foot).
      Mobile short label for cop is literally 'Copilot' (:1013). Either
      drop the control row from the visual or caption as six tools plus a
      control; fix short label to 'Bing (control)'. Comment :1008
      "Canonical 5+2 order" -> 4+1+2.
- [x] :1344, :1346, :1363 [MEANING] standings board: aria-label and eyebrow
      say six AI tools; ENGINES array renders 7 chips including 'Copilot'.
- [x] :1403-1414 [MEANING] "Six AI tools" h2 over SEVEN chips; group label
      "Five · citation-grade"; control styled as a grade chip inside that
      group. -> "Four · citation-grade" + separately styled control chip.
- [x] :1914 [WORDING] Atlas demo "37 mentions across 6 AI tools ...
      Perplexity ... Google AI Overviews ... The other 5 tools" — 2+5=7.
      -> "other 4 tools".
- [x] :1566 [MEANING] "The long tail sits open on Copilot." -> "in the Bing
      organic control."
- [x] :1770 [MEANING] "what 6 AI tools cite + the Copilot opening" -> "+
      the Bing organic gap".
- [x] :1578 [WORDING] "The first Honolulu practice that ranks first on Bing
      organic would be the one classic search surfaces." first/first
      repetition, near-tautology. Tighten.
- [x] :9-10 [WORDING] head comment "Two of the six AI tools we measure
      (Google AI Overviews, Copilot via Bing)" — see shared-comment class
      in Tier 8.

## TIER 4 — Retired claims surviving in substance (teardowns + verticals)

### teardowns/dental-honolulu/index.html
- [x] :85 [MEANING] headline: "Bing search (control) (via Bing) cites the
      practices' own websites zero times ... The Copilot gap is
      cohort-wide, which means whichever practice shows up first in Bing
      organic results owns that AI surface while every competitor is still
      invisible." First-mover claim intact + "(via Bing)" garble + "The
      Copilot gap". Rewrite with the boundary.
- [x] :233-234 [MEANING] "The Copilot row is the finding ... Copilot cited
      independent third-party content 83% ... So Copilot has nothing else
      to cite." The table row is labeled Bing search (control) — "the
      Copilot row" matches nothing. -> "The Bing control row ... the Bing
      top results were ... So there is nothing else in the top results to
      count."
- [x] :238 [MEANING] "effectively owns the Bing search (control) answer
      while every competitor is still invisible there." Ownership claim on
      a control's nonexistent "answer". Heading above is bare "The gap" ->
      "The Bing organic gap". Body -> ranks-first observation + boundary.
- [x] :94 + :134 [WORDING] TOC + h2 "Per-AI-tool breakdown, the cohort-wide
      Copilot gap" and id per-ai-tool-breakdown-the-cohort-wide-copilot-gap.
      Rename heading + id + TOC href together (model: hvac/med-spa's
      id="the-bing-search-control-gap").

### teardowns/law-firm-hawaii/index.html
- [x] :234-235 [MEANING] "The Copilot row is the same finding ... Copilot
      cited independent third-party content 81% ... So Copilot has nothing
      else to cite." Mirror the dental rewrite.
- [x] :240 [MEANING] "effectively owns the Bing search (control) answer" —
      same fix as dental :238.
- [x] :95 + :135 [WORDING] copilot-gap heading/id/TOC — same rename.

### teardowns/real-estate-honolulu/index.html
- [x] :243 [MEANING] "Copilot answers from Bing organic results ...
      whichever local firm becomes the answer Bing surfaces first owns the
      Copilot result while every competitor is invisible there." Fully
      intact first-mover claim + Copilot attribution, under heading "The
      opening, such as it is". Rewrite as condition + Zillow context +
      boundary.

### teardowns/cross-category/index.html
- [x] :462 [MEANING] "whichever firm shows up first in Bing's organic
      search results ... gets the Copilot answer mostly to itself ... It is
      a Bing search (control) pattern across local-service queries."
      First-mover claim + label jammed as adjective. Rewrite with boundary.
- [x] :366 [MEANING] table caption "Copilot points at no one's own site, so
      first into Bing organic takes the slot uncontested." -> "Bing's
      organic top results point at almost no business's own site in any
      category measured."
- [x] :368 [MEANING] th "Bing/Copilot own-site share" -> "Bing organic
      own-site share".
- [x] :472-473 [MEANING] "ChatGPT search (1%) and Copilot (0%) almost never
      cite an agent" / "and Copilot at 0%" -> Bing organic.
- [x] :128 + :131 [MEANING] flagship table intro/caption: "five
      web-searching AI tools (... Bing search (control) ...)" — control
      pooled into every headline number while labeled an AI tool. -> "four
      web-searching AI tools plus the Bing organic control, pooled; the
      control's near-zero share is inside these pooled figures."
- [x] :501 [WORDING] "6 AI tools: ... plus Bing organic ... (the five
      web-searching engines), plus Claude and Gemma" — seven items under
      six; contradicts :520's "four web-searching engines". -> "6 AI tools
      plus a control:" with 4/2/1 structure.
- [x] :119 + :362 [WORDING] TOC "The Bing search (control) pattern" links
      #copilot; h2 renamed but id="copilot" kept. Rename id + href
      (#bing-control).

### teardowns/cpa-hawaii/index.html
- [x] :242 [MEANING] "the cohort-wide Copilot gap, where Copilot cites few
      or no firm sites and a firm ranking in Bing organic tends to be the
      one it surfaces." Softened first-mover + Copilot data claim. -> "the
      cohort-wide Bing organic gap, where the top results carry few or no
      firm sites."
- [x] :236 [MEANING] "consistent with the cohort-wide Copilot pattern
      observed in dental, wealth, and law" -> "Bing organic pattern".

### teardowns/hotels-hawaii/index.html
- [x] :234 [MEANING] "which is the cohort-wide Copilot pattern we see in
      every category" -> "the cohort-wide control pattern".

### teardowns/hvac-honolulu/index.html
- [x] :145 [MEANING] "On the five web-searching engines alone, own-site
      share is 40%, and across the four AI-answer engines (excluding
      Copilot, which sits at 0%) it is 47%." -> "five measured web
      surfaces ... (excluding the Bing organic control, which sits at 0%)".

### teardowns/bank-honolulu/index.html
- [x] :82 [WORDING] "Bing search (control) (via Bing) cites them 0%" ->
      "Bing's organic results cite them 0%".
- [x] :108 [WORDING] "4 citation-grade engines ...: Perplexity, ChatGPT
      search, Gemini (grounded...), Bing search (control) via Bing organic
      SERP, Google AI Overviews." Five items under 4; Bing said three
      times. Use the other teardowns' correct wording (4 + "plus Bing
      organic results as a classic-search control").
- [x] :159 [WORDING] "invisible to a user who asks Bing search (control)
      ... measure all six AI tools" -> "a user searching Bing ... all six
      AI tools plus the Bing control".
- [x] :220, :225 [MEANING] "Wikipedia and Yelp matter for Bing/Copilot
      specifically." / "(75-percentage-point Bing/Copilot gap)" -> Bing
      organic.

### teardowns/wealth-mgmt-hawaii/index.html
- [x] :258 [MEANING] "It is not the bottleneck the lead-gen and Copilot
      gaps are." Contradicts its own correctly-rewritten body at :253. ->
      "Bing organic gaps".
- [x] :96 + :154 [WORDING] copilot-gap heading/id/TOC — same rename as
      dental.

### teardowns/med-spa-honolulu/index.html
- [x] :86 [WORDING] "the five web-searching engines cite ... heavily
      (Gemini 64%, Perplexity 61%, ChatGPT 57%, Google AI Overviews 53%),
      but ... Bing search (control) cites them 0%." Count five, four names,
      fifth split into contrast. -> four + control phrasing.

### Nine teardowns, identical instrument note
- [x] dental:161, law:162, wealth:181, cpa-hawaii:164, cpa-austin:166,
      med-spa:161, hvac:174, real-estate:163, hotels:162 [WORDING] "the
      five live-web tools answer from what they can fetch now" —
      contradicts "4 web-searching AI tools" above it on every page. ->
      "the four live-web tools answer from what they can fetch now, and
      the Bing organic control shows what classic search returns."

### teardowns/cpa-austin/index.html
- [x] :88, :292 [WORDING] "Bing search (control)'s 0% own-share" possessive
      x2 -> "The Bing control's 0% own-share" or restructure.

## TIER 5 — agency-us: the correction that did not propagate

### teardowns/agency-us/index.html
- [x] :178 [MEANING] callout still says 2% — correction box (:93), headline
      (:101), and table (:167) all say 5%. -> 5% on the corrected
      denominator.
- [x] :176 [MEANING] h3 "Copilot, ten Hawaii categories, then one national
      B2B category" — Copilot name; and the list includes Austin +
      Nashville while the intro says "eight of them in Hawaii". -> "The
      Bing organic control, ten local-service categories, ...".
- [x] :180 [MEANING] "A published range predicting an out-of-sample
      category is worth more than any single number in this teardown" —
      :223 retracts the comparison ("pending re-measurement"). Rewrite to
      the on-hold framing.
- [x] :181 [MEANING] "Copilot points at almost nobody's own website ...
      which means the slot is decided by whatever ranks first in Bing
      organic" — retired claim + attribution. Model the correct rewrite at
      hvac-honolulu:254.
- [x] :223 [MEANING] "Copilot cites agency websites rarely: 18 own-site
      citations out of 395 clean Copilot citations" -> Bing organic.
- [x] :94, :97 [MEANING] correction box still frames the channel as a
      Copilot proxy ("on the reasoning that Copilot answers from Bing's
      index" / "Only the Copilot channel"). -> Bing control framing.
- [x] :167 [WORDING] corrected 5% row left in the sort position 2% earned
      (between Claude 3% and ChatGPT 1%), and count cell still shows 782
      while 5% is computed on 395 (18/782 reads as 2%). Re-sort; cell ->
      "395 (corrected)" + pointer to correction box.
- [x] :28, :31 [MEANING] meta + og descriptions: "A Copilot range ...
      predicted a national B2B category" / "Copilot came in at 5%, above a
      range..." — attribution + retracted "predicted" framing. Rewrite.
- [x] :128 [WORDING] "Tools: 7. Four that search the live web (...FIVE
      names...) and two that answer from training data" — both counts
      broken. -> "Surfaces: 7. Four ... two ... and Bing organic as a
      classic-search control."

### teardowns/index.html
- [x] :188 [MEANING] card: "own-site range of 0% to 2%, derived entirely
      from ten Hawaii categories, predicted this national B2B one months
      later at 2%." Superseded 2%, retracted "predicted", wrong "ten
      Hawaii". -> corrected 5% + pending-re-measurement framing.
- [x] :14 [WORDING] meta: "6 AI tools (ChatGPT, Google AI, Perplexity, Bing
      search (control), Gemini, Claude, Gemma)" — seven under six. Drop
      control from list, add "read against a Bing organic control."

## TIER 6 — Vertical landing pages

### honolulu-dental-aeo/index.html
- [x] :51 [MEANING] h1 "The Bing search (control) opening. The insurance
      directory pattern." Retired "opening" + parenthetical in a headline;
      contradicts body (:148 "gap", :150 control framing). -> "The Bing
      organic gap. The insurance directory pattern."
- [x] :16 [MEANING] og:description "The Bing search (control) opening" ->
      "The Bing organic gap".
- [x] :55 [MEANING] "In our data, Copilot answers track Bing organic
      results, so the practices Copilot currently cites..." Delete/rewrite
      to control statement.
- [x] :149 [MEANING] "Copilot pulls from third-party content (83%)..." ->
      "The Bing organic top 5 is third-party content (83%)...".
- [x] :150 [MEANING] paragraph states control framing then contradicts it:
      "In our data, Copilot answers track Bing organic results..." Delete
      second half (tautology + false attribution).
- [x] :165 [MEANING] "the Bing organic results that Copilot answers track"
      -> "Bing organic visibility, tracked as a classic-search control".
- [x] :13 [WORDING] meta "Bing search (control) cites zero practice
      websites" -> "Bing organic returns zero practice websites".

### hawaii-law-aeo/index.html
- [x] :56 [MEANING] "the Bing search (control) gap, where in our data
      Copilot answers track Bing organic results, so firms ranking in Bing
      organic are the ones Copilot currently cites..." -> control + zero
      presence statement.
- [x] :150 [MEANING] "Copilot pulls from independent third-party content
      (81%...)" -> Bing organic top 5.
- [x] :151 [MEANING] whole paragraph circular once Copilot removed. Rewrite
      as plain control statement + boundary.
- [x] :167 [MEANING] "the Bing organic visibility that Copilot citations
      track in our data" -> control phrasing.
- [x] :170 [MEANING] "(Bing organic visibility, which Copilot citations
      track in our data, and legal-directory presence)" + "two openings"
      vocabulary -> "two closable conditions".
- [x] :53 [WORDING] "Bing search (control) (which cites zero firm websites
      cohort-wide)" — stacked parens + control-cites verb. -> "Bing
      organic, our classic-search control, which returns zero firm
      websites cohort-wide".
- [x] :166 [WORDING] "four citation-grade engines ... (..., Bing search
      (control)/Bing, ...)" — five under four + "(control)/Bing" garble
      (was "Microsoft Copilot/Bing"). Restructure 4 + control.
- [x] :14, :17 [WORDING] meta/og "Bing search (control) cites zero firm
      websites." / "Bing search (control) is the cohort-wide gap." ->
      "Bing organic returns zero firm websites." / "the Bing organic gap".

### hawaii-bank-aeo/index.html
- [x] :58 [MEANING] "The second-highest [leverage AEO work] is in Bing
      search (control), where bank-owned sites get cited 0%..." — control
      sold as AEO leverage; contradicts the boundary at :152. Reframe as a
      classic-search gap we report, not an AI-citation finding.
- [x] :152 [MEANING+WORDING] "Every Copilot mention went to third-party
      content..." -> "Every result captured in the control...". And the
      tautology "Whichever bank ranks first in Bing organic search ...
      would be the one classic search surfaces." Delete or replace with
      the zero-presence observation.
- [x] :149 [MEANING] "the spread between Bing search (control) (0%
      own-site) and the other web-searching AI tools" — control made an AI
      tool + stacked parens. -> "between the Bing organic control (0%
      own-site) and the web-searching AI tools".
- [x] :163 [WORDING] "plus a focused Bing search (control) push (the gap)"
      -> "plus a focused Bing organic push".
- [x] :16 [WORDING] meta "6 AI tools (ChatGPT, Google AI, Perplexity, Bing
      search (control), Gemini, Claude, Gemma)" — seven under six. Drop
      control, append "plus Bing organic as a classic-search control".
- [x] :19 [WORDING] og "Bing search (control) cites 0%." -> "Bing organic
      returns 0%."

### hawaii-cpa-aeo/index.html
- [x] :155 [MEANING] "The Copilot read for Hawaii CPAs: in our data, the
      firm ranking first in Bing organic ... is the one Copilot tends to
      surface..." Retired claim + attribution. -> control read + boundary.
- [x] :17 [WORDING] meta — same seven-under-six list as bank :16. Same fix.

### austin-cpa-aeo/index.html
- [x] :152 [WORDING] "Bing search (control)'s universal cohort-wide gap is
      the gap, same as every other category" — "the gap is the gap". ->
      "The Bing organic control sits at 0%, the same universal cohort-wide
      pattern as every other category we have measured."
- [x] :64-74 [WORDING] seven-row "Engine" table on a "6 AI tools" page,
      control unmarked. Add note: "Six AI tools plus Bing organic, run as
      a classic-search control."
- [x] :58 [WORDING] stray unmatched </p> at end of the notice block. Remove.

### for-hvac/index.html
- [x] :328 [MEANING] h2 "On Copilot, none did." -> "In Bing organic, none
      did."
- [x] :348 [MEANING] "Copilot cited an AC company's own site 0 percent ...
      so nobody in the cohort holds that surface today ... sitting there
      unclaimed ... the reason we run all seven." Attribution + first-mover
      pitch + unanchored seven. -> control statement + boundary + "all
      seven surfaces — six AI tools plus the Bing organic control."
- [x] :318 [WORDING] "on the five web-searching engines ... 40 percent" —
      eleven lines above "four that search the live web" (:329). Either
      use the four-engine 47% (already at :297) or label the five-surface
      scope explicitly.
- [x] :343 [WORDING] table cell "Bing search (control) (Bing)" — drop the
      dim "(Bing)" span.

### for-real-estate/index.html
- [x] :313 [MEANING] h2 "On Copilot, zero." -> "In Bing organic, zero."
- [x] :333 [MEANING] "while ChatGPT search sits at 1 and Copilot at 0" ->
      "and the Bing organic control at 0".
- [x] :287 [MEANING] "across all six AI tools the same cohort reads 15
      percent" — 15% is the SEVEN-surface figure (870/5,836); six-tool is
      17.2%. -> "across all seven measured surfaces". (The same line's
      earlier "five web-searching engines (... plus Bing organic as a
      control)" is CORRECT — model wording.)
- [x] :299 [MEANING] "Across 5,836 citations and six AI tools ... 77
      percent ... Local firms held 15." Both are seven-surface figures. ->
      "seven measured surfaces" framing.
- [x] :328 [WORDING] table cell "(Bing)" span — drop.

### for-hospitality/index.html
- [x] :294 [MEANING] "5,775 citations counted across 6 AI tools (5 that
      search the live web, 2 ...)" — 5+2=7, and 5,775 + headline 17% are
      seven-surface figures incl. the control's 810. -> "across 7 measured
      surfaces (6 AI tools — 4 live-web, 2 model-knowledge — plus Bing
      organic control)".
- [x] :262 [MEANING] "6 AI tools, 5 citation-grade" -> "7 surfaces: 6 AI
      tools (4 citation-grade) + Bing organic control".
- [x] :271 [MEANING] "We asked six AI tools ... Five of those surfaces
      search the live web" — fifth is the control. Restructure 4/2/+1.
- [x] :340 [MEANING+WORDING] "On the five surfaces that search the live
      web ... between zero and 30 percent" (the zero IS the control) "...
      the reason we run all seven." Split control out of the range; anchor
      the seven.
- [x] :335 [WORDING] table cell "(Bing)" span — drop.

## TIER 7 — Core pages

### methodology/index.html (fix FIRST in this tier — it is the audit page)
- [x] :77 [MEANING] "6 AI tools ... four that search the live web and cite
      sources (ChatGPT, Google AI, Perplexity, Bing search (control),
      Gemini) and two ..." — four/five, six/seven, control "cites
      sources", nested parens. Restructure 4 + 2 + control.
- [x] :108-116 [MEANING] "Layer 1: Citation-grade engines (5)" / "Five of
      them dominate the surface area today" with the Bing bullet inside.
      Only page left saying five citation-grade. -> "four citation-grade
      AI engines plus one control", Bing bullet under its own Control
      sub-label.
- [x] :117 [MEANING] "the API returns the AI-generated answer and the
      source URLs" asserted for all Layer-1 rows incl. Bing. Add: for the
      control we capture organic top-5 result URLs only; no generated
      answer exists.
- [x] :179 [WORDING] keep the 810 arithmetic; change label "on the
      citation-grade engines" -> "on the live-web surfaces".
- [x] :248/:256 OK as written (pooled five with control shown separately —
      the best substitution result on the site; use as model).

### results/index.html
- [x] :113 [MEANING] "6 AI tools per run. Five are citation-grade ...
      (..., Bing search (control)/Bing, ...) and two are model-knowledge"
      — 5+2=7 under six + "(control)/Bing" garble. Restructure 4/2/+1.

### vs/index.html
- [x] :91-94 [MEANING] h2 "Why we measure six AI tools and not nine" /
      body "We cover seven." / "The four citation-grade engines we cover
      (..., plus Bing organic as a control) ... invisible across those
      five" / ":94 The two we add beyond that" — six/seven/four/five
      tangle. Align on "seven surfaces" heading + 4/2/+1 body.
- [x] :93 [MEANING] Bing organic claimed as where "AI search behavior
      actually happens" — scope to the four citation-grade engines.
- [x] :115 [WORDING] cross-ref quotes a heading title that no longer
      exists ("Why we measure seven and not nine"). Align with :91 fix.
      (This cell's 4+2+1=7 formulation is the house standard — keep.)

### example-engagement/index.html
- [x] :301 [MEANING] "in our data, the Honolulu med spa ranking first in
      Bing organic ... is the one Copilot tends to surface ... We name the
      condition." Retired claim + attribution + dangling stub. Rewrite as
      control statement + boundary.
- [x] :342-343 [MEANING] Priority 2 heading "Show up in Bing organic,
      where Bing search (control) pulls its answers" (circular) + body
      "Copilot cites med spas' own sites 0% ... the firm ranking first in
      Bing organic is the one Copilot tends to surface". A client
      punch-list priority justified by the retired claim. Retire or
      demote + relabel as control hygiene; renumber priorities.
- [x] :86-88 [MEANING] h4 "Engines measured (all 7 from day one)" then
      "Four citation-grade engines: ... Bing search (control) via Bing,
      ..." — five under four, "via Bing" dangler, 4+2=6 vs "all 7".
      Restructure 4 / control / 2.
- [x] :81 [MEANING] "The five web-searching engines cite ... heavily
      (...four figures...) ... Two engines are category-wide blind spots:
      Claude ... and Bing search (control) 0%." Self-refuting; control
      lumped with Claude as an "engine". -> four cite heavily; Claude is
      the AI blind spot; control at 0% is a Bing statement, not an AI one.
      (:297 says "top four" — align.)
- [x] :324 [MEANING] "across six of the six AI tools" — was six of seven;
      contradicts :104 "6 of 7 measured surfaces" and the "Engines (of 7)"
      table. -> "six of the seven measured surfaces".

### about/index.html
- [x] :38 [MEANING] coherent 4+control+2 paragraph ending "We track all
      seven across every category we run" with no set of seven
      established. -> "That is seven measured surfaces in total, six AI
      tools plus the control, and we run all seven..." (Keep retraction/
      :86, which shares the first three sentences, worded identically.)

### your-clicks-are-down/index.html
- [x] :61 [MEANING] control inserted into the list of tools "now answering
      directly" — inverts the page's thesis (Bing organic is the
      blue-links surface). Remove from list.
- [x] :76 [MEANING] "Six AI tools ... in two groups: four citation-grade
      ... (..., Bing search (control), ...) and two ..." — five under
      four, 6 vs 7, "two groups" now three. Restructure.
- [x] :93 [WORDING] "The Bing search (control) gap." as a teardown hook ->
      "Where directories beat practice websites." (or similar finding-led
      hook).

### first-30-days/index.html
- [x] :90 [WORDING] "six AI tools we measure: ..., plus Bing organic as a
      control (the four citation-grade engines) plus Claude and Gemma" —
      seven as six, gloss on wrong item, plus...plus. Restructure.

### dashboard-preview/index.html
- [x] :287 [WORDING] tool-grid column "MS Copilot" -> "Bing (control)".
- [x] :325 [MEANING] "gained 4 mentions on Bing search (control) ...
      Previously cited zero times by Copilot ... (Cohort-wide Copilot gap
      may be starting to close.)" — half-renamed; parenthetical treats
      control movement as AI evidence. Rewrite as control-surface
      movement only.
- [x] :359-371 [WORDING] column "AI tools" with /7 values -> "Surfaces".

### directories/index.html
- [x] :167 [WORDING] h3 "Bing Business Profile (Bing search (control)
      lever)" — tautological (was "Microsoft Copilot lever"). ->
      "(control-surface hygiene)".
- [x] :172 [MEANING] "Primary AI engine pull: Bing search (control)
      (almost exclusively, since Copilot answers using Bing organic +
      Bing Business data)" — half-replaced + control as AI engine pull.
- [x] :173 [MEANING] "The Bing organic and Bing Business gap is unchanged
      because most competitors are not present." Non-sequitur where the
      first-mover framing was cut. -> control reading + boundary.
- [x] :184 [WORDING] "Bing search (control) surfaces 'open now' facts." ->
      "Bing".
- [x] :110 [WORDING] TOC "The Bing organic gap." vs the :167 heading —
      align after the :167 fix.
- [x] :400 [WORDING] control listed inside "Primary AI engine pull" list.
- [x] :167-204 [MEANING] structural: the whole Bing Business Profile
      playbook is premised on the retired lever. Add a boundary note at
      the top of the card or move it out of the AI-citation playbook set.

### takedowns/index.html
- [x] :45 [MEANING] "cited by AI answer engines (ChatGPT, Perplexity,
      Gemini, Google AI Overviews, Bing search (control), Claude, Gemma)"
      — the legal/notice page classifies the control as an AI answer
      engine. -> six engines "measured alongside Bing organic as a non-AI
      control."

### schema-library/index.html
- [x] :194, :250, :294 [MEANING] per-engine notes carry a Bing row with
      schema advice inherited from the Copilot framing (":194 Bing
      Business Profile is the more direct path"). Drop rows or prefix
      "Control surface, listed for completeness."
- [x] :98 [WORDING] "six AI tools" over seven enumerated surfaces below.

### atlas-preview/index.html
- [x] :312 [MEANING — VERIFY FIRST] "37% across the four citation-grade
      engines" — if 37% was computed across five surfaces incl. the ~0%
      control, the relabel made it wrong (four-engine mean would be
      higher). Check source data; recompute or relabel. Add "The Bing
      control is also excluded from that figure."

### Low-severity count drift (batch to house formulation)
- [x] faq:42, faq:141, terms:44, security:74, pricing:219, pricing:408,
      example-engagement:76/:102/:374, methodology:479 — "six AI tools"
      where seven surfaces run nearby. Converge on "six AI tools plus a
      Bing organic control — seven measured surfaces" where a 7-row table
      or surface count appears on the same page.

## TIER 8 — Reports, audits, content, social, missed surfaces

### claims/index.html — MISSED ENTIRELY (generated file)
- [x] Source is claims-registry.mjs (regenerate via
      dryrun/forensic/claims-ledger.mjs; do NOT hand-edit the HTML).
      Publicly indexed. Fix in the registry: "Bing/Copilot own-share" x7
      (:61, :81, :122, :134, :147, :160, :174) -> "Bing organic
      own-share"; :135 "all 5 web engines, incl Copilot 0%" -> "all 5
      live-web surfaces, incl the Bing control at 0%".

### linkedin/cover-source.html
- [x] :106 [MEANING] banner tagline "AI-native SEO for ChatGPT, Perplexity,
      Claude, Gemini, Bing search (control), Google AI Overviews, and
      Gemma." Drop the control from the positioning line entirely (six AI
      tools). RE-EXPORT the banner image after.

### reports/state-of-aeo-hawaii-2026/state-of-aeo-hawaii-2026.html
- [x] :218-220 [MEANING] "Bing search (control) is integrated into every
      modern Office deployment ... answers questions inside Word, Excel,
      Outlook, and Teams" — a Copilot sentence now factually false. Delete
      bullet (or replace with a boundary statement about not measuring
      Microsoft's assistants).
- [x] :82-86 [MEANING] "the six AI engines that now answer most
      informational queries: ChatGPT, Perplexity, Claude, Gemini, Bing
      search (control), and Google AI Overviews" — five AI engines + a
      control as six. -> five names, no control.
- [x] :222 [MEANING] "These six AI tools now collectively answer..." —
      recount after the :218 bullet is removed; do not leave "six" over a
      five-item list.
- [x] :113 [WORDING] "before the six AI tools retrain" — Bing does not
      retrain. -> "before the engines refresh their next index and
      training rounds."

### content/audits/iq360-muckrack-comparison.html (outbound agency pitch)
- [x] :183-185 [MEANING] "Six AI tools (ChatGPT, Perplexity, Claude,
      Gemini, Microsoft\nCopilot, Google AI Overviews, and Gemma..." —
      MISSED "Microsoft Copilot" (line break split the string), seven
      under six. Fix list + control clause.
- [x] :157-160 [WORDING] "daily seven-engine pulls (..., Bing search
      (control), ...)" — nested parens; control called an engine while :73
      and :183 say six AI tools. -> "seven surfaces — six AI tools ... plus
      Bing organic top-5 as a control".
- [x] :279-333 dated "May 10 update" section — internally consistent,
      retrospective. NO CHANGE (optionally one parenthetical noting the
      later reclassification). Do not renumber historical counts.

### content/meeting-evidence/asb-2026-05-18.html (dated artifact, but math broken)
- [x] :107-111 [MEANING] "measures across six AI tools, anchored by Gemma
      ... plus the six leading commercial APIs (..., Microsoft\nCopilot,
      ...)" — sweep broke the arithmetic (1+6=6) and "Microsoft Copilot"
      survived. :231 in the same file has the correct historical form
      ("all 7 engines"). Restore 7-surface arithmetic in historical voice.

### content/meeting-evidence/mvnp-2026-05-18.html (dated artifact)
- [x] :222-226 [WORDING] control described as one of six "commercial APIs".
      -> five commercial AI APIs + Bing organic top-5 as control + Gemma.
      (The two "first-mover" uses at :182/:259 are ALLOWLISTED — leave.)

### content/strategy/gsc-brand-verification-prep.html
- [x] :133 [MEANING] paste-verbatim Google OAuth justification classifies
      the control as an "AI search engine" and then distinguishes it from
      "traditional search" in the same clause. Remove control from the
      enumeration BEFORE this is ever submitted.

### audits/asb-hawaii-2026-05/audit.html (delivered client audit)
- [x] :1357-1358 [MEANING] "Six AI tools (ChatGPT, Perplexity, Claude,
      Gemini, Microsoft\nCopilot, Google AI Overviews, and Gemma..." —
      MISSED "Microsoft Copilot" (line-break split), seven under six.
- [x] :940-942 [MEANING] "lets ChatGPT, Perplexity, Claude, Gemini, Bing
      search (control), Google AI Overviews, and Gemma extract those
      answers and cite them" — drop control from the list.
- [x] :1117 [WORDING] "all six AI tools (..., Bing search (control), ...,
      and Gemma...)" — seven under six, nested parens. Restructure.
- [x] :1316-1317 [WORDING] "what Claude and the other six engines extract
      when they answer these prompts" -> "Claude and the other AI tools".
- [x] :299 [WORDING] cover list order uniquely buries the control mid-list
      (control sixth, Gemma last). Normalize: Gemma first, control last.

### Audit/report cover blocks — 15 files, same defect
- [x] "Six AI tools tracked" over a seven-item dot list ending "· Bing
      search (control)": all eight audits/*/audit.html (:298-299), the
      four reports/ HTML files (:73-74), iq360-muckrack-comparison (:73-74),
      both content/meeting-evidence files (:73-74). -> "Six AI tools
      tracked, plus one control" with the list as "... — control: Bing
      search" (or "7 measured surfaces"). This is the cover of every
      delivered PDF — most-reproduced defect in the set.

### social/posts/2026-05-06-six-engines-broadcast/ (both hero-video files)
- [x] :185/:186 [MEANING] eyebrow "Six engines tracked weekly" over a wheel
      where one spoke is the control and Gemma is absent entirely.
      Preferred fix: swap the spoke to Gemma ("Google · open-weight"),
      rename data-engine="copilot" -> "gemma"; eyebrow "Six AI tools
      tracked weekly" becomes true. If control stays: eyebrow "Seven
      surfaces tracked weekly", sublabel "Bing · classic-search control".
- [x] :219-223 [WORDING] sublabel "Bing · web-grounded" is wrong
      terminology for organic results; label "Bing search (control)" is
      ~2.5x sibling label width in Playfair italic, text-anchor=end at
      x=125 — check left-edge overflow at render.

## Non-copy tasks (no HTML edit accomplishes these)

- [x] Re-render pitch/asb-hawaii/og.png and
      pitch/hamada-financial-group/og.png from corrected og.html (both
      last rendered 2026-05-10; previews still show "Seven Engines").
- [x] Re-export the LinkedIn banner from linkedin/cover-source.html after
      the :106 fix.
- [x] Fix claims-registry.mjs and regenerate claims/index.html.
- [x] Rebuild dist/ after all source edits; re-run all seven gates.
      check-claims walks dist only.
- [x] Patch check-claims.mjs BEFORE starting the copy fixes (detector
      first). Full patch-ready snippets in the Appendix at the bottom of
      this file. Diagnosis correction from the audit: the regexes were
      never the problem — toText collapses the line-broken
      "Microsoft\nCopilot" before matching. The gate missed those files
      because audits/, content/, reports/, linkedin/, and social/ are NOT
      built into dist/, and check-claims walks dist only. claims/ IS in
      dist; it passed because bare "Bing/Copilot" matches no rule. So the
      patch is (a) a bare-name Copilot ATTRIBUTION rule, (b) an EXTRA_DIRS
      coverage extension, (c) an advisory warn rule for the control counted
      as a web-searching engine.

## Verified clean — DO NOT "fix"

- "7 measured surfaces" / "378 calls" where the count covers everything
  queried (methodology:171, teardowns/agency-us:129, index:751 AFTER its
  fix).
- All measured figures and zero numerators. A zero numerator does not move
  when a denominator is cleaned.
- The "4 web-searching AI tools: ... plus Bing organic results as a
  classic-search control" list in seven teardowns (dental:108, wealth:109,
  hvac:123, cpa-hawaii:111, hotels:109, real-estate:109 + cross-category's
  equivalent) — this is the model wording.
- methodology:248/:256 pooled-figure passage (control shown separately,
  pooled figure explained) — best substitution result on the site.
- for-real-estate:287's "five web-searching engines (..., plus Bing organic
  as a control)" — correct scope spelling; only the trailing "six AI
  tools" clause on the same line is wrong.
- Allowlisted "first-mover": content/meeting-evidence/mvnp-2026-05-18.html
  :182/:259 (vertical-exclusivity terms), state-of-agent-readiness :175
  (market-window observation).
- for-agencies:167 and for-hvac:329 "four + two = six" formulations.
- for-hospitality:311 "Seven independents and six chains" (hotel cohort,
  unrelated seven); :320 "It is seven, and they disagree violently"
  (matches the 7-row table).
- retraction/index.html:86 (clean twin of about:38).
- index.html:1717 "The seven hard ones" (seven objections, verified).
- pitch/hulas check counts (15 of 16, sixteen checks — reconcile);
  first-look/prince-waikiki "seven times" (:83, :109 — mention count,
  reconciles both ways); pitch/hamada :136 "8 firms / 384 mentions" (sums
  exactly).
- blog/, state-of-aeo/, case-studies/ — zero matches, clean.
- All in-page anchors RESOLVE (id/href parity verified across teardowns) —
  the copilot-named ids are a naming problem, not a broken-link problem.

## Pre-existing inconsistencies noticed in passing (NOT from this sweep —
## decide separately, do not bundle silently into the sweep fix)

- Banking anonymization asserted both ways: teardowns/index:102
  ("anonymized without exception, banking included") vs teardowns/index:118
  ("21-bank cohort named in full") vs cross-category:533 ("named in full in
  teardown 01") vs bank-honolulu:79/:103 (anonymized). cross-category head
  comment :27-34 records the "named in full" claim as already found false.
- Bank cohort size: 21 vs 23 (teardowns/index:118 vs bank-honolulu:79 vs
  cross-category:484 "23 domains across about 21 distinct banks").
- Two pages render "Teardown 11" (hotels-hawaii:81, agency-us:88).
- Law-firm own-share drift: 35% (law:133) vs 38% (law:284) vs 39% (its own
  table :124-125); top-5 share 64% (teardown x3) vs 66% (teardowns/index:132).
- "Cross-category teardown (4 verticals)" CTAs (dental:300, law:302) and
  "(5 verticals)" (cpa-hawaii:305) vs eleven covered.
- Measurement-count drift: "ten categories" (hawaii-bank-aeo:55) /
  "Ten measurements" (for-agencies:73,:174) / "Eleven hash-locked cohorts,
  spanning nine categories" (for-real-estate:267) / "eleven categories"
  (for-real-estate:15 meta).
- Banking own-site 51% vs 53% and law 35% vs 39% across vertical pages —
  looks like an unlabeled five-vs-seven scope split (same disease as the
  Tier 6 scope fixes; consider resolving in the same pass, with labels).
- for-hvac:318 "Hawaii hotels hold 11 percent" vs for-hospitality's 17% —
  same scope split.
- hawaii-cpa-aeo:155 "2% own-share, consistent with every other category"
  vs bank 0% and Austin 0% — "consistent" overstates.
- pitch/hawaii-theatre-center:125 "both brand queries" (2x3=6 responses)
  vs :130-131 "all eighteen brand responses" / "fourteen of eighteen".
- pricing/index.html:323-366 — section#worth closes without closing
  .roi-out/.roi-wrap divs opened at :326/:348.
- pitch/hamada og.html:28 h1 "Five things AI engines can't see" — no set
  of five in the brief.

## Verification greps (re-run after fixes; expect zero hits outside
## allowlisted/historical files)

    grep -rn --include='*.html' -iE "copilot" . --exclude-dir=dist --exclude-dir=node_modules
    grep -rniE "Microsoft[[:space:]]+Copilot" -r . --include='*.html' --exclude-dir=dist
    grep -rn --include='*.html' -iE "owns (that|the) (AI )?(surface|answer)|takes the slot|mostly to itself|sitting there unclaimed|ahead of any other" . --exclude-dir=dist
    grep -rn --include='*.html' -iE "in our data[^.]*copilot|copilot[^.]*in our data" . --exclude-dir=dist
    grep -rn --include='*.html' -E "Bing search \(control\) \(" . --exclude-dir=dist
    grep -rn --include='*.html' -iE "five citation|citation-grade engines \(5\)|Five of them" . --exclude-dir=dist
    grep -rn --include='*.html' -iE "(five|5) (web-searching|live-web|surfaces that search)" . --exclude-dir=dist
    grep -rn --include='*.html' -iE "seven engines|seven-tool|7-tool" . --exclude-dir=dist
    grep -rn --include='*.html' -E "\(control\)('|&rsquo;)s|\(control\)/Bing|via Bing\." . --exclude-dir=dist

## Appendix — check-claims.mjs patch (apply FIRST, then fix to green)

Apply these before starting the copy fixes so "done" is machine-verified,
per the sweep commit's own discipline. Expected immediate effect: the gate
goes red on the Tier 4-8 files; you fix until it goes green.

### A1. New rule — bare-name Copilot attribution (severity: block)

Insert after the retired-copilot-first-mover rule, before the closing `];`
of RULES. Literal alternations only — no variable-length gaps (see the
backtracking note on retired-five-citation-grade).

    {
      // Bare-name Copilot ATTRIBUTION. retired-copilot-as-tool catches the
      // full product name; the 2026-08-22 audit found ~30 sentences
      // asserting Copilot BEHAVIOR from our data under the bare name
      // ("Copilot cites...", "the Copilot gap", "cited zero times by
      // Copilot", "Bing/Copilot own-share", "excluding Copilot"). We have
      // no Copilot data, so any behavioral attribution is unpublishable.
      id: "retired-copilot-attribution",
      severity: "block",
      re: /\bCopilot(?:'|’)?s?\s+(?:cites?|cited|answers?|answered|pulls?|pulled|surfaces?|surfaced|tends?|tracks?|recognizes?|does\s+not\s+recognize|has\s+nothing)\b|\bthe\s+Copilot\s+(?:gap|opening|answer|result|row|pattern|read|lever)\b|\b(?:cited|surfaced|named)\s+(?:zero\s+times\s+)?by\s+Copilot\b|\bon\s+Copilot\b|\bBing\/Copilot\b|\bexcluding\s+Copilot\b/i,
      why: 'attributes measured behavior to Copilot under the bare name. We have no Copilot data; the channel is Bing organic, published as "Bing search (control)"',
    },

### A2. New rule — control counted as a web-searching engine (severity: warn)

Warn, not block, on purpose: /methodology/'s pooled-figure passage
legitimately describes the five-surface pool with the control shown
separately, and a gate that blocks the one page that words it correctly
teaches everyone to bypass the gate.

    {
      id: "control-counted-as-engine",
      severity: "warn",
      re: /five web-searching|five live-web|five surfaces that search|five engines that search the live web/i,
      why: 'counts the Bing control as a web-searching AI engine. It is four AI engines plus a control; if the five-surface pooled figure is the subject, label the pool explicitly',
    },

### A3. Coverage — scan shipped surfaces that never enter dist/

This is the actual fix for the "Microsoft Copilot" survivors. Add next to
EXTRA_SOURCES:

    // Shipped surfaces NOT built into dist/: delivered client audits,
    // outbound comparison docs, meeting-evidence packets, report HTML, and
    // the rendered social/LinkedIn graphic sources. These reach real people
    // as files or rendered images without passing through dist/, which is
    // how "Microsoft Copilot" survived the 2026-08-22 sweep in three of
    // them: the gate never read them. (The regexes were fine — toText
    // collapses the line-broken form before matching. Coverage was the gap.)
    const EXTRA_DIRS = ["audits", "content", "reports", "linkedin", "social"]
      .map((d) => join(ROOT, d));

And in the Run section, after the EXTRA_SOURCES loop:

    for (const dir of EXTRA_DIRS) {
      if (existsSync(dir)) walk(dir, files);
      else console.warn(`check-claims: expected source dir not found, skipping ${dir}`);
    }

The existing rel-path logic (`f.startsWith(DIST) ? ... : relative(ROOT, f)`)
already produces ROOT-relative paths for these, matching how the ALLOW list
names content/ files today.

### A4. Expected new ALLOW entries (declare, don't widen patterns)

- content/meeting-evidence/asb-2026-05-18.html for retired-seven-tools:
  its line ~231 "all 7 engines (the six commercial APIs plus Gemma)" is the
  CORRECT dated historical form this handoff says to preserve, and A3 puts
  the file in scope. Allowlist it; do not weaken the rule.
- If any other dated artifact trips a rule on prose this handoff marks
  "NO CHANGE", allowlist that file+rule pair with a comment saying why,
  rather than editing history or narrowing the pattern.
- Do NOT allowlist anything in audits/ — the Microsoft Copilot hits there
  are real work items (Tier 8), not history.

### A5. Not built (considered, rejected)

A count-vs-list consistency check ("6 AI tools" within N chars of a
seven-item enumeration) was considered and rejected: HTML lists put
arbitrary markup between count and items, so any workable proximity window
either misses real breaks or fires on correct copy. That class stays with
human review; the greps above cover the known instances.

---

Audit performed 2026-08-22 in a read-only session (five parallel readers +
pattern sweep). Nothing in the tree was modified by the audit itself.
