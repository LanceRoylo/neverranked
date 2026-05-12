/**
 * agent_readiness_check tool — audits a site for Schema.org Action
 * coverage that AI agents need to perform tasks (book, apply, buy)
 * on behalf of users.
 *
 * v2 (2026-05-12): expanded ActionType vocabulary, added Microdata
 * extraction, deeper nesting traversal, more vertical baselines,
 * action-specific extended validation, vertical "why it matters" copy.
 *
 * Logic mirrors scripts/agent-readiness-check.mjs.
 * Standard at https://neverranked.com/standards/agent-readiness.
 */

// Vertical baselines map a business category to the ActionTypes a competent
// AI agent should expect to find. Adding a vertical here without an
// accompanying entry in WHY_THIS_MATTERS leaves the buyer without
// motivation to act, so update both.
const VERTICAL_BASELINES: Record<string, string[]> = {
  hospitality:           ['ReserveAction', 'ContactAction'],
  restaurants:           ['ReserveAction', 'OrderAction', 'ContactAction'],
  'financial-services':  ['ApplyAction', 'ContactAction', 'ReserveAction'],
  'professional-services': ['ReserveAction', 'ContactAction'],
  healthcare:            ['ReserveAction', 'ContactAction', 'ApplyAction'],
  education:             ['ApplyAction', 'ContactAction', 'RegisterAction'],
  commerce:              ['BuyAction', 'OrderAction', 'ContactAction'],
  saas:                  ['SubscribeAction', 'ChooseAction', 'ContactAction'],
  media:                 ['SearchAction', 'SubscribeAction'],
  'real-estate':         ['ContactAction', 'ReserveAction', 'ApplyAction'],
  nonprofit:             ['DonateAction', 'ContactAction', 'SubscribeAction'],
  government:            ['ApplyAction', 'ContactAction', 'SearchAction'],
  'performing-arts':     ['BuyAction', 'ReserveAction', 'ContactAction'],
};

// ActionType vocabulary. v1 had 8; v2 has 27. Limited to ActionTypes that
// (a) describe a task an agent might execute on a user's behalf and
// (b) are differentiated enough that a buyer can act on the finding.
// Curated subset of the Schema.org ~50-Action hierarchy.
const ALL_ACTION_TYPES = [
  // Universal / search
  'SearchAction',
  // Hospitality / appointments
  'ReserveAction', 'CheckInAction', 'CheckOutAction', 'RsvpAction',
  // Financial / applications
  'ApplyAction', 'AuthorizeAction',
  // Commerce / transactions
  'BuyAction', 'OrderAction', 'PayAction', 'PreOrderAction',
  'TipAction', 'RentAction', 'QuoteAction', 'DonateAction',
  // Communication
  'ContactAction', 'AskAction', 'CommunicateAction',
  // Consumption (media)
  'WatchAction', 'ListenAction', 'ReadAction', 'PlayAction',
  // Lifecycle / membership
  'SubscribeAction', 'RegisterAction', 'JoinAction',
  // Discovery / decisions
  'ChooseAction', 'ReviewAction',
  // Logistics
  'TrackAction', 'DownloadAction',
];

const WHY_THIS_MATTERS: Record<string, string> = {
  SearchAction: 'Agents querying your site internally (e.g., "find a branch near 96813") rely on SearchAction. Without it, agents either guess at your URL conventions or escalate the search to a web search engine.',
  ReserveAction: 'Without ReserveAction on appointment/booking pages, an agent trying to book on a user\'s behalf has to interpret the booking form from raw HTML. Most attempts fail or require human handoff.',
  CheckInAction: 'CheckInAction signals to travel and venue agents that this page initiates a check-in flow.',
  CheckOutAction: 'CheckOutAction marks the commerce checkout step. Agents completing a purchase on behalf of users need this to know they are at the correct page.',
  RsvpAction: 'Event RSVP flows benefit from RsvpAction so calendar and event agents can confirm attendance programmatically.',
  ApplyAction: 'Loan, insurance, school, and job applications all need ApplyAction. This is the difference between an agent completing the form versus surfacing it to the user and exiting.',
  AuthorizeAction: 'Permissions and account access agents look for AuthorizeAction to know which flows are gated.',
  BuyAction: 'Without BuyAction on product pages, commerce agents cannot reliably initiate a purchase. The shift to agent commerce in 2026-2027 makes this a precondition for being part of agent-driven retail.',
  OrderAction: 'OrderAction is what an agent uses to place a multi-item or delivery-style order. Restaurants, retail, and B2B procurement all need this.',
  PayAction: 'PayAction marks payment-initiation pages. Required for agents that complete the payment leg of a transaction.',
  PreOrderAction: 'For limited-availability items (vehicles, electronics, books), PreOrderAction signals to agents that an early reservation is possible.',
  TipAction: 'Service economy sites benefit from TipAction so agents can apply a tip on a user\'s behalf at the end of a transaction.',
  RentAction: 'Rental flows (cars, equipment, vacation properties) need RentAction so agents can distinguish rental from purchase.',
  QuoteAction: 'B2B sales and insurance pages benefit from QuoteAction so agents can request a quote without leaving the agent flow.',
  DonateAction: 'Nonprofits need DonateAction so giving agents can complete a donation on a user\'s behalf. Without it, donation flows often break.',
  ContactAction: 'The simplest agent task is "contact this business." Without ContactAction the agent cannot reliably find the right path (email, phone, form) and often gives up or picks wrong.',
  AskAction: 'Q&A pages and support pages benefit from AskAction so agents can route a user\'s question to the correct intake surface.',
  CommunicateAction: 'A broader signal than ContactAction for sites with multiple communication surfaces (chat, email, SMS, video).',
  WatchAction: 'Video and streaming sites need WatchAction so agents can confirm a video is playable in the agent\'s context.',
  ListenAction: 'Podcast and music sites need ListenAction so audio agents can resolve a play action programmatically.',
  ReadAction: 'Long-form content and news sites benefit from ReadAction so reading agents can record progress and resume.',
  PlayAction: 'Game and interactive media sites benefit from PlayAction to mark the launch surface.',
  SubscribeAction: 'Newsletter and SaaS subscription flows need SubscribeAction so agents can complete a sign-up. The most common ActionType in SaaS.',
  RegisterAction: 'Account creation and event registration need RegisterAction so agents can create accounts programmatically when authorized.',
  JoinAction: 'Community and membership flows benefit from JoinAction to distinguish a join from a generic subscribe.',
  ChooseAction: 'Plan picker and product configurator pages benefit from ChooseAction so agents can record a user\'s selection.',
  ReviewAction: 'Sites soliciting reviews benefit from ReviewAction so agents can submit a review on a user\'s behalf when authorized.',
  TrackAction: 'Shipping, project, and order tracking pages need TrackAction so agents can pull status updates programmatically.',
  DownloadAction: 'Software and documentation sites benefit from DownloadAction so agents can resolve a download URL without scraping.',
};

interface ActionCheck {
  type: string;
  name: string;
  target: string | null;
  format: 'json-ld' | 'microdata';
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
  why_missing_matters: Record<string, string>;
  findings: Array<{ ok: boolean; msg: string }>;
  fetch_status: number;
  fetch_blocked: boolean;
  attribution: string;
  standard_url: string;
}

const NR_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) NeverRanked-Bot/1.0 (+https://neverranked.com/bot)';

function extractJsonLd(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === 'object' && '@graph' in parsed) {
        blocks.push(...(parsed['@graph'] as Record<string, unknown>[]));
      } else if (parsed && typeof parsed === 'object') {
        blocks.push(parsed);
      }
    } catch {
      // skip malformed
    }
  }
  return blocks;
}

// Walk every nested object inside a JSON-LD block looking for ActionType
// occurrences. v1 only checked top-level @type and potentialAction; v2
// traverses mainEntity, hasPart, offers, hasOfferCatalog, isPartOf,
// subjectOf, etc. by recursing into any object value.
function walkForActions(
  node: unknown,
  path: string,
  out: Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean; depth: number }>,
  depth = 0,
): void {
  if (depth > 12 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkForActions(item, path, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
  for (const t of types) {
    if (typeof t === 'string' && ALL_ACTION_TYPES.includes(t)) {
      out.push({ type: t, block: obj, viaPotentialAction: path === 'potentialAction', depth });
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === '@type' || key === '@context' || typeof value !== 'object') continue;
    walkForActions(value, key, out, depth + 1);
  }
}

function extractActionsJsonLd(blocks: Record<string, unknown>[]): Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean }> {
  const out: Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean; depth: number }> = [];
  for (const b of blocks) walkForActions(b, '', out);
  // Dedupe identical actions
  const seen = new Set<string>();
  const deduped: Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean }> = [];
  for (const a of out) {
    const key = `${a.type}|${(a.block.name as string) || ''}|${JSON.stringify(a.block.target || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ type: a.type, block: a.block, viaPotentialAction: a.viaPotentialAction });
  }
  return deduped;
}

// Microdata extraction. Looks for elements with itemscope + itemtype
// pointing at a Schema.org ActionType, then attempts to read the
// itemprop="target" or itemprop="url" within that scope. Quick
// regex-based parse; not a full Microdata DOM walk.
function extractActionsMicrodata(html: string): Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean }> {
  const out: Array<{ type: string; block: Record<string, unknown>; viaPotentialAction: boolean }> = [];
  const itemTypeRe = /itemscope[^>]*itemtype=["']https?:\/\/schema\.org\/([A-Z][A-Za-z]+Action)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = itemTypeRe.exec(html)) !== null) {
    const type = m[1];
    if (!ALL_ACTION_TYPES.includes(type)) continue;
    // Look forward in the HTML up to ~2000 chars for itemprop="target" or "url"
    const tail = html.slice(m.index, m.index + 2000);
    const targetMatch =
      tail.match(/itemprop=["']target["'][^>]*content=["']([^"']+)["']/i) ||
      tail.match(/itemprop=["']target["'][^>]*href=["']([^"']+)["']/i) ||
      tail.match(/itemprop=["']url["'][^>]*content=["']([^"']+)["']/i) ||
      tail.match(/itemprop=["']url["'][^>]*href=["']([^"']+)["']/i);
    const nameMatch = tail.match(/itemprop=["']name["'][^>]*>([^<]+)</i);
    out.push({
      type,
      block: {
        '@type': type,
        name: nameMatch ? nameMatch[1].trim() : undefined,
        target: targetMatch ? targetMatch[1] : undefined,
      },
      viaPotentialAction: false,
    });
  }
  return out;
}

function validateAction(action: { type: string; block: Record<string, unknown> }): string[] {
  const issues: string[] = [];
  const b = action.block;
  if (!b.name) issues.push('missing name');
  if (!b.target) issues.push('missing target');
  if (b.target && typeof b.target === 'object') {
    const t = b.target as Record<string, unknown>;
    if (!t.urlTemplate && !t.url) issues.push('target missing urlTemplate or url');
  }
  // ReserveAction without query-input means an agent cannot fill the form
  if (action.type === 'ReserveAction' && !b['query-input'] && !b.queryInput) {
    issues.push('ReserveAction missing query-input (agents cannot supply parameters)');
  }
  // SearchAction needs query-input to be useful
  if (action.type === 'SearchAction' && !b['query-input'] && !b.queryInput) {
    issues.push('SearchAction missing query-input (sitelinks search box will not surface)');
  }
  // BuyAction without price is incomplete for purchase agents
  if (action.type === 'BuyAction' && !b.price && !b.priceSpecification) {
    issues.push('BuyAction missing price or priceSpecification (purchase agents cannot confirm cost)');
  }
  // OrderAction should declare accepted payment methods
  if (action.type === 'OrderAction' && !b.acceptedPaymentMethod) {
    issues.push('OrderAction missing acceptedPaymentMethod');
  }
  // ApplyAction benefits from describing the result (an Application instance)
  if (action.type === 'ApplyAction' && !b.result) {
    issues.push('ApplyAction missing result (agents cannot anticipate application disposition)');
  }
  return issues;
}

async function checkTargetReachable(action: { block: Record<string, unknown> }): Promise<ActionCheck['reachable']> {
  const b = action.block;
  if (!b.target) return null;
  let url: string | undefined;
  if (typeof b.target === 'string') url = b.target;
  else if (typeof b.target === 'object') {
    const t = b.target as Record<string, unknown>;
    url = (t.urlTemplate || t.url) as string | undefined;
  }
  if (!url) return null;
  // Strip URL template placeholders before fetching
  url = url.replace(/\{[^}]+\}/g, '').replace(/[?&]$/, '');
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': NR_UA },
    });
    return { status: r.status, ok: r.ok };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

export async function agentReadinessCheck(args: { url: string; vertical?: string }): Promise<AgentReadinessResult> {
  const baseUrl = String(args.url || '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('url is required');
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error(
      `url must include the protocol. Got: "${baseUrl}". Try "https://${baseUrl.replace(/^[a-z]+:\/*/, '')}" instead.`,
    );
  }
  const vertical = args.vertical || null;
  const expected = vertical ? VERTICAL_BASELINES[vertical] : null;

  let html: string;
  let fetchStatus = 0;
  let fetchBlocked = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(baseUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': NR_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      fetchStatus = res.status;
      if (!res.ok) {
        fetchBlocked = res.status === 403 || res.status === 429 || res.status === 401;
        throw new Error(
          `Could not fetch ${baseUrl} for agent-readiness scan: HTTP ${res.status} ${res.statusText}. ${fetchBlocked ? 'The site is blocking automated requests (you can still deploy schemas — we just cannot verify them from this scan).' : 'The site may be down. Try a different URL.'}`,
        );
      }
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Could not fetch')) throw err;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const msg = isAbort
      ? `Agent-readiness fetch timed out after 30s for ${baseUrl}. Site may be down. Retry, or try a different URL.`
      : `Agent-readiness fetch failed for ${baseUrl}. Network error: ${err instanceof Error ? err.message : String(err)}.`;
    console.error('[neverranked/mcp]', 'agent_readiness_check', 'network-error', baseUrl, err);
    throw new Error(msg);
  }
  const blocks = extractJsonLd(html);
  const jsonLdActions = extractActionsJsonLd(blocks);
  const microActions = extractActionsMicrodata(html);

  const allActions = [
    ...jsonLdActions.map((a) => ({ ...a, format: 'json-ld' as const })),
    ...microActions.map((a) => ({ ...a, format: 'microdata' as const })),
  ];

  const checked: ActionCheck[] = [];
  for (const a of allActions) {
    const issues = validateAction(a);
    const reachable = await checkTargetReachable(a);
    let target: string | null = null;
    if (typeof a.block.target === 'string') target = a.block.target;
    else if (a.block.target && typeof a.block.target === 'object') {
      const t = a.block.target as Record<string, unknown>;
      target = (t.urlTemplate as string) || (t.url as string) || null;
    }
    checked.push({
      type: a.type,
      name: (a.block.name as string) || '(unnamed)',
      target,
      format: a.format,
      issues,
      reachable,
      via_potential_action: a.viaPotentialAction,
    });
  }

  const presentTypes = new Set(checked.map((c) => c.type));
  const missing = expected ? expected.filter((t) => !presentTypes.has(t)) : [];
  const whyMissingMatters: Record<string, string> = {};
  for (const m of missing) {
    if (WHY_THIS_MATTERS[m]) whyMissingMatters[m] = WHY_THIS_MATTERS[m];
  }

  let score = 0;
  const findings: Array<{ ok: boolean; msg: string }> = [];

  if (checked.length === 0) {
    findings.push({ ok: false, msg: 'No Action schemas detected — site is not agent-ready' });
    findings.push({
      ok: false,
      msg: 'Most enterprise sites are at zero today. The first deployer in your vertical owns the agent layer for the next 12-18 months.',
    });
  } else {
    score += 30;
    const formats = [...new Set(checked.map((c) => c.format))];
    findings.push({
      ok: true,
      msg: `${checked.length} Action type(s) detected (${formats.join(' + ')}): ${[...presentTypes].join(', ')}`,
    });

    if (expected) {
      const coverage = (expected.length - missing.length) / expected.length;
      const vp = Math.round(coverage * 30);
      score += vp;
      if (missing.length === 0) {
        findings.push({ ok: true, msg: `Full vertical baseline coverage (${vertical})` });
      } else {
        findings.push({
          ok: false,
          msg: `Vertical baseline incomplete (${vertical}). Missing: ${missing.join(', ')}`,
        });
      }
    } else {
      score += 15;
    }

    const totalIssues = checked.reduce((sum, c) => sum + c.issues.length, 0);
    const issuePenalty = Math.min(20, totalIssues * 5);
    score += 20 - issuePenalty;
    if (totalIssues === 0) {
      findings.push({ ok: true, msg: 'All Action schemas pass basic validation' });
    } else {
      findings.push({ ok: false, msg: `${totalIssues} validation issue(s) across actions` });
    }

    const reachableCount = checked.filter(
      (c) => c.reachable && 'ok' in c.reachable && c.reachable.ok,
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
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    actions: checked,
    missing_for_vertical: missing,
    why_missing_matters: whyMissingMatters,
    findings,
    fetch_status: fetchStatus,
    fetch_blocked: fetchBlocked,
    attribution: 'Powered by NeverRanked. https://neverranked.com',
    standard_url: 'https://neverranked.com/standards/agent-readiness',
  };
}
