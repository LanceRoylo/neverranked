# Never Ranked — Audit Intake Questionnaire

**For:** Prospective audit clients
**Purpose:** Gather the context we need to run a meaningful $500 audit in 48 hours. Most of this takes 5 minutes to answer; a few questions take more thought.

---

## How to send this to a client

Copy this entire file into the body of an email or a Notion/Google Doc and share after they've paid for the audit.

Subject line: **Your Never Ranked audit — 5 minutes of setup**

---

## Email body template

> Hi [name],
>
> Thanks for booking the audit. To deliver within 48 hours I need 5 minutes of context from you. There are 12 questions below — answer whichever you want, skip the ones that don't apply. Reply to this email or send me back a Loom if that's easier.
>
> Once I have your answers, I'll start the audit. You'll get six deliverables and a 90-day roadmap, plus a Loom walking through what I found. Yours to keep whether you hire us after or not.
>
> Lance

---

## The questions

### 1. What does your company do, in one sentence?
{The way you'd describe it to a new friend, not the way you'd describe it in a pitch.}

### 2. Who's your target customer?
{Real estate agent? Solo attorney? SaaS founder? The more specific the better.}

### 3. What are the 3 search queries you most want to rank for?
{Not your broadest keyword. The queries where if a customer searched them, you'd want them to find you first.}

### 4. Who are your top 3 competitors?
{Direct competitors — the ones you lose deals to, not the category leaders you aspire to beat.}

### 5. What do you think those competitors do better than you?
{Be honest. This tells me what to look at first.}

### 6. What do you do better than those competitors?
{Also be honest. This is where we lean into your positioning.}

### 7. What's one thing about your product that you find yourself explaining to every prospect?
{If you have to explain the same thing every time, either your website is failing or you have a real positioning opportunity. Either way I need to know.}

### 8. What's your current SEO / marketing setup?
- Current agency (if any):
- Tools in use (Ahrefs, Semrush, GSC, GA4, anything else):
- Rough monthly organic traffic:
- Rough conversion rate on organic traffic:

### 9. Is there anything I should NOT touch or flag?
{Pages that are intentionally unlisted, sensitive topics, competitors I shouldn't name in the report, anything legal or regulatory I should know about.}

### 10. What technical stack is your site on?
{Next.js? WordPress? Webflow? Custom? This affects how detailed the implementation recommendations can be.}

### 11. Who's going to implement the recommendations — you, a developer, or your current agency?
{Shapes how I write the deliverables. Developers want code. Founders want clear principles. Agencies want leverage points they can claim as their own work.}

### 12. What does success look like for you in 90 days?
{One or two concrete outcomes. "More traffic" is too vague. "Citations for 'X query' in ChatGPT" or "Rank for 'Y' in Google" is useful.}

---

## Optional bonus questions

*(Only if the client wants to go deeper)*

### 13. What's the single most important page on your site, and why?

### 14. What customer objection comes up most often in sales conversations?

### 15. What content have you published that you're proudest of?

### 16. What content have you published that you regret?

### 17. If you had to describe your ideal customer in one paragraph, what would you say?

### 18. What's your current ARR range (just a ballpark, keeps the audit proportional to your stage)?

### 19. Are there any industry publications, podcasts, or communities where getting mentioned would move the needle?

### 20. Is there anything you've been afraid to say publicly that you think would actually help you?

---

## For the auditor: what to do with the answers

Once the client sends the intake back, create the client's audit folder:

```bash
cp -r audit-template audits/{client-slug}
cd audits/{client-slug}
mkdir raw
```

Copy the client's answers into `01-intake.md`. Run the audit runner:

```bash
python3 ../../scripts/run-audit.py https://{client-domain} --out raw/
```

Then work through the numbered deliverables, using the client's answers as the guide for which angles to investigate.

The target queries in question 3 become the primary queries for the AI citation audit.
The competitors in question 4 become the competitor teardown subjects.
The positioning answers in questions 5-7 become the keyword gap positioning section.
The 90-day success definition in question 12 becomes the success signal for the roadmap.
