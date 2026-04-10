# Cloudflare Pages Deploy — Never Ranked

**Time required:** 5-15 minutes depending on whether you want a custom domain today.

You have two paths. Both work. **Path A** is faster for a first ship. **Path B** is better long-term because every future commit auto-deploys.

---

## Path A — Direct upload (5 minutes, no custom domain yet)

This gets you a working URL at `neverranked.pages.dev` in under five minutes. No GitHub connection, no build configuration, no DNS.

### Steps

1. **Log into Cloudflare** at https://dash.cloudflare.com/

2. **In the left sidebar, click `Workers & Pages`**

3. **Click `Create application`** → select the **`Pages`** tab → click **`Upload assets`**

4. **Project name:** `neverranked`
   (This becomes `neverranked.pages.dev`. If that's already taken, try `neverranked-site` or `neverranked-agency`.)

5. **Production branch:** `main` (doesn't matter for direct upload but Cloudflare asks)

6. **Click `Create project`**

7. **Upload the contents of this folder** — drag the entire `neverranked/` folder (or select "Upload folder") from your local machine.

   **What NOT to upload:** Cloudflare Pages doesn't respect `.gitignore`, so it'll upload EVERYTHING in the folder including the `audits/`, `audit-template/`, `scripts/`, and `content/` folders. You have two options:

   **Option 1 (easier):** Let it upload everything. The `_headers` file and `robots.txt` I wrote will prevent the crawler from indexing those folders, and nobody will find the URLs unless they guess them. They're still publicly accessible though.

   **Option 2 (cleaner):** Create a deploy-only subfolder first:
   ```bash
   mkdir -p /tmp/neverranked-deploy
   cp index.html og.png og-source.html robots.txt sitemap.xml _headers /tmp/neverranked-deploy/
   ```
   Then upload `/tmp/neverranked-deploy/` to Cloudflare Pages. This uploads ONLY the site files and keeps everything else off the public internet.

   **My recommendation: Option 2.** Keeps the Montaic audit and launch post private until you're ready to publish them.

8. **Click `Deploy site`**

9. **Wait ~30 seconds.** Cloudflare processes the upload and shows you a live URL.

10. **Click the live URL.** Should be `https://neverranked.pages.dev` (or whatever project name you chose).

11. **Verify the site renders correctly** — hero, problem, services, pricing, audit, closing.

12. **Test the og:image** — paste the URL into https://www.linkedin.com/post-inspector/ and confirm the branded image shows.

That's it. Live URL in production.

---

## Path B — GitHub-connected deploy (10-15 minutes, auto-deploys future commits)

This sets up automatic deploys every time you push to `main`. Better for iteration.

**Prerequisite:** The repo is already pushed to `https://github.com/LanceRoylo/neverranked` (private).

### Steps

1. **Log into Cloudflare** at https://dash.cloudflare.com/

2. **Workers & Pages** → **`Create application`** → **`Pages`** tab → **`Connect to Git`**

3. **Authorize the Cloudflare Pages GitHub app** (if not already). Grant it access to only `LanceRoylo/neverranked` or all repos — your choice.

4. **Select the `neverranked` repository**

5. **Production branch:** `main`

6. **Build settings:**
   - Framework preset: **`None`**
   - Build command: **(leave blank)**
   - Build output directory: **`/`**
   - Root directory: **(leave blank)**

7. **Environment variables:** None needed.

8. **Click `Save and Deploy`**

9. **Wait ~30 seconds** for the first deploy.

10. **Live URL appears** as `https://neverranked.pages.dev` (or similar).

From now on, every time you `git push origin main`, Cloudflare auto-deploys within 30 seconds. That's the main benefit of this path.

**Caveat:** Cloudflare will deploy EVERYTHING in the repo by default, including `audits/`, `audit-template/`, `scripts/`, and `content/`. The `_headers` file and `robots.txt` prevent indexing, but the URLs are still technically accessible. If you want a truly clean deploy, either:

- Move the marketing site files to a `/site/` subfolder and set the build output directory to `/site`
- Or use a `.cloudflareignore` file (if supported)
- Or just accept that the audit and launch post files are publicly accessible (which is actually fine once you're ready to launch publicly)

**My recommendation: Path A (direct upload of a cleaned-up subfolder) for the first deploy, then migrate to Path B after the Montaic before/after is published.**

---

## Connecting a real domain (5-10 minutes extra, optional)

Once you've got the Pages site working at `neverranked.pages.dev`, you can connect `neverranked.com`.

**Prerequisites:**
- You own the domain (buy at Porkbun, Namecheap, or Cloudflare Registrar)
- The domain is either at Cloudflare Registrar already or you've updated the nameservers to point at Cloudflare

**Steps:**

1. **In Cloudflare Dashboard** → your `neverranked` Pages project → **`Custom domains`** tab

2. **Click `Set up a custom domain`**

3. **Enter `neverranked.com`**

4. Cloudflare either creates the CNAME automatically (if the domain is on Cloudflare DNS) or gives you a CNAME record to add at your registrar.

5. **Wait for DNS propagation** — usually 5-30 minutes, sometimes up to a few hours.

6. **Verify** — https://neverranked.com/ should now load your site with a valid TLS cert (Cloudflare handles this).

7. **Repeat for www.neverranked.com** if you want both variants to work.

---

## After deploy — verification checklist

- [ ] Visit the live URL in an incognito window
- [ ] Hero renders correctly
- [ ] Scroll through and verify all sections appear (problem, proof, services, how we work, pricing, audit, closing)
- [ ] Mobile check — resize window to 375px or use browser devtools mobile mode
- [ ] Click the `$500 Audit →` button in the nav — should scroll to the audit section
- [ ] Click `Book the audit →` — should open your mail app with a pre-filled email to `hello@neverranked.com`
- [ ] View page source in devtools and confirm:
  - [ ] `<link rel="canonical">` is present
  - [ ] `<meta property="og:image">` points to `/og.png`
  - [ ] `<script type="application/ld+json">` block is present with Organization, WebSite, ProfessionalService
- [ ] [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) — paste the URL, check the preview card shows the branded og.png
- [ ] [Twitter Card Validator](https://cards-dev.twitter.com/validator) — same check
- [ ] [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — same check
- [ ] [Rich Results Test](https://search.google.com/test/rich-results) — paste the URL, verify Organization + WebSite + ProfessionalService schemas all parse cleanly

---

## If something goes wrong

**Site loads but looks broken:**
- Most likely the fonts aren't loading due to a Content-Security-Policy mismatch. Check the browser console. The Google Fonts preconnect should work by default.

**og:image isn't showing in link previews:**
- The file is at `https://{your-url}/og.png`. Visit that URL directly in a browser — should show the image.
- If the file is there but preview sites don't show it, it might be a cache. Force refresh via LinkedIn Post Inspector's "Inspect" button which busts the cache.

**Schema isn't validating:**
- Paste the full URL into https://search.google.com/test/rich-results
- If there are warnings, they're usually about missing optional fields — not fatal.
- If there are errors, something in the JSON-LD got corrupted during deploy. Check the raw page source.

**Custom domain won't connect:**
- Most common cause: DNS hasn't propagated. Wait 30 min and retry.
- Second most common: the CNAME record is pointing at the wrong target. Cloudflare Pages custom domain docs are at https://developers.cloudflare.com/pages/configuration/custom-domains/

---

## What you get after deploy

- A working public URL for Never Ranked
- Automatic HTTPS with a Cloudflare-managed TLS cert
- Global edge caching (the site loads fast everywhere)
- Auto-deploy on every git push (if you chose Path B)
- The ability to put the URL in your email signature, LinkedIn profile, and sales outreach today

That's enough to start taking the site to prospects. Everything after that — the Montaic implementation, the launch post, the entity registration — is content you build on top of this foundation.
