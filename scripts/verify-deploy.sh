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
# Runs the same 5 checks we ran by hand after the A11 publish:
#   1. noindex tag absent (draft flag successfully flipped)
#   2. Article URL appears in blog index
#   3. Article URL appears in sitemap
#   4. BlogPosting schema is present in rendered HTML
#   5. FAQPage has Question nodes (count reported)
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
QUESTION_COUNT=$(echo "${HTML:-}" | grep -o '"@type":"Question"' | wc -l | tr -d ' ')
if [ "$QUESTION_COUNT" -ge 1 ]; then
  pass "$QUESTION_COUNT FAQPage Question node(s) present"
else
  fail "No FAQPage Question nodes found (expected >= 1 for articles with FAQ blocks)"
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
