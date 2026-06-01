# Greg @ HTC — reply to his "event scraping error" email

**Status:** SEND FIRST. Pure service reply, no ask. Reply in his existing thread.
**Created:** 2026-06-01
**Sequence:** send this now; send greg-htc-catchup.md (the Atlas invite) separately, same day or next.
**Why split:** never attach an ask to the resolution of a problem we caused. Reassure fully first, invite separately.

---

**To:** Greg @ Hawaii Theatre Center (gregorydunn@hawaiitheatre.com)
**Subject:** Re: Issue with Event Scraping that has triggered a warning message

Greg,

Good catch, and thanks for flagging it. Short version: nothing is wrong with your site or your scores.

What you saw was an internal monitoring message that surfaced on your end when it should only have shown on mine. One of our background jobs refreshes your event listings daily, and it had been quietly stalling for a couple of weeks because of a resource limit on our side. Our own monitor caught it, which is the system working as intended. The only real miss was that the flag showed up in your view instead of just ours.

All fixed now. The refresh has its own dedicated slot so it stops stalling, your event listings are current again as of this morning, and those internal messages no longer surface on your end. Your AEO score and your citations were never affected by any of it.

Appreciate you keeping an eye on it.

Lance
