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
