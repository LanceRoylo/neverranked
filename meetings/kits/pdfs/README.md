# PDF leave-behind packet

Chrome-headless PDF renders of the 7 public surfaces, plus a
bundled leave-behind packet for after-meeting follow-up.

Generated 2026-05-21. Regenerate any time with:

```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p meetings/kits/pdfs
for slug in retraction example-engagement methodology for-agencies security first-30-days; do
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf=meetings/kits/pdfs/$slug.pdf "https://neverranked.com/$slug/"
done
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=meetings/kits/pdfs/homepage.pdf "https://neverranked.com/"
pdfunite \
  meetings/kits/pdfs/retraction.pdf \
  meetings/kits/pdfs/example-engagement.pdf \
  meetings/kits/pdfs/methodology.pdf \
  meetings/kits/pdfs/security.pdf \
  meetings/kits/pdfs/LEAVE-BEHIND-PACKET.pdf
```

## What's in here

- **LEAVE-BEHIND-PACKET.pdf** — 4 sections (retraction,
  example-engagement, methodology, security) bundled into one
  PDF. This is the after-meeting leave-behind: send to a
  prospect right after a meeting so they have the substance on
  hand without clicking through seven URLs.
- **homepage.pdf** — landing page.
- **retraction.pdf** — the kill-test story.
- **example-engagement.pdf** — what $4,500 produces.
- **methodology.pdf** — how we measure.
- **for-agencies.pdf** — agency channel page.
- **security.pdf** — research-engagement security posture.
- **first-30-days.pdf** — what happens after signing.

## When to send which

- **After a direct-buyer meeting (Mark-type):** LEAVE-BEHIND-PACKET.pdf
  is the right single attachment. Covers the credibility wedge
  + substance + methodology + procurement-team coverage.
- **After an agency meeting (James-type):** for-agencies.pdf
  attached, plus a link to neverranked.com for the rest.
- **To a compliance/IT team that needs to review:** security.pdf
  alone.
- **To someone who only wants the story:** retraction.pdf alone.
- **To someone signing a kickoff:** first-30-days.pdf attached
  to the kickoff agreement email.

## Notes on these PDFs

- All seven public pages have `noindex, nofollow` meta tags.
  Flipping to `index, follow` is Lance's call (the right
  moment is when one paying customer signs). These PDFs are
  not affected by that decision.
- Each PDF is print-styled via the page's CSS, so dark-mode
  background prints as dark. If a prospect needs ink-friendly
  printable, they can render the URL via their own browser's
  print-to-PDF, which respects browser print stylesheets.
- Source URLs and the GitHub source-code link are embedded as
  clickable links in the PDFs.

## Regenerating after a page rewrite

If any of the 7 public pages get rewritten, regenerate that
slug's PDF with:

```sh
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=meetings/kits/pdfs/<slug>.pdf "https://neverranked.com/<slug>/"
```

And rebuild the LEAVE-BEHIND-PACKET.pdf with the `pdfunite`
command at the top.
