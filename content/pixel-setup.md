# Retargeting Pixel Setup

Pixel placeholders are installed on the main site and check tool. Replace the placeholder IDs with real ones to activate.

---

## Meta Pixel (Facebook/Instagram Ads)

1. Go to Meta Events Manager: https://business.facebook.com/events_manager2
2. Create a new pixel (or use existing)
3. Copy the Pixel ID (numeric string like "123456789012345")
4. Replace `YOUR_PIXEL_ID` in these files:
   - `/index.html` (main site) -- 2 occurrences
   - `/tools/schema-check/src/index.ts` (check tool HTML) -- 2 occurrences
5. After replacing, copy index.html to dist/index.html and redeploy both Workers

**Events firing:**
- `PageView` -- every page load (main site + check tool)
- `ViewContent` -- when a user completes a scan (check tool, includes AEO score)
- `Lead` -- when a user submits their email for report (check tool)

**Audience suggestions:**
- All visitors (PageView) -- broad retargeting
- Scan completers (ViewContent) -- engaged, high intent
- Email submitters (Lead) -- hottest leads, exclude from prospecting, use for lookalike

---

## LinkedIn Insight Tag

1. Go to LinkedIn Campaign Manager: https://www.linkedin.com/campaignmanager/
2. Go to Account Assets > Insight Tag
3. Copy the Partner ID (numeric string like "1234567")
4. Replace `YOUR_PARTNER_ID` in the same files listed above -- 2 occurrences each
5. In Campaign Manager, set up conversion tracking:
   - "Scan Complete" -- fires on check tool scan result
   - "Lead" -- fires on email capture
6. Update `conversion_id: 0` in the check tool JS (2 places) with your actual conversion IDs

**Audience suggestions:**
- Website visitors (all pages) -- B2B retargeting
- Check tool users -- high intent segment
- Matched audiences from email list

---

## Check Tool Admin Secret

To access the referrer analytics endpoint:

1. Set the secret: `cd tools/schema-check && npx wrangler secret put ADMIN_SECRET`
2. Enter a strong random string when prompted
3. Access referrer data: `https://check.neverranked.com/api/admin/referrers?key=YOUR_SECRET`

The endpoint returns:
- `total` -- total scan events in last 90 days
- `referrers` -- array of `{source, count, pct}` sorted by volume
- `utmSources` -- array of `{source, count}` for UTM-tagged traffic

---

## UTM Links for Blog Articles

When sharing blog articles that link to the check tool, use UTM parameters:

```
https://check.neverranked.com/?utm_source=blog&utm_medium=article&utm_campaign=aeo-for-dentists
```

For social posts:
```
https://check.neverranked.com/?utm_source=linkedin&utm_medium=social&utm_campaign=check-tool
```

The check tool captures these automatically and stores them with each scan event.
