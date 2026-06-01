// Customer auth-link builder. SINGLE SOURCE OF TRUTH for sign-in links
// that go into customer-facing email.
//
// WHY THIS EXISTS: sign-in links must point at a domain Gmail trusts.
// app.neverranked.com is a new, uncrawlable subdomain (the dashboard sits
// behind auth), so Google has no reputation data for it and Gmail flags
// "sign in" links to it as dangerous. neverranked.com is crawlable, has
// content and age, and carries real reputation. We therefore link auth
// emails to neverranked.com/signin?token=..., which 302-redirects to the
// dashboard's /auth/verify (see the /signin rule in the root _redirects).
//
// Every place that emails a magic link MUST use this helper. Do not
// hardcode /auth/verify URLs in email bodies again; that reintroduces the
// low-reputation-domain problem one inbox at a time.

// The reputable, crawlable domain Gmail trusts. Kept as a constant (not an
// env var) so there is exactly one definition; change it here if the
// primary marketing domain ever moves.
const AUTH_LINK_ORIGIN = "https://neverranked.com";

export function customerAuthLink(token: string, opts?: { next?: string }): string {
  let url = `${AUTH_LINK_ORIGIN}/signin?token=${encodeURIComponent(token)}`;
  if (opts?.next) url += `&next=${encodeURIComponent(opts.next)}`;
  return url;
}
