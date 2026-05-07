# Pitch Log

Internal tracker for custom pitch URLs. Lives under `pitch/_meta/`
which is explicitly excluded from `scripts/build.sh` and never
deploys to the live site.

## Conventions

- **Slug** matches the directory under `pitch/`
- **Created** is when the pitch URL was first committed
- **Sent** is the date the URL went to the prospect
- **Replied** is the date the prospect responded (any direction)
- **Read:** `—` (not opened yet), `Audit Read` (they have viewed the
  brief, set this when you see evidence: an email open, a calendar
  reply, a thread response, anything confirming they saw it)

Update this file by hand after every send and after every meaningful
reply. Costs a minute. Saves the "wait did I send Hamada that brief?"
moment in three months.

---

## Active

| Created | Prospect | Slug | Sent | Replied | Read | Notes |
|---|---|---|---|---|---|---|
| 2026-05-05 | Shawn Hamada / Hamada Financial Group | `hamada-financial-group` | 2026-05-05 | — | — | Standing meeting in coming weeks. Pitch sent ahead. NYL umbrella addressed in section 05.5. Move is Audit -> Signal. |
| 2026-05-05 | Sean Levy / TWS Paperie | `sean-levy` | 2026-05-05 | — | — | Old Macy's friend, reconnected via LinkedIn. Asked Lance to look at his Wincher data. Audit comped because of relationship. AEO is moving target framing. |
| 2026-05-04 | Darrell Chock / restaurant marketing | `darrell-chock` | 2026-05-04 | — | — | Met in person years ago, reconnected via LinkedIn. Reseller pitch (60/40 split), no audit fee. Hawaii restaurants angle, mostly through HRA network. |
| 2026-05-04 | Jeff Dizon / Hawaii Energy | `hawaii-energy` | 2026-05-04 | — | — | Sent date inferred from URL commit (12:28 HST). Replied/Read pending Lance review of his records. |
| 2026-05-02 | Ellen | `ellen` | 2026-05-02 | — | — | Comparison brief: Seerly vs Never Ranked. Sent date inferred from URL commit (09:56 HST). Replied/Read pending Lance review. |
| 2026-04-29 | Mark Cunningham / American Savings Bank | `asb-hawaii` | 2026-04-29 | — | — | Private brief for Mark. Sent date inferred from URL commit (19:07 HST). Replied/Read pending Lance review. |
| 2026-04-29 | Flash Hansen / Blue Note Hawaii | `blue-note-hawaii` | 2026-04-29 | — | — | Private brief for Flash. Sent date inferred from URL commit (18:41 HST). Replied/Read pending Lance review. |

---

## Inbound signals

Prospects who came to us (ran a scan, filled a form, etc.) and got a
warm reach-out. No custom pitch URL yet. If they engage, graduate
them into Active with a real pitch slug.

| Date | Prospect | Trigger | Action taken | Status | Notes |
|---|---|---|---|---|---|
| 2026-05-06 | Joe Santoro / Personal Property Managers | Ran scan on personalpropertymanagers.com, score 35, ~1h before reach-out | LinkedIn connection request with note acknowledging the scan, no pitch | INVITE SENT | Owner / Co-Founder, Doylestown PA. Property management vertical (tier 2-3 for AEO). 3rd connection. If he accepts and replies, graduate to Active and decide between $750 audit or Pulse. If no response in 2 weeks, mark CLOSED. |
| 2026-05-06 | Nicolas Ibanez / Drake Real Estate Partners | Ran 3 self-scans on drakerep.com (score 5/100). Already in SMB outreach DB (prospect ID 192). Auto cold T0 sent 06:53 HST today | Personal teardown email naming 3 specific homepage gaps (zero schema, no H1, no og:image), audit comped (normally $750). Sent from `lance@hi.neverranked.com` to thread with cold T0. Confirmed sent ~13:30 HST. | TEARDOWN SENT | NYC real estate investment firm focused on value-add and opportunistic investments. The 3 self-scans + low score = strong intent. Comp framed as recognition of his engagement, not desperation. If he replies "send it", deliver the full audit PDF in 48 hours (live citation scan across 6 engines, schema audit, 90-day fix list with exact JSON-LD blocks). If no reply in 7 days, mark CLOSED. |
| 2026-05-06 | Gary Sugar / Emanate Wireless | Ran 5 self-scans on emanatewireless.com (score 15/100). Already in SMB outreach DB (prospect ID 153). Auto cold T0 sent 2026-05-05 02:02 HST — but the cold MISFIRED: framed Emanate as a Hudson Ohio healthcare provider when they're actually a B2B IoT / RTLS platform serving hospitals nationwide. 0 opens recorded. | Personal teardown email repositioned for B2B-IoT context, naming 3 specific homepage gaps (zero schema, no meta description, 3 H1 tags). Audit comped (normally $750). Sent ~21:47 HST 2026-05-06. | TEARDOWN SENT | Hudson Ohio HQ, 6 employees. Title: Founder + VP Engineering. Selling RTLS for asset tracking + cold-chain monitoring to hospital procurement. Misfire root cause: Apollo's industry tag "hospital & health care" categorizes B2B vendors by who they sell to, not what they are; the SMB generator naively dropped that into the prompt template. Open follow-on bug to address (logged separately). If he replies "send it", deliver B2B-tailored audit: RTLS-buyer queries (e.g. "wireless asset tracking for hospitals"), SoftwareApplication/Service/Organization schema gaps, NOT LocalBusiness. NR doesn't have a B2B-IoT vertical playbook yet — this audit will be a one-off custom delivery. If no reply in 7 days, mark CLOSED. |

---

## Posted (closed loop)

(empty so far. When a pitch hits a terminal outcome, move the row
here with the resolution date and one-sentence why.)

---

## Pipeline shorthand

- **In-flight pitches:** 7
- **Sent in last 7 days:** 3 (Hamada, Sean, Darrell)
- **Awaiting first reply:** all 3 of the above
- **Older, status unknown:** 4 (Hawaii Energy, Ellen, ASB, Blue Note), backfill when Lance has a moment
- **Inbound signals (no pitch yet):** 3 (Joe Santoro LinkedIn invite, Drake teardown with comped audit, Emanate Wireless teardown with comped audit)

---

## Reusable templates

The `pitch/blue-note-hawaii/` and `pitch/ellen/` folders are the
two reference templates. Blue Note is the customer-pitch shape
(audit + gaps + gameplan). Ellen is the comparison shape (when
you need to position Never Ranked vs another tool the prospect
is already considering). Most new pitches start from one of these
two.
