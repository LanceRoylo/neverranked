/**
 * FAQ auto-trigger: hooks into scan completion to generate a
 * FAQPage draft when a client doesn't have one yet.
 *
 * Fires from the scan-complete path in scanner.ts so every new
 * client gets a draft FAQ within minutes of their first
 * successful scan, without an admin URL click. Customer reviews
 * the draft in their dashboard, approves, and it goes live on
 * the next scan.
 *
 * Safety: we don't auto-approve. Always human-in-the-loop. The
 * generator inserts as 'pending' and the customer/admin must
 * approve before deployment. This keeps the "we deploy" promise
 * honest -- we deploy what gets reviewed, not what an LLM
 * hallucinated.
 *
 * Dedup: if any FAQPage schema_injection already exists for the
 * client (any status -- pending, approved, paused, archived) we
 * skip. The customer either has one, is reviewing one, or
 * actively rejected one. Don't loop. To force regeneration:
 * admin removes the existing row, next scan generates a new one.
 */
import type { Env, Domain } from "./types";

export async function maybeGenerateFaqForClient(
  domain: Domain,
  env: Env,
): Promise<{ generated: boolean; reason?: string }> {
  const slug = domain.client_slug;
  if (!slug) return { generated: false, reason: "no client_slug" };
  if (domain.is_competitor) return { generated: false, reason: "competitor domain" };

  // Skip if any FAQPage schema already exists for this client.
  // Covers pending (still under review), approved (live), paused
  // (intentionally off), and archived (removed). All four mean
  // the customer or admin has already touched this. Don't loop.
  const existing = await env.DB.prepare(
    "SELECT 1 AS ok FROM schema_injections WHERE client_slug = ? AND schema_type = 'FAQPage' LIMIT 1"
  ).bind(slug).first<{ ok: number }>();
  if (existing) return { generated: false, reason: "FAQPage already exists for client" };

  // Skip if the snippet isn't installed (no injection_configs row).
  // No point queuing a draft a customer can't deploy.
  const config = await env.DB.prepare(
    "SELECT 1 AS ok FROM injection_configs WHERE client_slug = ? LIMIT 1"
  ).bind(slug).first<{ ok: number }>();
  if (!config) return { generated: false, reason: "snippet not installed (no injection_configs)" };

  // Build the homepage URL from the domain. Try https://www. first
  // (most common production canonical), fall back to bare host.
  const host = domain.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const sourceUrl = host.startsWith("www.") ? `https://${host}/` : `https://www.${host}/`;

  const { generateFaqForPage } = await import("./faq-generator");
  const result = await generateFaqForPage(slug, sourceUrl, env);

  if (result.ok) {
    console.log(`[faq-auto] generated FAQ for ${slug} from ${sourceUrl} (id=${result.injectionId}, score=${result.qualityScore})`);
    return { generated: true };
  }
  console.log(`[faq-auto] skipped ${slug}: ${result.reason}`);
  return { generated: false, reason: result.reason };
}
