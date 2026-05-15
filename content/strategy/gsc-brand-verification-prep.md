---
title: "GSC brand verification application prep"
prepared: 2026-05-10
status: ready to apply
target_form: https://console.cloud.google.com/auth/branding?project=neverranked
---

# Everything ready for the Google brand verification form

When you open the form tomorrow, we go field by field. Below is the content
for each field. Copy-paste only -- no writing on the fly.

---

## Section 1: App information

### App name
```
NeverRanked
```

### User support email
```
lance@neverranked.com
```
(If that bounces or you'd rather not expose it publicly, alternates: `support@neverranked.com`, `hello@neverranked.com` -- whichever inbox you actually monitor.)

### App logo
- File: `/Users/lanceroylo/Desktop/neverranked/linkedin/images/logo-300.png` (300×300px)
- Google requires 120×120 minimum, square, PNG. The 300×300 will work; Google scales down
- If you want a fresh version, the favicon is at `/Users/lanceroylo/Desktop/neverranked/favicon.png`

---

## Section 2: App domain

### Application home page
```
https://neverranked.com
```

### Application privacy policy link
```
https://neverranked.com/privacy
```
**Important:** before submitting, the privacy policy needs a GSC-specific section added. See Section 7 below.

### Application terms of service link
```
https://neverranked.com/terms
```

---

## Section 3: Authorized domains

Domain roots only, no protocol, no paths. Add these one at a time:

```
neverranked.com
```

If Google asks for additional domains (sometimes it does), also add:

```
app.neverranked.com
check.neverranked.com
```

---

## Section 4: Developer contact information

### Email addresses
```
lance@neverranked.com
```
(Add additional emails you want Google to reach you at. They use this for verification updates, security notices, and policy changes. Recommend at least one inbox you check daily.)

---

## Section 5: Scopes (separate step after Branding)

After the Branding tab, there's a "Data Access" or "Scopes" tab. Add this scope:

```
https://www.googleapis.com/auth/webmasters.readonly
```

This is marked as a "restricted" scope. Google will require justification (Section 6).

---

## Section 6: Verification submission

### Why your app needs this scope (Justification)

Paste this into the scope justification field:

```
NeverRanked is an Answer Engine Optimization (AEO) measurement platform that helps small and mid-market businesses understand how their websites perform across AI search engines (ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma) and traditional search.

The webmasters.readonly scope is used exclusively to read aggregate search performance data (impressions, clicks, queries, average position) from each user's Google Search Console properties. This data is correlated with our AI citation tracking to give customers a complete picture of their search visibility across both traditional and AI-driven search surfaces.

Specifically, we use:
- searchanalytics.query: weekly pulls of top queries, clicks, impressions, and average position per property
- sites.list: enumerate the GSC properties the authenticated user has access to, so customers can pick which property maps to which dashboard client

We do not write to any Search Console property. We do not modify, submit, verify, or remove anything. Access is strictly read-only and limited to the authenticated user's existing GSC properties.

Data is stored encrypted in our Cloudflare D1 database, retained for the active subscription period plus 30 days, and never shared with third parties or used for model training.

A service-account alternative was evaluated but is not viable: our customers grant access to their own GSC properties, and the GSC UI does not accept service-account emails through "Users and permissions" without DNS-level domain verification, which most of our small-business customers cannot perform on demand. User-OAuth is the only path that allows our customers to grant read access to NeverRanked through a one-click consent flow.
```

### How user data is handled

```
GSC data fetched via webmasters.readonly is stored exclusively for the dashboard's customer-facing reports and for internal pattern analysis (e.g., aggregating "GSC clicks lost when AI citation share rose" across customers, anonymized).

Specifically:
- Search performance rows are stored in our Cloudflare D1 database under the gsc_snapshots table, scoped per customer
- Data is retained for 12 weeks rolling for customer dashboards, plus a full historical archive available to the customer for their own period of active subscription
- 30 days after subscription cancellation, all GSC data tied to that customer is purged
- We do not share GSC data with any third party
- We do not use GSC data for advertising, lookalike modeling, or training any machine learning model
- We do not aggregate GSC data across customers in ways that expose any individual customer's data to another
```

### Demo video script (record on YouTube, unlisted)

You'll need to record a 1-3 minute screen recording showing:

1. **A user signing in to NeverRanked** (the dashboard login flow)
2. **Navigating to the GSC integration page** (`/admin/gsc`)
3. **Clicking "Connect Google Search Console"**
4. **The Google OAuth consent screen** appearing, with the requested scope `webmasters.readonly` visible
5. **Granting consent**, returning to NeverRanked
6. **Showing the GSC properties list** that appears after consent
7. **Linking a GSC property to a customer dashboard client slug**
8. **Pulling latest GSC data** and showing the dashboard display the data (top queries, clicks, impressions)
9. **Disconnecting** (showing the user can revoke at any time)

Narration suggestions:
- "This is NeverRanked, an AEO measurement platform."
- "When a customer wants to see their search performance, they connect Google Search Console here."
- "We request webmasters.readonly, the read-only scope."
- "After consent, we show the GSC properties the user has access to."
- "The customer picks which property maps to which dashboard client."
- "We pull aggregate search performance data weekly. Here it is rendered in the dashboard."
- "If they want to revoke access, they can disconnect right here, and we delete the token."

Upload to YouTube as **Unlisted** (not Private -- Google needs to be able to view it). Paste the link into Google's verification form when it asks for "a demonstration of how your application uses the requested scopes."

---

## Section 7: Privacy policy addendum (ship before submitting form)

The current /privacy page covers email, domain URLs, IP hashes, usage analytics, cookies. It does not cover GSC data. Google will reject the verification request without this section. Add this to the existing privacy policy under a new heading:

```html
<h2>08. Google Search Console data</h2>

<p>When you connect your Google Search Console (GSC) account, we request read-only
access to your search performance data using the <code>webmasters.readonly</code>
scope. This grant is initiated by you at any time and revocable at any time.</p>

<p><strong>What we access:</strong></p>
<ul>
  <li>Search analytics (impressions, clicks, queries, average position) for the
      GSC properties you select</li>
  <li>The list of GSC properties associated with your authenticated Google account,
      so you can choose which properties to link to which dashboard client</li>
</ul>

<p><strong>What we do not access:</strong></p>
<ul>
  <li>We do not write, submit, modify, verify, or remove anything in your GSC properties</li>
  <li>We do not access any Google service other than Search Console</li>
  <li>We do not read your Gmail, Drive, Calendar, or any other Google data</li>
</ul>

<p><strong>How long we keep it:</strong></p>
<ul>
  <li>Active customers: weekly snapshots retained for 12 weeks rolling, plus a
      full historical archive available to you during your active subscription</li>
  <li>30 days after subscription cancellation, all GSC data tied to your account
      is permanently deleted</li>
</ul>

<p><strong>How we use it:</strong></p>
<ul>
  <li>To show you your search performance in the dashboard</li>
  <li>To correlate traditional search performance with AI citation data so you
      can see how AEO changes affect total visibility</li>
  <li>Internal pattern analysis across customers in anonymized aggregate (e.g.,
      "average GSC click change when AI citation share rises 10 percentage points")</li>
</ul>

<p><strong>How we do not use it:</strong></p>
<ul>
  <li>We do not sell GSC data to third parties</li>
  <li>We do not use GSC data for advertising, lookalike modeling, or training
      any machine learning model</li>
  <li>We do not share your individual GSC data with any other customer</li>
</ul>

<p><strong>How to revoke:</strong></p>
<ul>
  <li>Disconnect at any time at <a href="https://app.neverranked.com/admin/gsc">app.neverranked.com/admin/gsc</a></li>
  <li>Or revoke directly at
      <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a></li>
  <li>On revocation, your existing GSC snapshots remain in your dashboard until
      you delete them or your subscription ends</li>
</ul>

<p><strong>Google API Services User Data Policy:</strong> NeverRanked's use and
transfer of information received from Google APIs adheres to the
<a href="https://developers.google.com/terms/api-services-user-data-policy">Google
API Services User Data Policy</a>, including the Limited Use requirements.</p>
```

That last paragraph (the Google API Services User Data Policy disclosure) is required by Google's verification process. Don't skip it.

---

## Section 8: Order of operations tomorrow

1. **Ship the privacy policy update first.** The Google reviewer will check
   `https://neverranked.com/privacy` and look for the GSC section. If it's not
   there, the verification request gets rejected and you start over. So: paste
   the addendum from Section 7 into the live `/privacy` page, commit, push,
   verify it shows up at the live URL.

2. **Open the Branding form.** Walk through Sections 1-4 above, copy-pasting
   field by field.

3. **Open the Data Access / Scopes tab.** Add the scope from Section 5.

4. **Click "Publish App."** This submits the basic configuration for production
   status. The publishing button moves the app from Testing to In Production.

5. **Google's verification flow kicks in.** They'll email you within ~24h with
   next steps. Typically they ask for:
   - Scope justification (paste from Section 6)
   - Demo video URL (record per Section 6, post to YouTube unlisted)
   - Privacy policy review confirmation
   - Sometimes additional clarifying questions

6. **Approval typically lands in 4-6 business days** for legitimate businesses
   with clean privacy policies. If they request additional security review,
   we'll cross that bridge then -- most apps in our profile don't need it.

7. **Once approved**: refresh tokens never expire on day 7 again. Lance does
   one final GSC OAuth re-auth after approval to issue a "real" production-grade
   refresh token, and that token lasts indefinitely.

---

## Open questions to resolve before submission

- [ ] Is `lance@neverranked.com` the right support email for public disclosure,
      or should we use a generic alias like `support@`?
- [ ] Do you want to add `app.neverranked.com` and `check.neverranked.com` to
      authorized domains, or leave them out and let Google ask if needed?
- [ ] Logo: use `linkedin/images/logo-300.png` or generate a fresh 512×512 PNG
      from the wordmark for higher resolution?
- [ ] YouTube channel for the demo video: existing NR channel, or use Lance's
      personal channel and set the video to Unlisted?

We resolve these one-by-one as we walk through the form together.
