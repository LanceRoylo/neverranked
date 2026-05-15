# Reply to Ron McDaniel -- dashboard menu fix + team invites

**To:** ronmcdaniel@hawaiitheatre.com
**Cc:** Greg
**Subject:** Re: Welcome to NeverRanked, Lance -- your dashboard is ready

Ron,

Thanks for the detailed report and the screenshot -- that bug was real,
and you helped me find it in about ten minutes.

**The menu loop is fixed and adding teammates is now self-service.**
Settings, Support, and Sign Out all click through normally now. I also
shipped the missing teammate-invite UI tonight -- the platform did not
previously have one for direct retail customers like Hawaii Theatre,
which is why you couldn't find it.

## What to do when you log in next

1. Go to **Settings** (avatar menu, top right).
2. Find the new **"Team members"** card and click **"Manage team →"**.
3. Enter the email address of any teammate you want to add and submit.
4. They'll get an email with a 7-day sign-in link -- no password needed.

Each teammate you add will see the same scans, roadmap, and reports
you do.

## If anything still doesn't work

- Send me a screenshot and the rough time it happened.
- I can pull the request log and pinpoint the issue directly.

I'm also going to be transparent about what happened: this bug shipped
because I never ran through the customer experience as a customer
would see it before handing you the keys. That's a process gap on my
end, not a Cloudflare issue. I've changed how launches work going
forward.

## Optional -- 15-minute call this week

Happy to walk through the dashboard with you and your team if it's
useful. Just send me a time that works (mornings or afternoons,
whatever fits your schedule).

Thanks again for flagging this cleanly. Real customer feedback at this
stage is the most valuable thing the platform gets.

Lance

---

P.S. The fixes deployed via continuous integration as commits d2fddd6,
0affe1e, and d4dea90. Greg or your dev team can verify if useful.
