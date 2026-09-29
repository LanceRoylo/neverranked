/**
 * invoice-watch.ts — asks the two questions nobody was asking.
 *
 *   1. It is the Nth of the month. Has this month's invoice been issued?
 *   2. An invoice passed its due date. Has it been paid?
 *
 * Neither had an answer on 2026-09-29. NR-PW-002 went out on 09-04 for $785.34
 * net 15, due 09-16, and thirteen days later no record of receipt existed
 * anywhere. The send is documented forensically. The receipt is documented
 * nowhere. And the invoice itself exists only because somebody remembered to
 * run scripts/render-invoice.mjs.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never says a client has not paid. It
 * says WE HAVE NOT RECORDED a payment, which is the only thing this database
 * knows. `paid_at IS NULL` means unrecorded. Treating that as non-payment would
 * be an absence rendered as a fact, about a customer, in an alert that a person
 * might act on. The wording of every message here is load-bearing.
 */

import type { Env } from "../types";

/** Day of month from which a missing invoice for that month is worth raising. */
export const ISSUE_DAY = 1;
/** Grace after the due date before an unrecorded payment is raised. */
export const OVERDUE_GRACE_DAYS = 3;

export interface InvoiceWatchResult {
  missing: string[];
  overdue: string[];
  raised: number;
}

interface CustomerRow { client_slug: string; name: string; mrr_cents: number; }
interface InvoiceRow {
  invoice_no: string;
  client_slug: string;
  total_cents: number;
  due_at: number | null;
  sent_at: number | null;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * @param nowSec injectable so the behaviour on a given calendar day is testable
 *               without waiting for that day.
 */
export async function watchInvoices(env: Env, nowSec?: number): Promise<InvoiceWatchResult> {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const d = new Date(now * 1000);
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const out: InvoiceWatchResult = { missing: [], overdue: [], raised: 0 };

  const { addInboxItem } = await import("../admin-inbox");

  // 1. A paying client with no invoice for the current period.
  //
  // Scoped to customers who actually owe money. A pilot at $0 has nothing to
  // invoice, and raising a monthly item for one would be the kind of noise that
  // buries the real alert.
  if (d.getUTCDate() >= ISSUE_DAY) {
    const customers = (await env.DB.prepare(
      `SELECT client_slug, name, mrr_cents FROM customers
        WHERE status IN ('active') AND mrr_cents > 0
        ORDER BY client_slug`,
    ).all<CustomerRow>()).results;

    for (const c of customers) {
      const has = await env.DB.prepare(
        "SELECT 1 AS hit FROM client_invoices WHERE client_slug = ? AND period = ? AND status <> 'void' LIMIT 1",
      ).bind(c.client_slug, period).first<{ hit: number }>().catch(() => null);
      if (has) continue;

      out.missing.push(c.client_slug);
      await addInboxItem(env, {
        kind: "invoice_not_issued",
        title: `No ${period} invoice for ${c.name}`,
        body:
          `${c.name} is active at ${money(c.mrr_cents)} per month. No client_invoices row exists for ${period}.\n\n` +
          `Generate it with:\n` +
          `  node scripts/render-invoice.mjs ${c.client_slug} ${period} --number <NEXT-NO>\n\n` +
          `then record the row so this stops asking.`,
        target_type: "invoice",
        target_slug: c.client_slug,
        urgency: "high",
      });
      out.raised++;
    }
  }

  // 2. Issued, past due, and no payment recorded.
  const cutoff = now - OVERDUE_GRACE_DAYS * 86_400;
  const due = (await env.DB.prepare(
    `SELECT invoice_no, client_slug, total_cents, due_at, sent_at
       FROM client_invoices
      WHERE paid_at IS NULL
        AND status = 'sent'
        AND due_at IS NOT NULL
        AND due_at < ?
      ORDER BY due_at ASC`,
  ).bind(cutoff).all<InvoiceRow>()).results;

  for (const inv of due) {
    out.overdue.push(inv.invoice_no);
    const daysPast = Math.floor((now - (inv.due_at ?? now)) / 86_400);
    await addInboxItem(env, {
      kind: "invoice_payment_unrecorded",
      title: `${inv.invoice_no}: ${money(inv.total_cents)} due ${daysPast}d ago, no payment recorded`,
      body:
        `${inv.invoice_no} for ${inv.client_slug}, ${money(inv.total_cents)}, was due ` +
        `${new Date((inv.due_at ?? 0) * 1000).toISOString().slice(0, 10)} and no payment is recorded against it.\n\n` +
        `This does NOT mean the client has not paid. It means nothing here records that they have. ` +
        `Check the bank, then set paid_at so this stops asking. If it really is unpaid, that is a ` +
        `different conversation and this alert is not it.`,
      target_type: "invoice",
      target_slug: inv.client_slug,
      urgency: "high",
    });
    out.raised++;
  }

  return out;
}
