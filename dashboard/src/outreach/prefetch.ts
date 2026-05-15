/**
 * Pre-fetch detection for email open tracking pixels.
 *
 * Modern email clients aggressively pre-fetch images the moment a
 * message lands in the inbox -- not when the human reads it. Without
 * filtering, every send shows up as an "open" within seconds, and the
 * warm-prospect surface ranks junk. This module classifies an open
 * event as a real human read vs. a client pre-fetch based on the
 * User-Agent string.
 *
 * Sources:
 *   - Gmail Image Proxy: docs.google.com publishes the GoogleImageProxy
 *     UA. Always pre-fetches; arrives within seconds of delivery.
 *   - Apple Mail Privacy Protection (iOS 15+ / macOS 12+): Apple routes
 *     pixels through a private relay that pre-fetches on receipt. UAs
 *     look like real Apple Mail clients but originate from Apple's
 *     edge. The most reliable tell is the request signature, but the
 *     UA itself contains "Mail/" and runs from privaterelay.appleid.com
 *     when CF reverse-resolves it. We match on UA only here; an IP-
 *     range check is a possible future enhancement.
 *   - Bot/empty UAs: link-checking tools, antivirus scanners, mailbox
 *     warm-up services. Any UA matching these patterns is filtered.
 *
 * NOT yet covered (future work):
 *   - Time-since-send filter: needs send timestamps in D1. The local
 *     outreach tool has them; the dashboard does not yet. Once
 *     /api/admin/sync-prospects pushes last_sent_at, we can flag any
 *     open within 60 seconds of send as pre-fetch regardless of UA.
 *   - IP clustering: same ip_hash hitting many different prospects'
 *     emails in a short window = proxy fingerprint. Requires a
 *     follow-up SQL aggregation pass.
 */

export interface PrefetchVerdict {
  isPrefetch: boolean;
  reason: string | null; // e.g. "gmail_proxy", "apple_mpp", "empty_ua", "bot"
}

const PREFETCH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Bare "Mozilla/5.0" with nothing else. No real browser ships this
  // UA -- it's the signature of batch scanners (likely Apple MPP edge,
  // some link-checkers, and the mystery scanner that hit four of our
  // prospects at the exact same second on 2026-05-14). Verified against
  // production D1: 101 hits in 24h, always synchronous with delivery.
  // Match only the bare string, optionally with trailing whitespace --
  // a real "Mozilla/5.0 (Windows..." UA is fine.
  { pattern: /^Mozilla\/5\.0\s*$/, reason: "bare_mozilla_scanner" },

  // Gmail content sampler -- distinct from GoogleImageProxy. Appears
  // as a normal-looking Chrome UA with "Gmail-content-sampling"
  // appended. Verified in D1 24h window.
  { pattern: /Gmail-content-sampling/i, reason: "gmail_sampler" },

  // Microsoft Defender SafeLinks masquerades as Edge 12, which shipped
  // in 2015 and is otherwise extinct. Any Edge/12.x UA on a 2026
  // pixel is the scanner, not a human.
  { pattern: /Edge\/12\./i, reason: "defender_safelinks" },

  // Gmail Image Proxy. Authoritative; never a human read.
  { pattern: /GoogleImageProxy/i, reason: "gmail_proxy" },
  { pattern: /googleusercontent\.com/i, reason: "gmail_proxy" },
  { pattern: /ggpht\.com/i, reason: "gmail_proxy" },

  // Yahoo Mail proxy.
  { pattern: /YahooMailProxy/i, reason: "yahoo_proxy" },

  // Microsoft Outlook / Defender / SafeLinks pre-fetch.
  { pattern: /MicrosoftPreview/i, reason: "outlook_preview" },
  { pattern: /BingPreview/i, reason: "bing_preview" },
  { pattern: /SafeLinks/i, reason: "outlook_safelinks" },

  // Antivirus / link-checkers that fetch every link on receipt.
  { pattern: /Barracuda/i, reason: "av_scanner" },
  { pattern: /Proofpoint/i, reason: "av_scanner" },
  { pattern: /Mimecast/i, reason: "av_scanner" },
  { pattern: /Symantec/i, reason: "av_scanner" },
  { pattern: /Forcepoint/i, reason: "av_scanner" },
  { pattern: /TrendMicro/i, reason: "av_scanner" },
  { pattern: /Cisco-IronPort/i, reason: "av_scanner" },

  // Generic crawlers and link-prefetchers.
  { pattern: /bot|crawler|spider/i, reason: "bot" },
  { pattern: /facebookexternalhit/i, reason: "social_unfurl" },
  { pattern: /Slackbot/i, reason: "social_unfurl" },
  { pattern: /WhatsApp/i, reason: "social_unfurl" },
  { pattern: /Twitterbot/i, reason: "social_unfurl" },
];

/**
 * Returns { isPrefetch, reason } for a single open event.
 *
 * Empty or missing UAs are treated as pre-fetch -- real browsers and
 * mail clients always send something. Apple MPP is detected via a
 * narrow heuristic: macOS Mail UA with no version-specific suffix and
 * no preceding click on the same prospect. Since the click signal
 * isn't available here, MPP detection is intentionally conservative
 * (false negatives over false positives -- better to count a real
 * Apple Mail read than to mis-flag one).
 */
export function isPrefetchOpen(ua: string | null | undefined): PrefetchVerdict {
  const s = (ua || "").trim();
  if (!s) return { isPrefetch: true, reason: "empty_ua" };

  for (const { pattern, reason } of PREFETCH_PATTERNS) {
    if (pattern.test(s)) return { isPrefetch: true, reason };
  }

  return { isPrefetch: false, reason: null };
}

/**
 * SQL fragment that matches the same set of pre-fetch UAs at query
 * time, for use in WHERE clauses. Keeps the warmth aggregation in a
 * single round-trip instead of pulling every row into JS.
 *
 * Matches PREFETCH_PATTERNS above. Update both together when adding
 * new pre-fetch signatures.
 */
export const SQL_IS_PREFETCH = `(
     ua IS NULL
  OR TRIM(ua) = ''
  OR TRIM(ua) = 'Mozilla/5.0'
  OR ua LIKE '%Gmail-content-sampling%'
  OR ua LIKE '%Edge/12.%'
  OR ua LIKE '%GoogleImageProxy%'
  OR ua LIKE '%googleusercontent.com%'
  OR ua LIKE '%ggpht.com%'
  OR ua LIKE '%YahooMailProxy%'
  OR ua LIKE '%MicrosoftPreview%'
  OR ua LIKE '%BingPreview%'
  OR ua LIKE '%SafeLinks%'
  OR ua LIKE '%Barracuda%'
  OR ua LIKE '%Proofpoint%'
  OR ua LIKE '%Mimecast%'
  OR ua LIKE '%Symantec%'
  OR ua LIKE '%Forcepoint%'
  OR ua LIKE '%TrendMicro%'
  OR ua LIKE '%Cisco-IronPort%'
  OR LOWER(ua) LIKE '%bot%'
  OR LOWER(ua) LIKE '%crawler%'
  OR LOWER(ua) LIKE '%spider%'
  OR ua LIKE '%facebookexternalhit%'
  OR ua LIKE '%Slackbot%'
  OR ua LIKE '%WhatsApp%'
  OR ua LIKE '%Twitterbot%'
)`;
