/**
 * QA audit: email_preflight (rules-based, blocking on red).
 *
 * Validates outbound emails BEFORE the Resend API call. Catches the
 * "Hi {{first_name}}" template-fail nightmare, validates recipients,
 * and runs brand-voice rules over the body so accidental banned-word
 * usage doesn't ship to prospects.
 *
 * Used via the `sendEmailViaResend()` helper which wraps the actual
 * Resend POST. Existing per-feature email functions migrate to this
 * helper incrementally; the high-stakes outbound paths (cold prospect
 * outreach, nurture drip, NVI report send) migrate first because that's
 * where template-fail accidents would do the most damage.
 *
 * Red audits THROW a typed error. Callers' try/catch sees a
 * QAPreflightError; they should log and skip the send. Yellow audits
 * proceed but warn in the log + qa_audits.
 */

import type { Env } from "../types";
import { recordAudit, runRulesPipeline, type AuditResult, type RuleCheck } from "./qa-auditor";

export interface EmailPreflightInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  artifact_ref?: string;  // e.g. "magic_link", "weekly_digest", "cold_outreach"
}

export class QAPreflightError extends Error {
  audit: AuditResult;
  constructor(audit: AuditResult) {
    super(`QA preflight blocked email: ${audit.reasoning}`);
    this.name = "QAPreflightError";
    this.audit = audit;
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const BANNED_WORDS = [
  "leverage", "unlock", "seamless", "effortless", "cutting-edge",
  "synergy", "synergies", "bandwidth", "circle back", "touch base",
  "moving forward", "at the end of the day",
];

const SUSPICIOUS_RECIPIENT_PATTERNS = [
  /@example\.(com|org|net)/i,
  /^test@/i,
  /@test\./i,
  /^noreply@/i,
  /@localhost/i,
];

const RULES: RuleCheck<EmailPreflightInput>[] = [
  {
    name: "no_template_failure",
    severity: "red",
    check: (input) => {
      const body = `${input.subject || ""} ${input.html || ""} ${input.text || ""}`;
      // Detect unrendered Handlebars-style placeholders
      const matches = body.match(/\{\{[^}]*\}\}/g);
      if (matches && matches.length > 0) {
        return `template failed to render: found unsubstituted placeholders ${matches.slice(0, 3).join(", ")}${matches.length > 3 ? "..." : ""}`;
      }
      // Also check for unrendered template-literal style
      const tplLiteralMatches = body.match(/\$\{[^}]*\}/g);
      if (tplLiteralMatches && tplLiteralMatches.length > 0) {
        return `template failed to render: found unsubstituted JS template literals ${tplLiteralMatches.slice(0, 3).join(", ")}`;
      }
      return null;
    },
  },
  {
    name: "valid_recipient",
    severity: "red",
    check: (input) => {
      const recipients = Array.isArray(input.to) ? input.to : [input.to];
      for (const recipient of recipients) {
        if (!recipient || typeof recipient !== "string") return "recipient is empty or not a string";
        if (!recipient.includes("@")) return `recipient "${recipient}" missing @ sign`;
        if (recipient.length > 254) return `recipient "${recipient.slice(0, 40)}..." exceeds 254 char limit`;
        for (const pattern of SUSPICIOUS_RECIPIENT_PATTERNS) {
          if (pattern.test(recipient)) {
            return `recipient "${recipient}" matches a suspicious pattern (looks like test/placeholder)`;
          }
        }
      }
      return null;
    },
  },
  {
    name: "has_subject",
    severity: "red",
    check: (input) => {
      if (!input.subject || input.subject.trim().length === 0) return "subject is empty";
      if (input.subject.length > 250) return `subject exceeds 250 chars (${input.subject.length})`;
      return null;
    },
  },
  {
    name: "has_body",
    severity: "red",
    check: (input) => {
      const hasHtml = input.html && input.html.trim().length > 0;
      const hasText = input.text && input.text.trim().length > 0;
      if (!hasHtml && !hasText) return "email has no html or text body";
      return null;
    },
  },
  {
    name: "no_banned_words",
    severity: "yellow",  // Yellow not red -- some emails may legitimately use these
    check: (input) => {
      const body = `${input.subject || ""} ${input.html || ""} ${input.text || ""}`.toLowerCase();
      const hits: string[] = [];
      for (const word of BANNED_WORDS) {
        if (body.includes(word)) hits.push(word);
      }
      if (hits.length > 0) {
        return `contains banned words: ${hits.slice(0, 5).join(", ")}`;
      }
      return null;
    },
  },
  {
    name: "no_suppression_list_send",
    severity: "red",
    check: async (input) => {
      // Implementation requires Env access for D1; we attach it via closure
      // in the public API below. This rule is filled in by the wrapper.
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the email preflight audit. Returns the audit result. Throws
 * QAPreflightError if blocking=true and verdict is red. Records the
 * audit to qa_audits regardless.
 *
 * Wrapped suppression-list check: we additionally verify the recipient
 * is not in the email_unsubscribes table (if it exists in your schema).
 */
export async function preflightEmail(
  env: Env,
  input: EmailPreflightInput,
  options: { blocking?: boolean } = {},
): Promise<AuditResult> {
  const blocking = options.blocking !== false;

  // Build the full rules list with the suppression check inlined so it
  // has env access
  const allRules: RuleCheck<EmailPreflightInput>[] = [
    ...RULES.slice(0, -1), // all except the placeholder suppression rule
    {
      name: "no_suppression_list_send",
      severity: "red",
      check: async (input) => {
        const recipients = Array.isArray(input.to) ? input.to : [input.to];
        try {
          for (const recipient of recipients) {
            const unsubRow = await env.DB.prepare(
              "SELECT 1 as ok FROM email_unsubscribes WHERE email = ? LIMIT 1"
            ).bind(recipient.toLowerCase()).first<{ ok: number }>();
            if (unsubRow) return `recipient "${recipient}" is on the unsubscribe list`;
          }
        } catch (e) {
          // Table may not exist in some envs -- treat as pass, don't block
          return null;
        }
        return null;
      },
    },
  ];

  const result = await runRulesPipeline<EmailPreflightInput>(input, allRules);

  await recordAudit(env, {
    category: "email_preflight",
    artifact_type: "email",
    artifact_ref: input.artifact_ref ?? null,
  }, {
    ...result,
    blocked: blocking && result.verdict === "red",
  });

  if (blocking && result.verdict === "red") {
    throw new QAPreflightError(result);
  }

  return result;
}

/**
 * Send an email via Resend with preflight QA audit baked in. The
 * canonical outbound email helper -- new code should use this. Existing
 * per-feature senders should migrate to this incrementally.
 *
 * Returns the Resend response object on success. Throws QAPreflightError
 * on preflight red (caller should catch + skip), or the underlying fetch
 * error on Resend API failure.
 *
 * Existing senders that should migrate (post-Phase-1.5-S1):
 *   - email.ts:sendMagicLinkEmail
 *   - email.ts:sendFreeMagicLinkEmail
 *   - email.ts:sendFreeWeeklyDigestEmail
 *   - email.ts:sendFreeScoreDropAlertEmail
 *   - email.ts:sendInviteEmail
 *   - nurture-drip.ts (all prospect outreach -- HIGHEST priority)
 *   - audit-delivery.ts
 *   - content-pipeline.ts (NVI report sends)
 *   - admin-inbox.ts (founder summary emails)
 */
export async function sendEmailViaResend(
  env: Env,
  input: EmailPreflightInput & { reply_to?: string },
  options: { blocking?: boolean } = {},
): Promise<{ ok: boolean; status: number; resend_id?: string; body?: unknown; error?: string }> {
  // Preflight first. Throws QAPreflightError if red and blocking.
  await preflightEmail(env, input, options);

  const apiKey = (env as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, error: "RESEND_API_KEY not configured" };
  }

  const body: Record<string, unknown> = {
    from: input.from ?? "Lance <lance@neverranked.com>",
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) body.html = input.html;
  if (input.text) body.text = input.text;
  if (input.reply_to) body.reply_to = input.reply_to;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const respBody = await resp.json().catch(() => null);
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        body: respBody,
        error: `Resend returned ${resp.status}`,
      };
    }
    const id = (respBody && typeof respBody === "object" && "id" in respBody) ? String((respBody as { id: unknown }).id) : undefined;
    return { ok: true, status: resp.status, resend_id: id, body: respBody };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
