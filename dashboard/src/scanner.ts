/**
 * Dashboard — Domain scanner (wraps shared aeo-analyzer)
 */

import type { Env, ScanResult } from "./types";
import { buildReport } from "../../packages/aeo-analyzer/src";
import type { Report } from "../../packages/aeo-analyzer/src";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 NeverRanked-AEO-Monitor/1.0";

export async function scanDomain(
  domainId: number,
  url: string,
  scanType: "cron" | "manual" | "onboard",
  env: Env
): Promise<ScanResult | null> {
  const now = Math.floor(Date.now() / 1000);
  let report: Report | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      error = `HTTP ${resp.status}`;
    } else {
      const html = await resp.text();
      report = buildReport(url, html);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      error = "Timeout (10s)";
    } else {
      error = "Could not reach site";
    }
  }

  const result = {
    domain_id: domainId,
    url,
    aeo_score: report ? report.aeo_score : 0,
    grade: report ? report.grade : "?",
    schema_types: JSON.stringify(report ? report.signals.schema_types : []),
    red_flags: JSON.stringify(report ? report.red_flags : []),
    technical_signals: JSON.stringify(report ? report.technical_signals : []),
    schema_coverage: JSON.stringify(report ? report.schema_coverage : []),
    signals_json: JSON.stringify(report ? report.signals : {}),
    scan_type: scanType,
    error,
    scanned_at: now,
  };

  const stmt = await env.DB.prepare(
    `INSERT INTO scan_results (domain_id, url, aeo_score, grade, schema_types, red_flags, technical_signals, schema_coverage, signals_json, scan_type, error, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    result.domain_id, result.url, result.aeo_score, result.grade,
    result.schema_types, result.red_flags, result.technical_signals,
    result.schema_coverage, result.signals_json, result.scan_type,
    result.error, result.scanned_at
  ).run();

  const id = stmt.meta?.last_row_id ?? 0;

  return { id: Number(id), ...result } as ScanResult;
}
