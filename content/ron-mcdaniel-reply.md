# Reply to Ron McDaniel — dashboard menu fix

**To:** ronmcdaniel@hawaiitheatre.com
**Cc:** Greg
**Subject:** Re: Welcome to NeverRanked, Lance — your dashboard is ready

Ron,

Thanks for the detailed report and the screenshot — that bug was
real, and you helped me find it in about ten minutes. I owe you a
straight answer on two things.

**The menu loop is fixed.** Settings, Support, and Sign Out should
all click through normally now. Try it whenever you're back at the
dashboard. If anything still bounces, send me a screenshot and the
time it happened so I can pull the request log.

**The thing you were actually trying to do — adding additional
users — is something I have to do manually for you right now.**
The teammate-invite UI is currently only available to agency-
managed accounts, not direct retail accounts like Hawaii Theatre's.
Building the equivalent for direct customers is on my list this
week. In the meantime, send me the email addresses you want added
and I'll send the invites today, within an hour of getting your
note.

I'm also going to be transparent: this bug existed because I never
ran through the customer experience as a customer would see it
before handing you the keys. That's a process gap on my end, and
I've started fixing it. You should never have hit this.

If it's helpful, I'd like to hop on a quick call this week — 15
minutes, your time of choice — to walk through how you'd actually
use the dashboard day-to-day, get those additional users set up,
and finish the onboarding step that was creating the redirect in
the first place. Just let me know what works.

Thanks again for flagging it cleanly. Real customer feedback at
this stage is the most valuable thing the platform gets.

Lance

P.S. The platform has been deploying fixes via continuous
integration since you wrote in — you'll see the menu work the
next time you log in. The deploy went out as commit d2fddd6 if
Greg or your dev team wants to verify.
