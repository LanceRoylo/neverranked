/**
 * Customer-facing strings on the check page, in one place.
 *
 * Source: the free-check fix plan, Appendix A, Version A, approved 2026-10-07.
 * index.ts interpolates these into the page (JSON.stringify for anything that
 * lands inside a script or JSON-LD), and dashboard/test/free-check-copy-guards
 * runs every one of them through the human-tone, causal-claim and engine-verb
 * guards. A string added to the page outside this file is not guarded.
 *
 * Rules that bind every line here: no em dashes, no semicolons, no
 * exclamation points, no number outside the Fact Bank, never a claim that a
 * business cannot be seen by AI, and never an engine-endorsement verb (the
 * engine-verb guard lists them).
 */

import { CONSENT_VERSIONS, CURRENT_CONSENT_VERSION } from "./consent";

export const PAGE_COPY = {
  metaDescription: "Free check. See what AI tools can read from your website and what they miss. Your score shows in seconds.",
  ogDescription: "Enter your URL. See what AI tools can read from your site and what they cannot. Free.",
  heroSub: "When someone asks ChatGPT or Google's AI about a business like yours, can it read your site? Paste your URL and see what AI tools can and cannot read from your pages. Your score is free and shows right away.",

  faqWhatChecks: "The labels AI tools use to read your site, and how your site appears to AI search tools like ChatGPT and Google AI.",
  faqWhy: "More people now ask ChatGPT, Google's AI and Perplexity for recommendations. This check shows whether those tools can read your site. It does not show what they say about you.",
  faqFree: "Yes. Your score is free and shows right away. Leave your email and we send the full result.",

  gateTitleMany: "things on your site AI tools may not read",
  gateTitleOne: "thing on your site AI tools may not read",
  gateTitleNone: "Your full result, by email",
  gateBody: "Leave your email and we send the full result: each missing signal by name, and what it is, in plain words.",
  gateButton: "Send my result",
  gateButtonBusy: "Sending...",
  gateConsent: CONSENT_VERSIONS[CURRENT_CONSENT_VERSION].text,
  gateSent: "Sent. Check your inbox for your full result.",

  insight80: "Your site reads cleanly to AI crawlers. Whether AI tools say your name when someone asks about your kind of business is a separate question.",
  insight65: "Your site is mostly readable to AI crawlers, with a few gaps. Whether AI tools say your name is a separate question.",
  insight45: "Parts of your site are hard for AI crawlers to read. Whether AI tools say your name is a separate question.",
  insightLow: "AI crawlers cannot read much of your site. Whether AI tools say your name is a separate question, and the next step is to ask them.",

  /** Follows the number: "[N] points below the top quarter of sites we have checked." */
  comparisonSuffix: "points below the top quarter of sites we have checked.",
  loading: "Scoring your site...",

  schemaMissingSuffix: "signals are missing or incomplete. Your emailed result names each one.",
  flagOne: "specific issue flagged on your site.",
  flagMany: "specific issues flagged on your site.",

  kitLabel: "Ask it yourself",
  kitLead: "Ask the question your customer would ask. Not your business name. Their question.",
  kitAfter: "Then look at two things. Is your name in the answer? And whose websites do the links underneath point to? Ask again tomorrow. The answer may change.",
  kitCategoryLabel: "What you do",
  kitTownLabel: "Your town",
  kitCategoryPlaceholder: "[what you do]",
  kitTownPlaceholder: "[your town]",
  kitCopy: "Copy",
  kitCopied: "Copied",
} as const;

/**
 * The three question templates (plan section 4). {plural}, {singular} and
 * {town} are filled in the browser from the kit's two editable fields. They
 * are fixed templates, never free text, so the same set can later be sent to
 * an engine without becoming a free AI proxy.
 */
export const KIT_QUESTIONS = [
  "What are the best {plural} in {town}?",
  "Can you recommend a good {singular} in {town}?",
  "Who should I call for {article} {singular} in {town}?",
] as const;

/** The /unsubscribe page. Reached from the link in every result email. */
export const UNSUB_COPY = {
  title: "Unsubscribe",
  ask: "Stop emails from NeverRanked about your free check?",
  button: "Unsubscribe",
  done: "You are unsubscribed. We will not email you about your free check again.",
  invalid: "This unsubscribe link is not valid. Reply to any email from us and we will take you off the list by hand.",
} as const;

/** Every string a guard must pass, for the copy test. */
export function allPageStrings(): string[] {
  return [...Object.values(PAGE_COPY), ...KIT_QUESTIONS, ...Object.values(UNSUB_COPY)];
}
