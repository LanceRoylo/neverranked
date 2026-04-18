# Email Deliverability Ops

Notes on Resend send paths from the dashboard worker, and the receiving side
for `@neverranked.com` addresses.

## Senders

| Purpose          | From address                            | Code path                           |
| ---------------- | --------------------------------------- | ----------------------------------- |
| Magic link       | `Never Ranked <login@neverranked.com>`  | `src/email.ts` `sendMagicLinkEmail` |
| Weekly digest    | `NeverRanked <reports@neverranked.com>` | `src/email.ts` `sendDigestEmail`    |
| Score regression | `NeverRanked <alerts@neverranked.com>`  | `src/email.ts` `sendRegressionAlert`|

All use the root `neverranked.com` domain — SPF/DKIM/DMARC must be valid in
Resend or Gmail will silently spam-filter.

## Receiving side: `@neverranked.com`

`neverranked.com` mail is handled by **Cloudflare Email Routing**, NOT Google
Workspace. Cloudflare matches recipient addresses **literally**. A rule for
`hello@neverranked.com` does NOT also catch `hello+anything@…`. Without a
catch-all rule or a specific rule, Cloudflare returns SMTP `550 5.1.1 Address
does not exist` and Resend treats this as a permanent bounce.

`hi.neverranked.com` is a separate Google Workspace mailbox. Workspace handles
`+` aliases natively, so `lance+anything@hi.neverranked.com` lands in
`lance@hi.neverranked.com` regardless of suffix.

## The Resend suppression trap

When Resend sees a permanent bounce (5.x.x), it adds the address to its
internal suppression list and **silently drops all future sends to it**. The
worker still logs "sent" because the API returns 2xx — but no email is actually
attempted. There is no manual UI to remove an address from suppression on
Resend's free tier; the easiest workaround is to use a different recipient
address.

This was the root cause of the 2026-04-17 magic-link issue. The flow was:

1. Test user had email `lance+pilot-admin@neverranked.com` in `users` table
2. No matching Cloudflare routing rule existed → Cloudflare returned 550
3. Resend recorded a permanent bounce and added the address to suppression
4. Every subsequent magic-link attempt: worker called Resend, got 2xx, logged "sent" — but Resend silently dropped it

## Test addresses

For test users, **use `@hi.neverranked.com` aliases** (real Workspace
mailbox), not `@neverranked.com` (Cloudflare-routed, requires explicit rules):

- Avoid: `lance+pilot-admin@neverranked.com` (no routing rule, will bounce)
- Prefer: `lance+pilotadmin@hi.neverranked.com` (Workspace, handles `+` natively)

Pattern for distinct test identities that all land in one inbox:

```
lance+pilotadmin@hi.neverranked.com
lance+blackoakclient@hi.neverranked.com
lance+anything@hi.neverranked.com
```

All deliver to `lance@hi.neverranked.com`.

## Real users

This issue does NOT affect real users signing up. Their email addresses are
real mailboxes on their own domains (e.g. `jane@someagency.com`), which accept
mail and don't bounce. The Cloudflare-routing trap is specific to
self-addressed test mail on `neverranked.com`.

## Diagnostic checklist

When a magic link doesn't arrive:

1. **Check `wrangler tail`** — `sendMagicLinkEmail` logs `Magic link sent to <email>` on 2xx and `Magic link to <email> failed: <status> <body>` on non-2xx. If you see `sent` but the user reports nothing, the issue is downstream of our worker.
2. **Check Resend dashboard** (https://resend.com/emails) — filter by recipient. Look for `Suppressed` (Resend dropped it), `Bounced` (the receiver rejected it), or no entry (our send didn't reach Resend).
3. **If Bounced**, click the entry and read the SMTP response. `550 5.1.1` = address doesn't exist. `550 5.7.1` = blocked / spam. Other 5.x.x codes are permanent.
4. **If Delivered but user doesn't see it** — check Gmail Spam and All Mail.
5. **If Suppressed** — Resend has the address on its internal block list from a prior bounce. Use a different recipient address, or upgrade Resend to manage suppressions via API.

## Worker-side fallback for pilot testing

If a magic link can't be delivered for any reason, pull the token directly:

```sh
wrangler d1 execute neverranked-app --remote \
  --command "SELECT token FROM magic_links WHERE email='<address>' ORDER BY created_at DESC LIMIT 1"
```

Then visit `https://app.neverranked.com/auth/verify?token=<token>`.
