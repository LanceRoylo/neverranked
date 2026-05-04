# NeverRanked Email Nurture Sequence

Triggered when a user runs the free check tool at check.neverranked.com.
Existing emails: magic link (instant), weekly digest (7-day cycle), regression alerts (event-driven).

This doc covers the two new drip emails that fill the conversion gap.

---

## Sequence Overview

| Day | Email | Goal |
|-----|-------|------|
| 0 | Check results (existing) | Deliver the score, first impression |
| 7 | Weekly digest (existing) | Show the dashboard, build habit |
| 14 | **The Deeper Problem** | Educate on what the score means, link to blog content |
| 30 | **The 90-Day Window** | Create urgency around compounding advantage, soft CTA for paid audit |

---

## Day 14 -- "The Deeper Problem"

**Subject line:** Your AEO score is a symptom, not the diagnosis

**Goal:** Move from awareness (they checked their score) to understanding (what drives the score). Link to 2-3 blog articles. No hard sell.

**Creative lever:** Reframe

**Copy:**

---

Hey [first name],

Two weeks ago you checked your AI visibility score. Whether you scored a 30 or a 70, the number itself is not the interesting part.

The interesting part is what the score measures.

When someone asks ChatGPT for a recommendation in your industry, the model does not search the internet in real time. It pulls from structured data, entity signals, review patterns, and content architecture that it has already indexed. Your score reflects how much of that information exists for your business and how well the model can parse it.

Three things move the score more than anything else:

1. Schema markup. Not the generic kind your website builder added. The specific types that AI models use to build entity understanding -- Organization, LocalBusiness, FAQPage with questions that match what users ask the model.

2. Entity consistency. Your business name, address, description, and service categories need to match across every platform the model checks. Google Business Profile, Yelp, industry directories, your own website. Inconsistency is a trust signal the model weighs heavily.

3. Content that answers predicted questions. AI models predict what users will ask next. If your website has content structured around those exact questions, the model has something to cite. If it does not, the model cites whoever does.

We wrote detailed breakdowns on each of these:

  How schema markup works for AI search:
  neverranked.com/blog/schema-markup-ai-search/

  Why your competitor shows up instead of you:
  neverranked.com/blog/why-chatgpt-recommends-your-competitor/

  What your AEO score actually measures:
  neverranked.com/blog/aeo-score-what-it-means/

Your score will update in your next weekly digest. If you have not logged into the dashboard yet, that is where the full breakdown lives -- every signal we check, every gap we find, and what to do about each one.

app.neverranked.com

Talk soon,
Lance
Never Ranked

---

## Day 30 -- "The 90-Day Window"

**Subject line:** The businesses starting AEO now will own the answer by Q3

**Goal:** Convert educated lead into paid audit customer. Introduce compounding advantage and the cost of waiting. Mention the $750 audit with specific deliverables.

**Creative lever:** Specificity + Tension Hold

**Copy:**

---

Hey [first name],

A month ago you checked your AI visibility. Since then, the models have retrained at least once. New data has been indexed. The competitive landscape in your market has shifted, even if just slightly.

Here is what we are seeing across every industry we track:

The gap between businesses that are visible to AI search and businesses that are not is widening. Not because the invisible businesses are getting worse. Because the visible ones are compounding.

AI citation share works like compound interest. Once a model starts citing your business, your content gets more engagement, which generates more signals, which makes the model more confident in citing you again. The businesses that started optimizing for AI search 90 days ago are already pulling ahead. The ones that start today will catch up. The ones that wait until next quarter will be chasing a moving target.

AEO takes 90 days to show measurable results. That means businesses starting today will see movement by Q3. Businesses starting in Q3 will not see results until Q4. The math is simple but the window is not permanent.

We run a full AEO audit for $750. Five deliverables, 48-hour turnaround:

  - AI citation share analysis (how often you appear vs competitors)
  - Schema coverage audit (what is missing, what needs fixing)
  - Entity consistency check (every platform the model references)
  - Content gap analysis (questions the model predicts that you do not answer)
  - Competitor signal comparison (what they have that you do not)
  - 90-day implementation roadmap (prioritized by impact)

No retainer required. No ongoing commitment. Just the audit and the roadmap. If you want to implement it yourself, the roadmap is yours. If you want us to implement it, we can talk about that after you see the findings.

Reply to this email if you want to get started, or book directly:

neverranked.com

Your current score and weekly tracking will keep running either way. The dashboard is free. The data is yours.

Lance
Never Ranked

---

## Implementation Notes

### Trigger Logic
- Day 14 email fires 14 days after the user's first check tool scan (not account creation, not first login)
- Day 30 email fires 30 days after the first scan
- If the user has already purchased a paid audit before day 30, suppress the day 30 email
- If the user has not opened the day 14 email, still send day 30 (different angle, different intent)

### Technical Requirements
- Add a `first_scan_at` timestamp to the users table (or derive from first scan record)
- Add a `nurture_stage` field: null, "day14_sent", "day30_sent", "converted"
- Cron job checks daily for users who crossed the 14-day and 30-day thresholds
- Uses the same Resend API and email design system as the existing digest/alert emails
- From address: reports@neverranked.com (same as digests)

### Design
- Same dark theme as existing emails (#121212 background, #fbf8ef text, #e8c767 gold accent)
- Georgia serif for body text, Courier New monospace for labels
- No images. No heavy formatting. Reads well in plain text fallback.
- Day 14: no CTA button, just inline links (educational tone)
- Day 30: single CTA button linking to neverranked.com (conversion tone)

### Subject Line Testing
Day 14 alternates:
- A: "Your AEO score is a symptom, not the diagnosis"
- B: "What your AI visibility score is actually measuring"

Day 30 alternates:
- A: "The businesses starting AEO now will own the answer by Q3"
- B: "The 90-day math on AI search visibility"

---

*Created: April 2026*
