#!/usr/bin/env bash
#
# verify-deploy.sh — Never Ranked post-publish verification suite
#
# Usage:
#   ./scripts/verify-deploy.sh <article-url> [blog-index-url] [sitemap-url]
#
# Example:
#   ./scripts/verify-deploy.sh \
#     https://montaic.com/blog/fair-housing-ai-compliance-agents \
#     https://montaic.com/blog \
#     https://montaic.com/sitemap.xml
#
# Runs the checks we built up across A11 and A12 publishes:
#   1. noindex tag absent (draft flag successfully flipped)
#   2. Article URL appears in blog index
#   3. Article URL appears in sitemap
#   4. BlogPosting schema is present in rendered HTML
#   5. FAQPage has Question nodes (count reported)
#   6. BreadcrumbList schema is present in rendered HTML
#   7. External citation URLs in JSON-LD are reachable (follow redirects, 200)
#
# Exit code 0 = all checks passed. Non-zero = at least one check failed.

set -euo pipefail

# --- Argument parsing ---------------------------------------------------------

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <article-url> [blog-index-url] [sitemap-url]" >&2
  exit 2
fi

ARTICLE_URL="$1"
BLOG_INDEX_URL="${2:-}"
SITEMAP_URL="${3:-}"

# Derive the article slug from the URL (everything after the last /)
ARTICLE_SLUG="${ARTICLE_URL##*/}"

# --- Helpers ------------------------------------------------------------------

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "  PASS: $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo "  FAIL: $1" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

fetch() {
  # -s silent, -L follow redirects, -f fail on HTTP errors, 15s timeout
  curl -sLf --max-time 15 "$1"
}

# --- Check 1: noindex absent --------------------------------------------------

echo ""
echo "Check 1: noindex tag absent"
if HTML=$(fetch "$ARTICLE_URL"); then
  NOINDEX_COUNT=$(echo "$HTML" | grep -c 'noindex' || true)
  if [ "$NOINDEX_COUNT" -eq 0 ]; then
    pass "noindex is absent ($ARTICLE_URL)"
  else
    fail "noindex found $NOINDEX_COUNT time(s) — draft flag may still be true"
  fi
else
  fail "Could not fetch $ARTICLE_URL"
fi

# --- Check 2: article in blog index -------------------------------------------

if [ -n "$BLOG_INDEX_URL" ]; then
  echo ""
  echo "Check 2: article appears in blog index"
  if INDEX_HTML=$(fetch "$BLOG_INDEX_URL"); then
    INDEX_MATCHES=$(echo "$INDEX_HTML" | grep -c "$ARTICLE_SLUG" || true)
    if [ "$INDEX_MATCHES" -ge 1 ]; then
      pass "slug '$ARTICLE_SLUG' found in blog index ($INDEX_MATCHES match(es))"
    else
      fail "slug '$ARTICLE_SLUG' not in blog index"
    fi
  else
    fail "Could not fetch $BLOG_INDEX_URL"
  fi
else
  echo ""
  echo "Check 2: skipped (no blog index URL provided)"
fi

# --- Check 3: article in sitemap ----------------------------------------------

if [ -n "$SITEMAP_URL" ]; then
  echo ""
  echo "Check 3: article appears in sitemap"
  if SITEMAP=$(fetch "$SITEMAP_URL"); then
    SITEMAP_MATCHES=$(echo "$SITEMAP" | grep -c "$ARTICLE_SLUG" || true)
    if [ "$SITEMAP_MATCHES" -ge 1 ]; then
      pass "slug '$ARTICLE_SLUG' found in sitemap ($SITEMAP_MATCHES match(es))"
    else
      fail "slug '$ARTICLE_SLUG' not in sitemap"
    fi
  else
    fail "Could not fetch $SITEMAP_URL"
  fi
else
  echo ""
  echo "Check 3: skipped (no sitemap URL provided)"
fi

# --- Check 4: BlogPosting schema present --------------------------------------

echo ""
echo "Check 4: BlogPosting schema present"
if BLOG_POSTING=$(echo "${HTML:-}" | grep -o '"@type":"BlogPosting"' | head -1); then
  if [ -n "$BLOG_POSTING" ]; then
    pass "BlogPosting schema is on the page"
  else
    fail "BlogPosting schema not found in rendered HTML"
  fi
else
  fail "BlogPosting schema not found in rendered HTML"
fi

# --- Check 5: FAQPage Question nodes ------------------------------------------

echo ""
echo "Check 5: FAQPage Question nodes"
# Note: the `|| true` on grep is load-bearing — without it, an article with
# zero Question nodes trips pipefail and crashes the script before the
# `if [ "$QUESTION_COUNT" -ge 1 ]` branch runs.
QUESTION_COUNT=$({ echo "${HTML:-}" | grep -o '"@type":"Question"' || true; } | wc -l | tr -d ' ')
if [ "$QUESTION_COUNT" -ge 1 ]; then
  pass "$QUESTION_COUNT FAQPage Question node(s) present"
else
  fail "No FAQPage Question nodes found (expected >= 1 for articles with FAQ blocks)"
fi

# --- Check 6: BreadcrumbList schema present -----------------------------------

echo ""
echo "Check 6: BreadcrumbList schema present"
BREADCRUMB_COUNT=$({ echo "${HTML:-}" | grep -o '"@type":"BreadcrumbList"' || true; } | wc -l | tr -d ' ')
if [ "$BREADCRUMB_COUNT" -ge 1 ]; then
  pass "BreadcrumbList schema is on the page"
else
  fail "BreadcrumbList schema not found in rendered HTML"
fi

# --- Check 7: external citation URLs reachable -------------------------------
#
# Extracts URLs from any "citation" array inside <script type="application/ld+json">
# blocks, then curls each one with browser-like User-Agent and follows redirects.
# Any URL that does not resolve to 200 is reported as a fail. URLs are deduped
# so the same citation appearing in multiple schema nodes only gets checked once.

echo ""
echo "Check 7: external citation URLs reachable"

if [ -z "${HTML:-}" ]; then
  fail "Cannot extract citation URLs — article HTML was not fetched"
else
  CITATION_URLS=$(printf "%s" "$HTML" | perl -0777 -ne '
    while (m{<script[^>]*application/ld\+json[^>]*>(.*?)</script>}gs) {
      my $json = $1;
      while ($json =~ m{"citation"\s*:\s*\[(.*?)\]}gs) {
        my $arr = $1;
        while ($arr =~ m{"url"\s*:\s*"([^"]+)"}g) {
          print "$1\n";
        }
      }
    }
  ' | sort -u)

  if [ -z "$CITATION_URLS" ]; then
    echo "  SKIP: no citation URLs found in JSON-LD (article may not use citation array)"
  else
    CITATION_FAIL_COUNT=0
    CITATION_TOTAL=0
    UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    while IFS= read -r citation_url; do
      [ -z "$citation_url" ] && continue
      CITATION_TOTAL=$((CITATION_TOTAL + 1))
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 15 -A "$UA" "$citation_url" || echo "000")
      if [ "$STATUS" = "200" ]; then
        echo "    [$STATUS] $citation_url"
      else
        echo "    [$STATUS] $citation_url  <-- expected 200" >&2
        CITATION_FAIL_COUNT=$((CITATION_FAIL_COUNT + 1))
      fi
    done <<< "$CITATION_URLS"

    if [ "$CITATION_FAIL_COUNT" -eq 0 ]; then
      pass "all $CITATION_TOTAL citation URL(s) reachable"
    else
      fail "$CITATION_FAIL_COUNT of $CITATION_TOTAL citation URL(s) not reachable"
    fi
  fi
fi

# --- Summary + Rich Results Test link -----------------------------------------

echo ""
echo "-------------------------------------------------"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo ""
echo "Final manual step:"
echo "  Paste this URL into Google Rich Results Test:"
echo "  https://search.google.com/test/rich-results?url=$(printf '%s' "$ARTICLE_URL" | sed 's|:|%3A|g; s|/|%2F|g')"
echo ""
echo "  Expected: all detected items valid, no errors."
echo "-------------------------------------------------"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0
