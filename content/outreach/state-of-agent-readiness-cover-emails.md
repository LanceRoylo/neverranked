# State of Agent Readiness — cover email templates

The seed report at `reports/state-of-agent-readiness/state-of-agent-readiness-2026-05.pdf` is a private outreach asset. Three send variants below depending on the recipient relationship.

**Voice rules:** no em dashes, no semicolons in marketing copy, no banned filler ("hidden gem", "Welcome to", "Nestled in"), no emojis. Plain, specific, slightly understated.

---

## Variant A — For prospects whose site is IN the panel

Use this for recipients whose domain we scanned and have data on. Personalize the bracketed details.

> Subject: [Site Name] in our agent-readiness panel — your score and what's missing
>
> [First name],
>
> NeverRanked just finished a 25-site agent-readiness scan across 10 verticals. [Site name] was in the panel.
>
> Headline finding: of 19 sites we successfully scanned, 1 has any Schema.org ActionType on its root URL. That's 5.3%. The category is wide open. The first deployer in [vertical] owns the agent layer for the 12-to-18-month window before the rest of the field catches up.
>
> Your specific result: [score]/100, grade [grade]. We found [N ActionTypes if any, or "no ActionTypes on your root URL"]. The full per-site detail is in the attached report, your row [or "your vertical section"] starts on page [X].
>
> Why I'm sending this: most enterprise sites are at zero, including six US banks, three major hospitality chains, and most of the e-commerce platforms we scanned. The category isn't lost. It's unstarted. If you want to discuss what deploying ActionTypes on your specific site would look like, I have 30 minutes Wednesday or Thursday.
>
> Lance

**Attach:** state-of-agent-readiness-2026-05.pdf

---

## Variant B — For prospects NOT in the panel

Use this for fresh outreach where you want to lead with the forward-looking framing and offer to scan their site.

> Subject: Agent-readiness scan for [Site Name]
>
> [First name],
>
> Quick research piece I wanted to share. NeverRanked scanned 25 production sites across 10 verticals last week looking for Schema.org ActionTypes — the structured signals AI agents need to book, apply, buy, or contact on a user's behalf.
>
> Of 19 sites we successfully scanned, 1 had any ActionType on its root URL. That's 5.3%. Banks, hospitality chains, e-commerce, healthcare, education, government. Almost universal zero.
>
> I haven't scanned [Site Name] yet, but I'd be willing to add you to the next run and send you a private result. If your site is at zero too, you're in the same bucket as 95% of the panel and there's a clear deployment path. If you're already deploying ActionTypes, you might be one of the few brands positioned for the agent-commerce shift in your category.
>
> Attached is the seed report so you can see the methodology and the rest of the panel. If you want me to scan [Site Name] specifically, just reply with the URL and a vertical (we have 13 supported verticals) and I'll send you the per-site finding within 24 hours.
>
> Lance

**Attach:** state-of-agent-readiness-2026-05.pdf

---

## Variant C — For existing clients

Use this for clients on Pulse/Signal/Amplify retainer who should hear about agent-readiness because it's the next deployment layer after core schema.

> Subject: Next layer after schema — agent-readiness data we just published
>
> [First name],
>
> Quick update on the layer of work that comes after the schema deployments in your roadmap.
>
> NeverRanked just finished a 25-site agent-readiness scan looking for Schema.org ActionTypes — the structured signals AI agents need to act on a user's behalf. Of 19 sites we successfully scanned across 10 verticals, 1 had any ActionType on root. 95% of enterprise sites are at zero today.
>
> Your site's current agent-readiness score is in your audit at section 03b (if you have the May 2026 audit version or later). If you don't, I can re-run the scan against your current state and update you.
>
> Why this matters now: the agent-commerce shift is starting. OpenAI Operator, Anthropic computer-use, and Perplexity agent mode are all live. The work to deploy ActionTypes is roughly the same lift as the core schema work we've already done together. The first deployer in [your vertical] owns the agent layer for the 12-to-18-month window.
>
> If you want to walk through what deploying ActionTypes on your specific surfaces would look like, the seed report attached has the methodology and the per-vertical findings. Happy to set a 30-minute working session this week or next.
>
> Lance

**Attach:** state-of-agent-readiness-2026-05.pdf

---

## Sending discipline

- **Don't blast.** Send to specific named individuals one at a time, with the bracketed fields actually personalized to their site.
- **Use Variant A only when you actually have their data.** Otherwise it reads as fake personalization and breaks trust.
- **Attach the PDF, don't link.** The report is a private outreach asset. Linking creates a public-share surface we don't want yet.
- **Don't follow up more than once.** This is a one-shot proof piece. If the recipient doesn't engage, leave the report in their inbox and move on. Coming back twice on the same asset feels desperate.
- **Track recipients.** Log who got which variant and when in `pitch/_meta/log.md` or your outreach DB. We'll want to know cumulative reach when we re-publish the next iteration of this report.

## Who to send to (suggested initial sends)

In rough priority order based on existing relationship + vertical:

1. **The 7 stale 2026-05-07 audit recipients** (BOH, CPB, FHB, MVNP, Ward Village, Drake, Emanate) — Variant A if you ran the scan on their site, Variant B if you haven't. This is the warmest re-engage path you have.
2. **Shawn (Hamada Financial)** — Variant C since he already has the brief and is in financial-services.
3. **Flash (Blue Note Hawaii)** — Variant B since Blue Note isn't in the current panel. Offers a reason to look at the brief again with a fresh angle.
4. **Mark (ASB)** — already getting Wednesday's email with the v2 audit. Don't send this on top. After the May 18 meeting, possibly Variant C as a follow-up.
