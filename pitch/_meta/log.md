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
| 2026-05-04 | Jeff Dizon / Hawaii Energy | `hawaii-energy` | ? | ? | ? | Need to backfill from Lance's records. |
| 2026-05-02 | Ellen | `ellen` | ? | ? | ? | Comparison brief: Seerly vs Never Ranked. Need to backfill. |
| 2026-04-29 | Mark Cunningham / American Savings Bank | `asb-hawaii` | ? | ? | ? | Need to backfill. |
| 2026-04-29 | Flash Hansen / Blue Note Hawaii | `blue-note-hawaii` | ? | ? | ? | Need to backfill. |

---

## Inbound signals

Prospects who came to us (ran a scan, filled a form, etc.) and got a
warm reach-out. No custom pitch URL yet. If they engage, graduate
them into Active with a real pitch slug.

| Date | Prospect | Trigger | Action taken | Status | Notes |
|---|---|---|---|---|---|
| 2026-05-06 | Joe Santoro / Personal Property Managers | Ran scan on personalpropertymanagers.com, score 35, ~1h before reach-out | LinkedIn connection request with note acknowledging the scan, no pitch | INVITE SENT | Owner / Co-Founder, Doylestown PA. Property management vertical (tier 2-3 for AEO). 3rd connection. If he accepts and replies, graduate to Active and decide between $750 audit or Pulse. If no response in 2 weeks, mark CLOSED. |

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
- **Inbound signals (no pitch yet):** 1 (Joe Santoro, scan-triggered)

---

## Reusable templates

The `pitch/blue-note-hawaii/` and `pitch/ellen/` folders are the
two reference templates. Blue Note is the customer-pitch shape
(audit + gaps + gameplan). Ellen is the comparison shape (when
you need to position Never Ranked vs another tool the prospect
is already considering). Most new pitches start from one of these
two.
