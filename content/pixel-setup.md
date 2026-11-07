# Retargeting Pixel Setup

All ad tags live in one file: `/track.js` at the repo root. It loads on public
neverranked.com pages (the build adds the script tag) and on
check.neverranked.com. It stays inert, with no network call and no cookie, until
an ID is set.

---

## Turning them on

1. Meta Pixel ID: Meta Events Manager, Data Sources. Paste it into
   `META_PIXEL_ID` in `/track.js`.
2. LinkedIn Partner ID: Campaign Manager, Data, Insight Tag. Paste it into
   `LINKEDIN_PARTNER_ID` in `/track.js`.
3. LinkedIn conversions: create "Free check result", "Free check email" and
   "Answer check checkout" in Campaign Manager, then paste the three numeric IDs
   into `LINKEDIN_CONVERSIONS` in `/track.js`.
4. Merge to main. The site deploy ships it. The check tool picks it up from
   neverranked.com, so it needs no redeploy.

**Keep Automatic Advanced Matching OFF** in Meta Events Manager, and leave
LinkedIn's email-based enhanced matching off. The privacy page says we do not
send either company an email address.

## Events

| Event | Meta | LinkedIn | When |
|---|---|---|---|
| Page view | PageView | automatic | Every public page |
| `scan_complete` | ViewContent | conversion | Free check result shows |
| `lead` | Lead | conversion | Email captured on the free check |
| `pricing_view` | ViewContent | none | /pricing/ loads |
| `checkout` | InitiateCheckout, $249 | conversion | Click on the $249 Stripe link |

## What is never sent

No email, no checked site, no score. The tags do not load on a URL with an
unknown query string, on pitch pages, the Atlas preview or takedown pages, or
when the browser sends Global Privacy Control or Do Not Track. On the check page
`?url=` is removed from the address before any tag reads it.

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
