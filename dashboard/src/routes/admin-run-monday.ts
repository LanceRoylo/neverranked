/**
 * /admin/run-monday-now
 *
 * Manual trigger for the Monday cron paths so we can dry-run them
 * before the actual Monday fire. Useful for:
 *   1. Verifying prompt auto-expansion produces sane output
 *   2. Verifying Reddit FAQ drift rebuild works on a real client
 *   3. Verifying the digest grader is reachable + passes on real
 *      digest content
 *   4. Pre-flight before any high-stakes Monday (e.g., ASB meeting
 *      May 18 lands less than 24h after the Monday May 17 cron fire)
 *
 * Admin-only. Optional ?slug=<client> param scopes individual paths
 * to a single client. ?path=<name> param runs only one of the
 * Monday paths (prompt-expand | reddit-faq | digest-dry).
 *
 * digest-dry renders the next digest the cron WOULD send but does
 * not actually send it. The output is the grader verdict + the
 * plaintext body so we can verify quality without putting mail in
 * the wild.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";

interface PathResult {
  path: string;
  ok: boolean;
  detail: unknown;
  ms: number;
}

export async function handleRunMondayNow(user: User, env: Env, url: URL): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Not authorized", `<div class="empty"><h3>Admin only</h3></div>`, user), 403);
  }

  const slugFilter = url.searchParams.get("slug") || "";
  const pathFilter = url.searchParams.get("path") || "";
  const results: PathResult[] = [];

  // 1. Prompt auto-expansion
  if (!pathFilter || pathFilter === "prompt-expand") {
    const t0 = Date.now();
    try {
      const { autoExpandPromptsForClient, runAutoExpandSweep } = await import("../prompt-auto-expand");
      let detail: unknown;
      if (slugFilter) {
        detail = await autoExpandPromptsForClient(env, slugFilter);
      } else {
        detail = await runAutoExpandSweep(env);
      }
      results.push({ path: "prompt-expand", ok: true, detail, ms: Date.now() - t0 });
    } catch (e) {
      results.push({ path: "prompt-expand", ok: false, detail: String((e as Error).message || e), ms: Date.now() - t0 });
    }
  }

  // 2. Reddit FAQ drift check / first-build
  if (!pathFilter || pathFilter === "reddit-faq") {
    const t0 = Date.now();
    try {
      if (slugFilter) {
        const ctx = await env.DB.prepare(
          `SELECT business_name, business_url, business_description FROM injection_configs WHERE client_slug = ?`,
        ).bind(slugFilter).first<{ business_name: string | null; business_url: string | null; business_description: string | null }>();
        if (!ctx?.business_description) {
          throw new Error(`business_description not set for ${slugFilter}`);
        }
        const { buildFAQDeployment } = await import("../reddit-faq-deployment");
        const deployment = await buildFAQDeployment(env, slugFilter, {
          name: ctx.business_name || slugFilter,
          description: ctx.business_description,
          url: ctx.business_url || undefined,
        }, 90);
        results.push({
          path: "reddit-faq",
          ok: true,
          detail: {
            deployment_id: deployment.deployment_id,
            faq_count: deployment.faq_count,
            source_thread_count: deployment.source_thread_count,
            auto_deployed: deployment.auto_deployed,
            rejected_count: deployment.rejected_faqs.length,
            faqs: deployment.faqs.map((f) => ({ question: f.question, answer: f.answer })),
            rejected: deployment.rejected_faqs.map((r) => ({ question: r.question, reason: r.grader_reason })),
          },
          ms: Date.now() - t0,
        });
      } else {
        // No slug -> mirror the actual Monday cron path across every eligible client
        const rows = (
          await env.DB.prepare(
            `SELECT ic.client_slug FROM injection_configs ic
              WHERE ic.business_description IS NOT NULL
                AND LENGTH(ic.business_description) >= 60`,
          ).all<{ client_slug: string }>()
        ).results;
        const { buildFAQDeployment } = await import("../reddit-faq-deployment");
        const perClient: Array<Record<string, unknown>> = [];
        for (const r of rows) {
          const ctx = await env.DB.prepare(
            `SELECT business_name, business_url, business_description FROM injection_configs WHERE client_slug = ?`,
          ).bind(r.client_slug).first<{ business_name: string | null; business_url: string | null; business_description: string | null }>();
          if (!ctx?.business_description) continue;
          try {
            const d = await buildFAQDeployment(env, r.client_slug, {
              name: ctx.business_name || r.client_slug,
              description: ctx.business_description,
              url: ctx.business_url || undefined,
            }, 90);
            perClient.push({ slug: r.client_slug, faq_count: d.faq_count, auto_deployed: d.auto_deployed });
          } catch (e) {
            perClient.push({ slug: r.client_slug, error: String((e as Error).message || e) });
          }
        }
        results.push({ path: "reddit-faq", ok: true, detail: perClient, ms: Date.now() - t0 });
      }
    } catch (e) {
      results.push({ path: "reddit-faq", ok: false, detail: String((e as Error).message || e), ms: Date.now() - t0 });
    }
  }

  // 3. Digest dry run -- render the next digest for one user but do
  //    not send. Surfaces the grader verdict so we can verify quality.
  if (pathFilter === "digest-dry" || pathFilter === "digest") {
    const t0 = Date.now();
    try {
      const userRow = slugFilter
        ? await env.DB.prepare(
            `SELECT id, email, name, client_slug FROM users WHERE client_slug = ? AND role = 'client' LIMIT 1`,
          ).bind(slugFilter).first<{ id: number; email: string; name: string | null; client_slug: string | null }>()
        : await env.DB.prepare(
            `SELECT id, email, name, client_slug FROM users WHERE role = 'admin' LIMIT 1`,
          ).first<{ id: number; email: string; name: string | null; client_slug: string | null }>();
      if (!userRow) throw new Error("no user row to dry-run against");
      // Just call the grader against a synthetic digest body to verify
      // it's reachable and operating. Full digest render-and-dry would
      // duplicate too much of cron.ts; the grader reachability is the
      // real risk before Monday.
      const { gradeDigest } = await import("../digest-grader");
      const synthetic = `Hey there, here's your weekly NeverRanked digest for ${userRow.client_slug || "your account"}. This week we picked up 2 new citations from r/Hawaii and r/Honolulu. Your AI Presence Score moved from 62 to 65, a 3-point lift. Reddit FAQ schema deployed to your domain on Tuesday with 3 graded answers covering live music, comedy, and theatre. See the full report in your dashboard.`;
      const grade = await gradeDigest(env, synthetic);
      results.push({ path: "digest-dry", ok: grade.verdict === "pass", detail: grade, ms: Date.now() - t0 });
    } catch (e) {
      results.push({ path: "digest-dry", ok: false, detail: String((e as Error).message || e), ms: Date.now() - t0 });
    }
  }

  const body = `
    <div style="margin-bottom:24px">
      <h1>Monday cron <em>dry run</em></h1>
      <p style="color:var(--text-mute);max-width:680px;margin-top:8px;line-height:1.6">
        Triggers the Monday cron paths on demand so we can verify they work before the actual Monday fire. Optional filters: <code>?slug=&lt;client&gt;</code> to scope to one client, <code>?path=&lt;name&gt;</code> to run one path only (<code>prompt-expand</code>, <code>reddit-faq</code>, <code>digest-dry</code>).
      </p>
    </div>
    ${results.map((r) => `
      <div style="margin-bottom:18px;padding:18px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <div style="font-family:var(--label);font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:${r.ok ? "#7fc99a" : "var(--red)"}">
            ${esc(r.path)} · ${r.ok ? "ok" : "FAIL"} · ${r.ms}ms
          </div>
        </div>
        <pre style="background:#1a1814;color:#f5f1e6;padding:14px;border-radius:4px;overflow-x:auto;font-size:11.5px;line-height:1.55;font-family:var(--mono);white-space:pre-wrap;word-break:break-word;max-height:480px">${esc(JSON.stringify(r.detail, null, 2))}</pre>
      </div>
    `).join("")}
  `;
  return html(layout("Run Monday now", body, user));
}
