/**
 * agent_readiness_check tool — audits a site for Schema.org Action
 * coverage that AI agents need to perform tasks (book, apply, buy)
 * on behalf of users.
 *
 * Logic mirrors scripts/agent-readiness-check.mjs.
 * Standard at https://neverranked.com/standards/agent-readiness.
 */

const VERTICAL_BASELINES: Record<string, string[]> = {
  hospitality: ["ReserveAction", "ContactAction"],
  "financial-services": ["ApplyAction", "ContactAction", "ReserveAction"],
  "professional-services": ["ReserveAction", "ContactAction"],
  commerce: ["BuyAction", "OrderAction", "ContactAction"],
};

const ALL_ACTION_TYPES = [
  "ReserveAction",
  "ApplyAction",
  "BuyAction",
  "OrderAction",
  "ContactAction",
  "AskAction",
  "SubscribeAction",
  "RegisterAction",
];

interface ActionCheck {
  type: string;
  name: string;
  target: string | null;
  issues: string[];
  reachable: { status: number; ok: boolean } | { status: 0; error: string } | null;
  via_potential_action: boolean;
}

interface AgentReadinessResult {
  url: string;
  vertical: string | null;
  score: number;
  grade: string;
  actions: ActionCheck[];
  missing_for_vertical: string[];
  findings: Array<{ ok: boolean; msg: string }>;
  attribution: string;
  standard_url: string;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object" && "@graph" in parsed) {
        blocks.push(...(parsed["@graph"] as Record<string, unknown>[]));
      } else if (parsed && typeof parsed === "object") {
        blocks.push(parsed);
      }
    } catch {
      // skip malformed
    }
  }
  return blocks;
}

function extractActions(blocks: Record<string, unknown>[]): Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean }> {
  const found: Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean }> = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const t = Array.isArray(b["@type"]) ? b["@type"] : [b["@type"]];
    for (const type of t) {
      if (typeof type === "string" && ALL_ACTION_TYPES.includes(type)) {
        found.push({ type, block: b, viaPotentialAction: false });
      }
    }
    if (b.potentialAction) {
      const pa = Array.isArray(b.potentialAction) ? b.potentialAction : [b.potentialAction];
      for (const a of pa as Record<string, unknown>[]) {
        if (a && typeof a["@type"] === "string" && ALL_ACTION_TYPES.includes(a["@type"])) {
          found.push({ type: a["@type"], block: a, viaPotentialAction: true });
        }
      }
    }
  }
  return found;
}

function validateAction(action: { type: string; block: Record<string, unknown> }): string[] {
  const issues: string[] = [];
  const b = action.block;
  if (!b.name) issues.push("missing name");
  if (!b.target) issues.push("missing target");
  if (b.target && typeof b.target === "object") {
    const t = b.target as Record<string, unknown>;
    if (!t.urlTemplate && !t.url) issues.push("target missing urlTemplate or url");
  }
  if (action.type === "ReserveAction" && !b["query-input"] && !b.queryInput) {
    issues.push("ReserveAction missing query-input (agents cannot supply parameters)");
  }
  return issues;
}

async function checkTargetReachable(action: { block: Record<string, unknown> }): Promise<ActionCheck["reachable"]> {
  const b = action.block;
  if (!b.target || typeof b.target !== "object") return null;
  const t = b.target as Record<string, unknown>;
  let url = (t.urlTemplate || t.url) as string | undefined;
  if (!url) return null;
  url = url.replace(/\{[^}]+\}/g, "").replace(/[?&]$/, "");
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { status: r.status, ok: r.ok };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

export async function agentReadinessCheck(args: { url: string; vertical?: string }): Promise<AgentReadinessResult> {
  const baseUrl = String(args.url || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("url is required");
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error(
      `url must include the protocol. Got: "${baseUrl}". Try "https://${baseUrl.replace(/^[a-z]+:\/*/, "")}" instead.`,
    );
  }
  const vertical = args.vertical || null;
  const expected = vertical ? VERTICAL_BASELINES[vertical] : null;

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(baseUrl, { redirect: "follow", signal: controller.signal });
      if (!res.ok) {
        throw new Error(
          `Could not fetch ${baseUrl} for agent-readiness scan: HTTP ${res.status} ${res.statusText}. The site may be down or blocking automated requests. Try a different URL.`,
        );
      }
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Could not fetch")) throw err;
    const isAbort = err instanceof Error && err.name === "AbortError";
    const msg = isAbort
      ? `Agent-readiness fetch timed out after 30s for ${baseUrl}. Site may be down. Retry, or try a different URL.`
      : `Agent-readiness fetch failed for ${baseUrl}. Network error: ${err instanceof Error ? err.message : String(err)}.`;
    console.error("[neverranked/mcp]", "agent_readiness_check", "network-error", baseUrl, err);
    throw new Error(msg);
  }
  const blocks = extractJsonLd(html);
  const actions = extractActions(blocks);

  const checked: ActionCheck[] = [];
  for (const a of actions) {
    const issues = validateAction(a);
    const reachable = await checkTargetReachable(a);
    checked.push({
      type: a.type,
      name: (a.block.name as string) || "(unnamed)",
      target:
        (a.block.target && typeof a.block.target === "object"
          ? ((a.block.target as Record<string, unknown>).urlTemplate as string) ||
            ((a.block.target as Record<string, unknown>).url as string) ||
            null
          : null) || null,
      issues,
      reachable,
      via_potential_action: a.viaPotentialAction,
    });
  }

  const presentTypes = new Set(checked.map((c) => c.type));
  const missing = expected ? expected.filter((t) => !presentTypes.has(t)) : [];

  let score = 0;
  const findings: Array<{ ok: boolean; msg: string }> = [];

  if (checked.length === 0) {
    findings.push({ ok: false, msg: "No Action schemas detected — site is not agent-ready" });
  } else {
    score += 30;
    findings.push({ ok: true, msg: `${checked.length} Action type(s) detected: ${[...presentTypes].join(", ")}` });

    if (expected) {
      const coverage = (expected.length - missing.length) / expected.length;
      const vp = Math.round(coverage * 30);
      score += vp;
      if (missing.length === 0) {
        findings.push({ ok: true, msg: `Full vertical baseline coverage (${vertical})` });
      } else {
        findings.push({
          ok: false,
          msg: `Vertical baseline incomplete (${vertical}). Missing: ${missing.join(", ")}`,
        });
      }
    } else {
      score += 15;
    }

    const totalIssues = checked.reduce((sum, c) => sum + c.issues.length, 0);
    const issuePenalty = Math.min(20, totalIssues * 5);
    score += 20 - issuePenalty;
    if (totalIssues === 0) {
      findings.push({ ok: true, msg: "All Action schemas pass basic validation" });
    } else {
      findings.push({ ok: false, msg: `${totalIssues} validation issue(s) across actions` });
    }

    const reachableCount = checked.filter(
      (c) => c.reachable && "ok" in c.reachable && c.reachable.ok,
    ).length;
    const reachableScore = checked.length > 0 ? Math.round((reachableCount / checked.length) * 20) : 0;
    score += reachableScore;
    findings.push({
      ok: reachableCount === checked.length,
      msg: `${reachableCount} of ${checked.length} action target URLs respond 2xx`,
    });
  }

  return {
    url: baseUrl,
    vertical,
    score,
    grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F",
    actions: checked,
    missing_for_vertical: missing,
    findings,
    attribution: "Powered by NeverRanked. https://neverranked.com",
    standard_url: "https://neverranked.com/standards/agent-readiness",
  };
}
