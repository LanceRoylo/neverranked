/**
 * DataForSEO task status codes that mean "the query ran and found nothing".
 *
 * Everything else that is not 20000 is a failure of OUR call (auth, balance,
 * limits, their outage) and must be reported as one. Until 2026-10-01 both
 * cases returned the same empty result, so a failure read as "Google showed no
 * AI Overview" and "Bing returned nothing".
 */
export function isNoResults(code: number | undefined, message: string | undefined): boolean {
  return code === 40102 || /no search results/i.test(message ?? "");
}

/** Pause before the single retry. Long enough for a search-engine hiccup to clear. */
export const DFS_RETRY_DELAY_MS = 2000;

/**
 * A failure worth one more attempt: a network error, an HTTP 5xx, unparseable
 * JSON, or DataForSEO's own internal / search-engine error codes (40101,
 * 5xxxx). Never billing (402xx), auth or bad-request codes: retrying those
 * spends money or time for a guaranteed second refusal, and a billing refusal
 * must reach the alert on the first call.
 */
export function isTransientDfsFailure(status: number, detail: string): boolean {
  if (status === 0) return true;
  if (status >= 500 && status < 600) return true;
  return /^DataForSEO (?:40101|5\d{4})\b|^DataForSEO bad JSON|^DataForSEO fetch error|^DataForSEO HTTP 5\d\d/.test(detail);
}
