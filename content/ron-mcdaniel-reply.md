# Reply to Ron McDaniel — dashboard menu fix + team invites

**To:** ronmcdaniel@hawaiitheatre.com
**Cc:** Greg
**Subject:** Re: Welcome to NeverRanked, Lance — your dashboard is ready

Ron,

Thanks for the detailed report and the screenshot — that bug was
real, and you helped me find it in about ten minutes.

Two updates:

**The menu loop is fixed.** Settings, Support, Sign Out — all
clickable now. The bug was an over-aggressive onboarding gate
that was redirecting every menu click back to the dashboard.

**Adding teammates is now a self-service flow.** I noticed the
deeper issue while looking at the menu fix — the platform did
not actually have a teammate-invite UI for direct customers like
Hawaii Theatre. Only agency-managed accounts had it. I shipped
the missing piece this evening.

When you log back in, go to Settings and you'll see a new "Team
members" card with a "Manage team →" button. From there you can
invite teammates by email. They'll get a 7-day sign-in link, no
password required, and they'll see the same scans, roadmap, and
reports you do.

I'm also going to be transparent about what happened: this bug
shipped because I never ran through the customer flow as a
customer would experience it before handing you the keys. That's
a process gap on my end, not a Cloudflare bug. I've changed how
launches work going forward.

Still happy to hop on a 15-minute call this week if you want me
to walk through the dashboard with you and your team. Just send
me the time that works.

Lance

P.S. The fixes deployed via continuous integration as commits
d2fddd6 and 0affe1e. Greg or your dev team can verify if useful.
