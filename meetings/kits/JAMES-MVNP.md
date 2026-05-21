# Meeting kit — James Malin, MVNP

> Single retrieval surface. Open this in the parking lot. Everything you need is one click or one scroll from here.

---

## 60 seconds before you walk in

1. This is a coffee. Friend-of-friend intro. Walk in curious. Do not pitch.
2. The opening is in your head, not on paper. Beat 1 is the retraction. Do not skip it.
3. Your pricing line, verbatim: **"Four thousand five hundred to kick off a category. Fifteen hundred a month after that for ongoing measurement. Per category."**
4. The demo on your laptop is `demo-medspa.html` in the outreach repo. Already open in your browser, or open it now.
5. The big thing nobody told us until tonight: **MVNP represents First Hawaiian Bank**. That is ASB's biggest competitor. Banking demos resonate with James for his FHB work, not in conflict with the ASB conversation.

---

## The opening, memorized arc

[meetings/openings/2026-05-20_james-mvnp.md](../openings/2026-05-20_james-mvnp.md)

Five beats, ~2 minutes. Retraction first. Force-multiplier framing in beat 4. Close as exploration, not pitch.

## The demo walkthrough — the actual words

[meetings/kits/DEMO-WALKTHROUGH.md](DEMO-WALKTHROUGH.md)

Read once aloud before the meeting. James version of the bridge at the end emphasizes "shape is useful or wrong" not commitment. Recovery lines if files fail.

---

## The live demo — pick named vs anonymized in the room

**Default for James: anonymized.** James is an agency. He could in theory contact the named Honolulu med spas if you show him real hostnames. The anonymized version proves methodology without handing him the dataset.

Switch to named only if the conversation moves toward "we want to engage" — at that point showing real data demonstrates depth.

### Anonymized (recommended for the cold-coffee read)
- `meetings/kits/demo-medspa-anon.html` — same content, hostnames hashed
- `meetings/kits/demo-medspa-anon.pdf` — 130KB, print-ready
- `meetings/kits/demo-medspa-anon.txt` — plain text
- `meetings/kits/demo-medspa-anon.json` — raw structured data

### Named (full reveal, hold unless he's leaning in)
- `meetings/kits/demo-medspa.html` — real hostnames, including `honolulumedspa.com`, `finamedspa.com`, etc.
- `meetings/kits/demo-medspa.pdf`, `.txt`, `.json`

Open whichever you plan to show before the meeting starts. Both are local copies on your laptop — no internet needed.

To regenerate either: `cd /Users/lanceroylo/Desktop/neverranked-outreach/dryrun/forensic && node render.mjs --category med_spa --label "Honolulu Med Spa" [--anonymize] --out OUTPUT.html` then copy back to `meetings/kits/`.

This is your "shape of the deliverable" demo. Walk James through what a research memo looks like using med-spa data. Then describe what a Hilton Waikiki or HVCB or First Hawaiian Bank version would show, conceptually. Do not run it.

**Do NOT bring a finished Hawaii tourism aggregate or a Hawaii banking aggregate. We deliberately did not seed those verticals before this meeting because showing them would be giving away the farm.**

---

## What MVNP actually does — research from earlier tonight

MVNP is an 80-year-old Honolulu agency. Their public client list:

- **Tourism / hospitality (their biggest lane):** Hawaii Visitors & Convention Bureau, Hawaii Tourism Authority, Hilton Hotels, Marriott International, The Laylow, Expedia.
- **Banking / financial services:** **First Hawaiian Bank**, Capital One, JP Morgan Chase, First Insurance of Hawaii.
- **Travel infrastructure:** Hawaiian Airlines, Matson.
- **QSR / retail:** McDonald's.
- **Energy:** Hele Gas.
- **PR only:** Lyft, Pacific Resource Partnership, Blue Zones Project Hawaii.

When you talk about "the kinds of clients this would be useful for," anchor in tourism and banking. Those are the two lanes that hit his book hardest. Avoid private schools (he mentioned them but they are not in his book).

---

## Pricing — the one line

> Four thousand five hundred to kick off a category. Fifteen hundred a month after that for ongoing measurement. Per category.

For an agency: a category is one of his client's verticals. A Hilton engagement is one kickoff. An HVCB engagement is another kickoff. They stack.

If he asks about a partnership rate: do not invent one in the room. Say "we have not formalized the agency rate yet. The retail number above is what a direct buyer pays. If we move toward something where MVNP is the channel for several accounts, we figure out the right shape for both sides. Not tonight."

---

## Expected questions, ready answers

**"What changed about your product?"**
Same as the retraction in the opening. We tested our snippet against our own domain, got zero, stopped selling it, rebuilt around measurement.

**"How does this work with my agency model?"**
The diagnostic and the prepped punch list go to your team, not directly to your client. Your strategists repackage it in your voice. Your team executes. Your client sees MVNP as the expert. We are a force multiplier for your senior strategists, not a competitor for their hours.

**"Would you ever pitch my clients directly?"**
No, and the boundary is structural. If a client of yours asks us to do the execution work, we route it back to you. We do not have the team, the relationships, or the desire to do the implementation labor. The diagnostic layer is what we sell. The execution layer is yours.

**"What is the actual deliverable my team would see?"**
A research memo, monthly, on the engagement category. Per query, per engine, per competitor, per source type. Plus a punch list ordered by impact for whoever on your team executes. Technical specifics, not polished client-facing prose. We assume your team will repackage for the client.

**"How is this different from Profound or Peec?"**
They sell brand dashboards directly to the brand. That undercuts you. We sell to the agency or the buyer with the explicit boundary that we do not touch the work. We are the diagnostic layer no platform-internal dashboard can ship.

**"Can I see something on one of my actual clients?"**
This is the key restraint. Say: "I could run a small pilot on a real client of yours, no charge, if you want to scope one. The full kickoff is $4,500 and would give you the deliverable in three weeks. Smaller pilot would be five queries, one engine, single-day, no charge." Do not pre-run Hawaii tourism for him to take home as free intel.

**"How does this work with what you're doing with ASB?"**
You can be honest. The ASB conversation is separate, with Mark Cunningham directly, no agency layer. We are not pitching ASB through MVNP. The fact that you represent First Hawaiian Bank, which is ASB's competitor, is a coincidence of the friend-of-friend intro, not a conflict.

**"What's the data moat?"**
Every readout we produce contributes to a cross-category aggregate. Source patterns by category over time. Which engines cite what. The Nth customer in a category gets told "we have observed N-1 prior readouts in your category, here is what holds." No platform-internal tool can produce that. We protect it: aggregate only, never named, never reverse-engineerable to a specific customer.

---

## What NOT to say

1. **Do not pitch.** This is a coffee. The job is to plant a question, not close a deal.
2. **Do not promise citation lift.** Same as Mark. We measure, we do not predict.
3. **Do not run a finished tourism or banking aggregate for him to take home.** Specifically out of scope. Every aggregate we run pre-meeting is one we hand him for free.
4. **Do not invent an agency rate.** If he pushes, defer to "not tonight, we work out the right shape together if we move toward something."
5. **Do not mention private schools as a serious recommendation.** He brought them up. They are not in his book. Treat them as the thought exercise they probably were.
6. **Do not say "seven engines"** without the five-plus-two split.
7. **Do not name the 45 to 95 Hawaii Theatre score jump as causation.** Retracted claim.

---

## After the meeting

1. Send a one-line follow-up within 24 hours. Reference whatever specific thing he engaged on. "Thanks for the time. The link to the pitch shape we discussed is [URL if appropriate]. I'd love to scope a pilot on one of your accounts when you have something in mind."
2. Log the conversation against the demand pre-registration. James counts as one of five, with the explicit caveat that he is a friendly first contact and discounted accordingly.
3. Score behaviorally. The pre-registration's primary measure is a paid commitment with the no-fix boundary stated. Polite enthusiasm is not validation.

---

## Backup files referenced

- Pricing memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/neverranked_pricing.md`
- Engine split memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/engine_split_5_plus_2.md`
- Force multiplier memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/force_multiplier_for_agencies.md`
- Moat aggregate memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/moat_aggregate_lives_in_dryrun.md`
- Demand pre-registration: `/Users/lanceroylo/Desktop/neverranked-outreach/dryrun/schema-causal/DEMAND-PRE-REGISTRATION.md`
