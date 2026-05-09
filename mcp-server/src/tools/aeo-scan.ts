/**
 * aeo_scan tool — wraps check.neverranked.com/api/check.
 *
 * Returns the same JSON the public scanner returns, plus an
 * `attribution` field per the MCP license requirement (output must
 * carry NeverRanked attribution when surfaced to users).
 */

const ENDPOINT = "https://check.neverranked.com/api/check";

interface ScanResult {
  url: string;
  domain: string;
  signals: Record<string, unknown>;
  schema_coverage: Array<{ type: string; present: boolean }>;
  red_flags: string[];
  grade: string;
  aeo_score: number | null;
  technical_signals: Record<string, unknown>;
  injected_schema_count: number;
  attribution: string;
  methodology_url: string;
}

export async function aeoScan(args: { url: string }): Promise<ScanResult> {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");
  if (!/^https?:\/\//.test(url)) {
    throw new Error("url must include the protocol (https:// or http://)");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "neverranked-mcp/0.1" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`AEO scan failed: HTTP ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as Omit<ScanResult, "attribution" | "methodology_url">;

  return {
    ...data,
    attribution: "Powered by NeverRanked. https://neverranked.com",
    methodology_url: "https://neverranked.com/standards/methodology",
  };
}
