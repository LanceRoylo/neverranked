/**
 * ScanDomainWorkflow -- one full per-domain scan cycle, run in its own
 * Worker invocation so each domain gets its own 1000-subrequest budget.
 *
 * Triggered from cron.ts (one workflow instance per active domain).
 * Steps run sequentially with per-step retry; a failure in one step
 * does not block other domains because each domain is its own instance.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, Domain, ScanResult } from "../types";
import { scanDomain } from "../scanner";
import { scanDomainPages } from "../pages";
import { checkAndAlertRegression, checkAndCelebrateGradeUp } from "../regression";
import { autoCompleteRoadmapItems } from "../auto-complete";

export type ScanDomainWorkflowParams = { domainId: number };

export class ScanDomainWorkflow extends WorkflowEntrypoint<Env, ScanDomainWorkflowParams> {
  async run(event: WorkflowEvent<ScanDomainWorkflowParams>, step: WorkflowStep): Promise<void> {
    const { domainId } = event.payload;

    const domain = await step.do("load-domain", async () => {
      const row = await this.env.DB.prepare("SELECT * FROM domains WHERE id = ?")
        .bind(domainId)
        .first<Domain>();
      if (!row) throw new Error(`domain ${domainId} not found`);
      return row;
    });

    const scan = await step.do("scan", async (): Promise<ScanResult | null> => {
      return await scanDomain(domain.id, `https://${domain.domain}/`, "cron", this.env);
    });

    await step.do("scan-pages", async () => {
      await scanDomainPages(domain.id, domain.domain, this.env);
    });

    if (scan && !scan.error && !domain.is_competitor) {
      await step.do("auto-complete", async () => {
        await autoCompleteRoadmapItems(domain.client_slug, scan, this.env);
      });
    }

    await step.do("check-regression", async () => {
      await checkAndAlertRegression(domain, this.env);
    });

    if (!domain.is_competitor) {
      await step.do("check-grade-up", async () => {
        await checkAndCelebrateGradeUp(domain, this.env);
      });
    }
  }
}
