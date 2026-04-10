#!/usr/bin/env bash
#
# voice-check.sh — Never Ranked pre-publish voice rubric enforcement
#
# Usage:
#   ./scripts/voice-check.sh <file-path>
#
# Example:
#   ./scripts/voice-check.sh audits/montaic/implementation/A12-fair-housing-listing-description-rules.md
#
# Runs the 5 hard-fail checks from remediation-template/voice-rubric-v0.md
# against the given file:
#   1. Em dash count (expect 0 in prose)
#   2. Semicolon count (expect 0 in prose, outside fenced code blocks)
#   3. AI filler phrases (the banned list)
#   4. Emojis (expect 0 in body)
#   5. Meta description first-phrase overlap with title (if frontmatter present)
#
# Prose extraction strips fenced code blocks so code examples with semicolons
# or em dashes do not false-flag. Frontmatter parsing (check 5) is best-effort
# and only runs when the file has a YAML frontmatter block at the top.
#
# Exit code 0 = all hard fails clean. Non-zero = at least one hard fail tripped.
#
# Best results when run against the final single-file markdown/MDX for the
# blog post. Against mixed staging files (master working docs with planning
# notes + draft), the checks will still run but will include planning prose.
#

set -euo pipefail

# --- Argument parsing ---------------------------------------------------------

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <file-path>" >&2
  exit 2
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE" >&2
  exit 2
fi

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

# --- Prose extraction: strip fenced code blocks -------------------------------
#
# Checks 1, 2, 3, 4 run against prose only. Code examples inside fenced
# ``` blocks are excluded so a semicolon in a JSON-LD example does not
# false-flag as marketing prose.

PROSE=$(mktemp)
trap 'rm -f "$PROSE"' EXIT

awk '
  /^```/ { in_code = !in_code; next }
  !in_code { print }
' "$FILE" > "$PROSE"

echo ""
echo "voice-check: $FILE"

# --- Check 1: em dashes -------------------------------------------------------

echo ""
echo "Check 1: em dashes (expect 0)"
EMDASH_COUNT=$({ grep -o '—' "$PROSE" || true; } | wc -l | tr -d ' ')
if [ "$EMDASH_COUNT" -eq 0 ]; then
  pass "em dash count: 0"
else
  fail "em dash count: $EMDASH_COUNT (expected 0)"
  grep -n '—' "$PROSE" | head -5 | sed 's/^/    /'
fi

# --- Check 2: semicolons in prose ---------------------------------------------

echo ""
echo "Check 2: semicolons in prose (expect 0 outside code blocks)"
SEMI_COUNT=$({ grep -o ';' "$PROSE" || true; } | wc -l | tr -d ' ')
if [ "$SEMI_COUNT" -eq 0 ]; then
  pass "semicolon count: 0"
else
  fail "semicolon count: $SEMI_COUNT (expected 0)"
  grep -n ';' "$PROSE" | head -5 | sed 's/^/    /'
fi

# --- Check 3: AI filler phrases -----------------------------------------------
#
# The banned list is maintained in remediation-template/voice-rubric-v0.md.
# If you add a phrase there, add it here too.

echo ""
echo "Check 3: AI filler phrases (expect 0 hits)"

FILLER_PHRASES=(
  "hidden gem"
  "rare opportunity"
  "Welcome to"
  "Nestled in"
  "fast-paced world"
  "ever-evolving landscape"
  "At its core"
  "worth noting that"
  "Delve into"
  "Navigate the complexities"
  "Unlock the potential"
  "Dive deep"
  "A must-have"
  "In the realm of"
  "Harness the power of"
  "Leverage cutting-edge"
  "game-changer"
  "game-changing"
  "Revolutionize"
  "Seamless"
  "seamlessly"
  "Robust"
  "Comprehensive suite"
)

FILLER_HITS=0
FILLER_DETAILS=""

for phrase in "${FILLER_PHRASES[@]}"; do
  HITS=$({ grep -icF "$phrase" "$PROSE" || true; } | tr -d ' ')
  if [ "$HITS" -gt 0 ]; then
    FILLER_HITS=$((FILLER_HITS + HITS))
    FILLER_DETAILS="${FILLER_DETAILS}    '$phrase' ($HITS)"$'\n'
  fi
done

if [ "$FILLER_HITS" -eq 0 ]; then
  pass "no AI filler phrases detected"
else
  fail "$FILLER_HITS AI filler phrase occurrence(s)"
  printf "%s" "$FILLER_DETAILS"
fi

# --- Check 4: emojis ----------------------------------------------------------
#
# Uses perl for portable Unicode regex (macOS BSD grep lacks -P).
# Covers the most common emoji blocks: misc symbols, dingbats, emoticons,
# transport, supplemental symbols.

echo ""
echo "Check 4: emojis (expect 0)"
EMOJI_COUNT=$(perl -CSD -ne '
  while (/[\x{2600}-\x{27BF}\x{1F300}-\x{1F5FF}\x{1F600}-\x{1F64F}\x{1F680}-\x{1F6FF}\x{1F900}-\x{1F9FF}]/g) { $c++ }
  END { print ($c // 0) }
' "$PROSE")

if [ "$EMOJI_COUNT" -eq 0 ]; then
  pass "emoji count: 0"
else
  fail "emoji count: $EMOJI_COUNT (expected 0)"
  perl -CSD -ne '
    if (/[\x{2600}-\x{27BF}\x{1F300}-\x{1F5FF}\x{1F600}-\x{1F64F}\x{1F680}-\x{1F6FF}\x{1F900}-\x{1F9FF}]/) {
      print "    $.: $_";
      $n++;
      exit if $n >= 5;
    }
  ' "$PROSE"
fi

# --- Check 5: meta description first-phrase overlap with title --------------
#
# Only runs if the file has a YAML frontmatter block. Best-effort parse:
# handles quoted and unquoted title/description values. If frontmatter is
# absent or malformed, the check is skipped (not failed).

echo ""
echo "Check 5: meta description does not start with title's opening phrase"

if head -1 "$FILE" | grep -q '^---[[:space:]]*$'; then
  TITLE=$(awk '
    /^---[[:space:]]*$/ { c++; next }
    c == 1 && /^title:/ {
      sub(/^title:[[:space:]]*/, "")
      gsub(/^"|"$/, "")
      gsub(/^'"'"'|'"'"'$/, "")
      print
      exit
    }
  ' "$FILE")

  DESC=$(awk '
    /^---[[:space:]]*$/ { c++; next }
    c == 1 && /^description:/ {
      sub(/^description:[[:space:]]*/, "")
      gsub(/^"|"$/, "")
      gsub(/^'"'"'|'"'"'$/, "")
      print
      exit
    }
  ' "$FILE")

  if [ -z "$TITLE" ] || [ -z "$DESC" ]; then
    echo "  SKIP: frontmatter present but title or description missing"
  else
    # First 4 words of title, lowercased
    TITLE_PREFIX=$(echo "$TITLE" | awk '{
      for (i = 1; i <= 4 && i <= NF; i++) printf "%s ", tolower($i)
      print ""
    }' | sed 's/[[:space:]]*$//')

    DESC_LOWER=$(echo "$DESC" | tr '[:upper:]' '[:lower:]')

    if [ -n "$TITLE_PREFIX" ] && [ "${DESC_LOWER#$TITLE_PREFIX}" != "$DESC_LOWER" ]; then
      fail "description starts with title's first 4 words: '$TITLE_PREFIX'"
    else
      pass "description does not echo title's opening"
    fi
  fi
else
  echo "  SKIP: no YAML frontmatter detected"
fi

# --- Summary ------------------------------------------------------------------

echo ""
echo "-------------------------------------------------"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo "-------------------------------------------------"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo ""
  echo "Voice check failed. Fix hard-fails before flipping draft: false."
  exit 1
fi

echo ""
echo "Voice check clean. Safe to proceed with publish."
exit 0
