/**
 * Dashboard -- Shared glossary + automation schedule footer.
 *
 * Every page that shows scores, grades, citations, or timed metrics should
 * end with this block. It exists so a first-time reader (especially an
 * agency owner forwarding the dashboard to a client) can resolve any
 * unfamiliar term or wonder about cadence without opening a ticket.
 *
 * The glossary is opinionated: it explains *our* definition of each term,
 * not a Wikipedia lookup. The schedule section tells the user exactly
 * when automations run in their local reading, so "next Monday 6am UTC"
 * translates instantly to "Monday night/morning in my time zone."
 */

export interface GlossaryItem {
  term: string;
  definition: string;
}

const GLOSSARY: GlossaryItem[] = [
  {
    term: "AEO",
    definition:
      "Answer Engine Optimization. The work of making a site clear, structured, and cite-able by AI systems like ChatGPT, Perplexity, Google AI Overviews, and Gemini. AEO is to AI assistants what SEO was to Google's ten blue links.",
  },
  {
    term: "AEO Readiness Score",
    definition:
      "A 0-100 score measuring how well your site's structure, schema, content, and technical signals match what AI engines look for when picking a source to cite. Updated every weekly scan. 90+ is an A, 75-89 is B, 60-74 is C, 40-59 is D, below 40 is F.",
  },
  {
    term: "Citation share",
    definition:
      "When we run a fixed set of questions about your industry through ChatGPT, Perplexity, Gemini, and Claude, what percentage of the answers cite your site. 10% means one in ten answers names you. 0% means you are not yet in the conversation.",
  },
  {
    term: "Red flags",
    definition:
      "Structural issues our scanner flags on your site that specifically hurt AI citation: missing schema types, broken canonicals, no ratings, duplicate H1s, etc. Each one is a penalty signal AI engines may factor in. Fewer is better.",
  },
  {
    term: "Impressions",
    definition:
      "From Google Search Console. The number of times your site appeared in a Google search results page in a reporting week, whether or not the user clicked. Doubling impressions without doubling clicks usually means your title and description need work.",
  },
  {
    term: "Clicks",
    definition:
      "From Google Search Console. The number of times someone clicked through to your site from Google search results in a reporting week. Delayed by about three days because Google needs time to finalize the data.",
  },
];

const SCHEDULE = [
  {
    when: "Every day at 6:00 UTC",
    what: "Daily maintenance runs",
    detail:
      "Stale-roadmap checks, drip emails to new clients, snippet verification, regression alerts, and the automation digest. Most users never need to think about these.",
  },
  {
    when: "Every Monday at 6:00 UTC",
    what: "Weekly AEO update",
    detail:
      "Full site scan for every tracked domain, citation run across ChatGPT, Perplexity, Gemini, and Claude, Search Console data pull, and the Monday morning brief email to any user who opted in.",
  },
  {
    when: "First or second day of every month",
    what: "Monthly recap",
    detail:
      "A longer-form summary of score changes, citation trends, roadmap completions, and recommendations for the month ahead.",
  },
  {
    when: "January 1-3",
    what: "Annual recap",
    detail:
      "A year-in-review sent once per calendar year showing trajectory, wins, and the shape of the coming year's work.",
  },
];

export function buildGlossary(): string {
  const glossaryRows = GLOSSARY.map(
    (g) => `
    <details style="border-top:1px solid var(--line);padding:12px 0">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;outline:none">
        <span style="font-family:var(--mono);font-size:13px;color:var(--text);font-weight:500">${g.term}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">define &rarr;</span>
      </summary>
      <div style="margin-top:10px;font-size:12px;color:var(--text-soft);line-height:1.7;max-width:720px">
        ${g.definition}
      </div>
    </details>
  `,
  ).join("");

  const scheduleRows = SCHEDULE.map(
    (s) => `
    <div style="display:grid;grid-template-columns:180px 1fr;gap:20px;padding:12px 0;border-top:1px solid var(--line);font-size:12px;line-height:1.6">
      <div style="font-family:var(--mono);color:var(--gold);font-weight:500">${s.when}</div>
      <div>
        <div style="color:var(--text);font-weight:500;margin-bottom:4px">${s.what}</div>
        <div style="color:var(--text-faint);font-size:11px;line-height:1.65">${s.detail}</div>
      </div>
    </div>
  `,
  ).join("");

  // Grade table shows the score-to-grade mapping plus what each grade
  // means for the client so a letter on the dashboard always has a clear
  // interpretation. Agency owners forwarding this to their clients get
  // the same answer without having to rewrite the explanation.
  const gradeRows = [
    { grade: "A", range: "90 - 100", meaning: "Cite-ready. AI engines can confidently use your site as a source. Defense mode: keep it fresh." },
    { grade: "B", range: "75 - 89", meaning: "Strong foundation, a few specific gaps. A focused 30-45 day push typically moves you to an A." },
    { grade: "C", range: "60 - 74", meaning: "You are visible but not a first-choice source. Competitors with better structure are getting picked over you." },
    { grade: "D", range: "40 - 59", meaning: "Real structural problems. AI engines are skipping you for cleaner sources. The roadmap shows the fixes in priority order." },
    { grade: "F", range: "0 - 39", meaning: "AI engines cannot parse your site well enough to cite it. Every week without action the gap widens." },
  ]
    .map(
      (g) => `
    <div style="display:grid;grid-template-columns:60px 100px 1fr;gap:20px;padding:12px 0;border-top:1px solid var(--line);font-size:12px;line-height:1.6;align-items:baseline">
      <div style="font-family:var(--serif);font-style:italic;font-size:24px;color:var(--gold);line-height:1">${g.grade}</div>
      <div style="font-family:var(--mono);color:var(--text);font-size:12px">${g.range}</div>
      <div style="color:var(--text-soft);font-size:12px;line-height:1.6">${g.meaning}</div>
    </div>
  `,
    )
    .join("");

  return `
    <section style="margin-top:48px;padding-top:32px;border-top:1px solid var(--line)">
      <div class="label" style="margin-bottom:8px">\u00a7 Reference</div>
      <h2 style="font-style:italic;margin:0 0 8px;font-size:22px">Terms, grades, and <em style="color:var(--gold)">when things run</em></h2>
      <p style="font-size:12px;color:var(--text-faint);margin:0 0 28px;max-width:720px;line-height:1.65">
        Everything the dashboard uses, explained once. If a word on another page is unclear, it is probably answered here.
      </p>

      <div style="display:grid;grid-template-columns:1fr;gap:36px">
        <!-- Grade scale -->
        <div>
          <div class="label" style="margin-bottom:10px;color:var(--gold)">Grade scale</div>
          <div style="font-size:12px;color:var(--text-faint);margin-bottom:12px;max-width:720px;line-height:1.65">
            Every scan produces a 0-100 AEO Readiness Score and a letter grade. Use the grade to eyeball a domain fast. Use the score to measure movement.
          </div>
          <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:4px 20px">
            ${gradeRows}
          </div>
        </div>

        <!-- Automation schedule -->
        <div>
          <div class="label" style="margin-bottom:10px;color:var(--gold)">Automation schedule</div>
          <div style="font-size:12px;color:var(--text-faint);margin-bottom:12px;max-width:720px;line-height:1.65">
            The system runs on a fixed clock. Times are UTC so they do not drift with daylight saving. A US client on Eastern time reads 6am UTC as roughly 1-2am overnight, so by the time you open your laptop the day's work is already done.
          </div>
          <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:4px 20px">
            ${scheduleRows}
          </div>
        </div>

        <!-- Glossary -->
        <div>
          <div class="label" style="margin-bottom:10px;color:var(--gold)">Glossary</div>
          <div style="font-size:12px;color:var(--text-faint);margin-bottom:12px;max-width:720px;line-height:1.65">
            Click any term to expand its definition.
          </div>
          <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:4px 20px">
            ${glossaryRows}
          </div>
        </div>
      </div>
    </section>
  `;
}
