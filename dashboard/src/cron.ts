/**
 * Dashboard — Weekly cron scan runner
 *
 * Triggered every Monday at 6am UTC via Cloudflare Cron Trigger.
 * Scans all active domains sequentially to stay within Worker CPU limits.
 */

import type { Env, Domain } from "./types";
import { scanDomain } from "./scanner";
import { scanDomainPages } from "./pages";

export async function runWeeklyScans(env: Env): Promise<void> {
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE active = 1 ORDER BY client_slug, domain"
  ).all<Domain>()).results;

  if (domains.length === 0) return;

  let scanned = 0;
  let errors = 0;

  for (const d of domains) {
    try {
      const url = `https://${d.domain}/`;
      const result = await scanDomain(d.id, url, "cron", env);
      if (result?.error) {
        errors++;
      } else {
        scanned++;
      }
      // Also scan individual pages for schema coverage
      await scanDomainPages(d.id, d.domain, env);
    } catch {
      errors++;
    }

    // Small delay between scans to be respectful
    if (domains.indexOf(d) < domains.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`Weekly scan complete: ${scanned} succeeded, ${errors} failed, ${domains.length} total`);
}
