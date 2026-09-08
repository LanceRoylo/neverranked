/**
 * Run the REAL digest grader against a rendered digest, before deploying.
 *
 * The grader is the gate that held six consecutive sends. Checking the
 * new content against a mechanical banned-word list is not the same as
 * putting it through the gate, so this puts it through the gate.
 *
 * Reads ANTHROPIC_API_KEY from the environment. Never pass a key as an
 * argument, it lands in shell history.
 *
 *   export ANTHROPIC_API_KEY=...        (or: set it in your shell profile)
 *   npx tsx scripts/grade-digest-preview.ts
 */
import { buildDigestHtmlV2 } from "../src/email.ts";
import { gradeDigest, htmlToPlaintext } from "../src/digest-grader.ts";
import { weekReport, type ClientWeek } from "../src/digest-verdict.ts";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("ANTHROPIC_API_KEY not set. export it, then re-run.");
  process.exit(1);
}

const acts = (title: string, status: string, n = 1) =>
  new Map([["c", { client_slug: "c", total_pending: n, items: [{ type: "faq", title, status_label: status, cta_url: "" }] }]]);

/** The shapes that actually reach the grader in production. */
const CASES: { name: string; week: ClientWeek; pass: string | null; acts: ReturnType<typeof acts> | undefined }[] = [
  {
    name: "First reading, quiet, one carried-forward item",
    week: { domain: "example.com", clientSlug: "c", score: 70, scorePrev: null, share: 0.10, sharePrev: null,
            coverageWon: 17, coverageTotal: 18, clicks: null, clicksPrev: null, shippedThisWeek: [], events: [], actionsPending: 1 },
    pass: "Reading 1 of 3",
    acts: acts("Show your FAQs to visitors and to non-JSON-LD crawlers", "Open since Aug 24"),
  },
  {
    name: "Quiet reading, nothing pending at all (the emptiest legal digest)",
    week: { domain: "example.com", clientSlug: "c", score: 70, scorePrev: 70, share: 0.02, sharePrev: 0.02,
            coverageWon: 3, coverageTotal: 18, clicks: null, clicksPrev: null, shippedThisWeek: [], events: [], actionsPending: 0 },
    pass: "Reading 2 of 3",
    acts: undefined,
  },
  {
    name: "Real movement, so the verdict leads and the read must not repeat it",
    week: { domain: "example.com", clientSlug: "c", score: 74, scorePrev: 66, share: 0.15, sharePrev: 0.10,
            coverageWon: 12, coverageTotal: 18, clicks: null, clicksPrev: null,
            shippedThisWeek: ["FAQ block published"], events: [], actionsPending: 2 },
    pass: "Reading 3 of 3",
    acts: acts("Claim the Apple Maps listing", "In progress", 2),
  },
];

// Wrapped rather than top-level await: tsx compiles this to CJS here, where
// top-level await is a transform error, not a runtime one.
async function main(): Promise<void> {
  let failures = 0;
  for (const c of CASES) {
    const html = buildDigestHtmlV2("Greg", [weekReport(c.week)], [c.week], c.acts as never, undefined, undefined, null, c.pass);
    const grade = await gradeDigest({ ANTHROPIC_API_KEY: key } as never, htmlToPlaintext(html));
    const mark = grade.verdict === "pass" ? "PASS" : "HELD";
    if (grade.verdict !== "pass") failures++;
    console.log(`\n${mark}  ${c.name}`);
    console.log(`      voice=${grade.voice_pass}  substance=${grade.substance_pass}`);
    for (const i of grade.issues) console.log(`      - ${i}`);
  }
  console.log(`\n${CASES.length - failures}/${CASES.length} would ship.`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
