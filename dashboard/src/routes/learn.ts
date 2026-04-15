/**
 * Dashboard -- Knowledge base for clients
 *
 * AEO terminology, score explanations, schema primer,
 * and how-to guides. All content is inline (no CMS dependency).
 */

import type { User } from "../types";
import { layout, html, esc } from "../render";

interface Article {
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: string;
}

const CATEGORIES = [
  { id: "fundamentals", label: "AEO Fundamentals" },
  { id: "scores", label: "Understanding Your Scores" },
  { id: "schema", label: "Schema Markup" },
  { id: "signals", label: "Technical Signals" },
  { id: "citations", label: "AI Citations" },
  { id: "strategy", label: "Strategy" },
];

const ARTICLES: Article[] = [
  // --- Fundamentals ---
  {
    slug: "what-is-aeo",
    title: "What is AEO?",
    category: "fundamentals",
    summary: "AEO stands for AI Engine Optimization. It is the practice of making your website visible and credible to AI-powered search engines and assistants.",
    body: `
      <p>Traditional SEO optimizes for Google's link-based ranking algorithm. AEO optimizes for a different question: when an AI assistant answers a user's query, will it reference your business?</p>
      <p>AI engines like ChatGPT, Perplexity, Google's AI Overviews, and Claude read and synthesize web content differently than traditional search crawlers. They prioritize:</p>
      <ul>
        <li><strong>Structured data</strong> -- schema markup that explicitly describes what your business is, what it offers, and how it relates to the broader web</li>
        <li><strong>Content authority</strong> -- clear, factual, well-organized content that directly answers questions in your domain</li>
        <li><strong>Technical accessibility</strong> -- fast load times, clean HTML, proper meta tags, and no barriers to crawling</li>
        <li><strong>Entity recognition</strong> -- being mentioned across multiple credible sources so AI models recognize your business as a real entity</li>
      </ul>
      <p>Your AEO score measures how well your site performs across these dimensions. A high score means AI engines are more likely to cite you, reference you, and send traffic your way.</p>
    `,
  },
  {
    slug: "aeo-vs-seo",
    title: "AEO vs SEO: what is the difference?",
    category: "fundamentals",
    summary: "SEO optimizes for link-based ranking in traditional search results. AEO optimizes for being cited and referenced by AI-powered engines.",
    body: `
      <p>SEO and AEO are not opposites. Good SEO is the foundation that AEO builds on. The difference is in what you are optimizing for.</p>
      <h4>SEO optimizes for:</h4>
      <ul>
        <li>Ranking position in a list of blue links</li>
        <li>Click-through rate from search result snippets</li>
        <li>Backlink authority and domain rating</li>
        <li>Keyword density and placement</li>
      </ul>
      <h4>AEO optimizes for:</h4>
      <ul>
        <li>Being the source an AI model cites when answering a question</li>
        <li>Structured data that machines can parse without ambiguity</li>
        <li>Content that directly answers questions (not just targets keywords)</li>
        <li>Entity presence across the web so AI models trust your brand</li>
      </ul>
      <p>The overlap is significant. Fast, well-structured, authoritative sites rank well in traditional search AND get cited by AI engines. AEO adds a layer of intentionality around machine readability and entity recognition.</p>
    `,
  },
  {
    slug: "why-aeo-matters",
    title: "Why AEO matters now",
    category: "fundamentals",
    summary: "AI-powered search is growing fast. Businesses that optimize early gain a compounding advantage as AI becomes the default way people find information.",
    body: `
      <p>The shift is already happening. Google's AI Overviews appear on a growing percentage of searches. ChatGPT, Perplexity, and Claude handle millions of queries daily. When someone asks an AI assistant "what is the best [your category] in [your city]," the answer comes from how well the AI understands your business.</p>
      <p>Early movers in AEO have a compounding advantage:</p>
      <ul>
        <li><strong>AI models are trained on snapshots of the web.</strong> The structured data and content you publish today influences how AI models understand your business for months or years.</li>
        <li><strong>Citations build on themselves.</strong> Once an AI engine starts citing you, it reinforces your entity recognition, making future citations more likely.</li>
        <li><strong>Competitors are slow.</strong> Most businesses have not started thinking about AEO. Moving first means building a moat before the market catches up.</li>
      </ul>
    `,
  },

  // --- Scores ---
  {
    slug: "aeo-score-explained",
    title: "How your AEO score works",
    category: "scores",
    summary: "Your AEO score is a composite of schema coverage, technical signals, content structure, and red flags. It ranges from 0 to 100.",
    body: `
      <p>The AEO score is not a single metric. It is a weighted composite that reflects how ready your site is for AI engine visibility. Here is what goes into it:</p>
      <h4>Schema coverage (heavy weight)</h4>
      <p>Which structured data types are present on your site? Organization, LocalBusiness, Product, FAQ, BreadcrumbList, and other schema types each contribute points. More coverage means the AI has more structured context about your business.</p>
      <h4>Technical signals (moderate weight)</h4>
      <p>Page speed, meta descriptions, Open Graph tags, canonical URLs, heading structure, robots.txt accessibility. These determine whether AI crawlers can efficiently read and index your content.</p>
      <h4>Red flags (penalty)</h4>
      <p>Issues that actively hurt your AEO readiness. Missing titles, broken schemas, blocked crawlers, duplicate content signals. Each red flag reduces your score.</p>
      <h4>Content structure (moderate weight)</h4>
      <p>Heading hierarchy, FAQ patterns, clear answer formatting. Content that is organized to answer questions directly scores higher.</p>
    `,
  },
  {
    slug: "grade-scale",
    title: "What grades A through D mean",
    category: "scores",
    summary: "Grades translate your numeric score into an actionable readiness level. A means AI engines see you clearly. D means you are mostly invisible.",
    body: `
      <h4>Grade A (80-100)</h4>
      <p>Your site has strong schema coverage, clean technical signals, and minimal red flags. AI engines have what they need to understand and cite your business. Focus shifts to maintaining this position and monitoring competitors.</p>
      <h4>Grade B (60-79)</h4>
      <p>Good foundation with clear gaps. You likely have some schema types in place but are missing key ones for your industry. Technical signals are mostly clean. A focused sprint on schema additions and red flag fixes can push you to A.</p>
      <h4>Grade C (40-59)</h4>
      <p>Below average AEO readiness. AI engines can see your site exists but lack the structured context to confidently cite you. Competitors with better schema coverage will be preferred. Prioritize the highest-impact schema types and fix technical red flags.</p>
      <h4>Grade D (0-39)</h4>
      <p>AI engines have very little structured information about your business. This is common for sites that have never considered machine readability. The upside is large: even basic schema additions can produce significant score jumps.</p>
    `,
  },
  {
    slug: "score-changes",
    title: "Why your score changes week to week",
    category: "scores",
    summary: "Scores can shift from site changes, schema additions, technical regressions, or updates to the scanning methodology itself.",
    body: `
      <p>Your AEO score is recalculated on every weekly scan. Common reasons for changes:</p>
      <ul>
        <li><strong>You added schema markup</strong> -- Score increases when new structured data types are detected.</li>
        <li><strong>A page changed or was removed</strong> -- If a page with schema markup goes offline or is restructured, the schema may no longer be detected.</li>
        <li><strong>Technical regression</strong> -- A site update broke a meta tag, slowed page load, or introduced a crawl blocker.</li>
        <li><strong>Plugin or CMS update</strong> -- WordPress plugins, Shopify themes, and CMS updates can add or remove structured data without you knowing.</li>
        <li><strong>Red flag resolved</strong> -- Fixing a red flag removes a score penalty, increasing your score.</li>
      </ul>
      <p>Small fluctuations (1-3 points) are normal. Drops of 5 or more points trigger an automatic alert so you can investigate.</p>
    `,
  },

  // --- Schema ---
  {
    slug: "what-is-schema",
    title: "What is schema markup?",
    category: "schema",
    summary: "Schema markup is structured data added to your website's code that tells search engines and AI exactly what your content means.",
    body: `
      <p>Think of your website as a document written for humans. Schema markup is a translation layer that makes that document readable by machines. It uses a standardized vocabulary (from schema.org) to describe things like:</p>
      <ul>
        <li>Your business name, address, phone number, and hours</li>
        <li>Your products, their prices, and availability</li>
        <li>Your services and service areas</li>
        <li>FAQs and their answers</li>
        <li>Reviews and ratings</li>
        <li>Articles, authors, and publication dates</li>
      </ul>
      <p>Without schema markup, AI engines have to guess what your content means by reading it like a human would. With schema markup, they know exactly what each piece of information represents.</p>
      <p>Schema is typically added as JSON-LD (JavaScript Object Notation for Linked Data) in a script tag on your pages. It is invisible to visitors but readable by every major search engine and AI system.</p>
    `,
  },
  {
    slug: "schema-types-that-matter",
    title: "Which schema types matter most",
    category: "schema",
    summary: "Not all schema types are equal. Organization, LocalBusiness, FAQ, Product, and BreadcrumbList are the highest-impact types for most businesses.",
    body: `
      <h4>Organization / LocalBusiness</h4>
      <p>The foundation. Tells AI engines who you are, where you are, and how to contact you. Without this, everything else lacks context. Every business site should have one of these.</p>
      <h4>FAQ</h4>
      <p>Directly maps questions to answers. AI engines love this because it gives them pre-structured Q&A pairs they can cite directly. High impact for service businesses and any site with common customer questions.</p>
      <h4>Product</h4>
      <p>Essential for e-commerce. Describes products with prices, availability, reviews, and images in a format AI engines can parse without ambiguity.</p>
      <h4>BreadcrumbList</h4>
      <p>Shows the hierarchy of your site. Helps AI engines understand how your pages relate to each other and navigate your content structure.</p>
      <h4>Article / BlogPosting</h4>
      <p>Marks content as authored, dated, and attributed. Important for establishing content authority and helping AI engines assess freshness and credibility.</p>
      <h4>Review / AggregateRating</h4>
      <p>Social proof in machine-readable format. AI engines factor ratings and review counts into their assessment of business credibility.</p>
    `,
  },

  // --- Signals ---
  {
    slug: "technical-signals-explained",
    title: "Technical signals explained",
    category: "signals",
    summary: "Technical signals are the infrastructure-level factors that determine whether AI crawlers can efficiently read your site.",
    body: `
      <p>Your AEO report tracks these key technical signals:</p>
      <h4>Page speed</h4>
      <p>How fast your pages load. AI crawlers respect speed limits and may skip slow pages. A fast site gets crawled more thoroughly.</p>
      <h4>Meta descriptions</h4>
      <p>Concise summaries of each page's content. AI engines use these as quick context when deciding whether to read the full page.</p>
      <h4>Open Graph tags</h4>
      <p>Metadata that describes your content for social sharing. AI engines also use these as supplemental context signals.</p>
      <h4>Canonical URLs</h4>
      <p>Tells crawlers which version of a page is the definitive one. Prevents confusion from duplicate content.</p>
      <h4>Heading structure</h4>
      <p>Proper H1 through H6 hierarchy helps AI engines understand your content's organization and identify key topics.</p>
      <h4>Robots.txt</h4>
      <p>Controls which crawlers can access which parts of your site. Misconfigured robots.txt can block AI engines entirely.</p>
    `,
  },
  {
    slug: "what-are-red-flags",
    title: "What are red flags?",
    category: "signals",
    summary: "Red flags are specific issues on your site that actively hurt your AEO readiness. Each one reduces your score.",
    body: `
      <p>Red flags are not just "nice to fix" items. They are problems that directly reduce your visibility to AI engines. Common red flags include:</p>
      <ul>
        <li><strong>Missing page title</strong> -- The most basic piece of metadata. Without it, AI engines have no quick context for the page.</li>
        <li><strong>No meta description</strong> -- Forces AI engines to guess what the page is about from the body content alone.</li>
        <li><strong>Broken or invalid schema</strong> -- Schema markup with errors can be worse than no schema, because it sends conflicting signals.</li>
        <li><strong>Blocked by robots.txt</strong> -- If your robots.txt blocks AI crawlers (GPTBot, PerplexityBot, ClaudeBot), they cannot read your content at all.</li>
        <li><strong>No HTTPS</strong> -- A security signal that AI engines factor into trust assessments.</li>
        <li><strong>Extremely slow page</strong> -- Pages that take more than 5 seconds to load may be skipped by crawlers.</li>
      </ul>
      <p>Your report lists every red flag detected. Fixing them is usually the fastest way to improve your score because each fix removes a penalty.</p>
    `,
  },

  // --- Citations ---
  {
    slug: "what-are-ai-citations",
    title: "What are AI citations?",
    category: "citations",
    summary: "AI citations measure how often AI engines mention or reference your business when answering questions in your industry.",
    body: `
      <p>When someone asks ChatGPT, Perplexity, or Google's AI Overview a question related to your business, the AI generates an answer by synthesizing information from its training data and live web content. If it mentions your business by name, links to your site, or references your content, that is a citation.</p>
      <p>NeverRanked tracks citations by running your industry keywords through multiple AI engines and recording which businesses get mentioned. This gives you:</p>
      <ul>
        <li><strong>Citation share</strong> -- What percentage of relevant queries result in your business being mentioned</li>
        <li><strong>Competitive citation comparison</strong> -- How your citation rate compares to competitors</li>
        <li><strong>Engine breakdown</strong> -- Which AI engines cite you most and least often</li>
        <li><strong>Keyword performance</strong> -- Which specific queries trigger citations for your business</li>
      </ul>
      <p>Citations are the outcome metric. Your AEO score measures readiness. Citations measure actual results.</p>
    `,
  },
  {
    slug: "improving-citations",
    title: "How to improve your AI citation rate",
    category: "citations",
    summary: "Improving citations requires a combination of better schema, stronger content authority, and broader entity presence across the web.",
    body: `
      <p>There is no single trick to get cited more often. Citations are the result of compounding signals. The most effective levers:</p>
      <h4>1. Complete your schema coverage</h4>
      <p>AI engines are more likely to cite businesses they can understand with high confidence. Complete schema markup removes ambiguity.</p>
      <h4>2. Create content that directly answers questions</h4>
      <p>AI engines cite sources that provide clear, concise answers. FAQ pages, how-to guides, and definitive explanations of topics in your domain all increase your chances.</p>
      <h4>3. Build entity presence</h4>
      <p>AI models build entity recognition from mentions across the web. Consistent business information on directories, industry sites, press mentions, and social profiles all reinforce your entity.</p>
      <h4>4. Maintain technical health</h4>
      <p>If AI crawlers cannot reach your content, they cannot cite it. Keep your site fast, accessible, and free of red flags.</p>
      <h4>5. Monitor and iterate</h4>
      <p>Use your weekly citation reports to see which keywords trigger citations and which do not. Focus your content efforts on the gaps.</p>
    `,
  },

  // --- Strategy ---
  {
    slug: "reading-your-report",
    title: "How to read your AEO report",
    category: "strategy",
    summary: "A walkthrough of every section in your domain report and what to focus on first.",
    body: `
      <p>Your domain report has several sections. Here is how to read them in priority order:</p>
      <h4>1. Score and grade (top of page)</h4>
      <p>Your headline number. The grade gives you a quick read, the score gives you precision. The delta shows whether you are trending up or down.</p>
      <h4>2. Executive summary</h4>
      <p>A plain-language explanation of your current state, what changed, and what it means. Start here for context.</p>
      <h4>3. Recommended next actions</h4>
      <p>Prioritized list of what to do next. High-impact items should be addressed first. These are the fastest paths to score improvement.</p>
      <h4>4. Red flags</h4>
      <p>Active problems that are hurting your score. Fix these before adding new schema or content.</p>
      <h4>5. Technical signals</h4>
      <p>Infrastructure health check. Green dots are fine. Yellow and red dots need attention.</p>
      <h4>6. Score trend</h4>
      <p>Your score over time. Look for the direction of the trend, not individual week-to-week fluctuations.</p>
      <h4>7. Schema coverage by page</h4>
      <p>Shows which pages have which schema types. Gaps here are opportunities.</p>
    `,
  },
  {
    slug: "competitor-comparison",
    title: "Using competitor comparison",
    category: "strategy",
    summary: "Your competitor page shows how your AEO readiness stacks up. Use it to find gaps you can close and advantages you should protect.",
    body: `
      <p>The competitor comparison page is one of the most actionable sections of your dashboard. Here is how to use it:</p>
      <h4>Score comparison</h4>
      <p>See where you rank relative to competitors. If you are behind, the gap tells you how much ground to cover. If you are ahead, the gap tells you how much buffer you have.</p>
      <h4>Schema matrix</h4>
      <p>The most tactical section. Green squares show which schema types each domain has. Look for columns where competitors have green and you have gray. Those are your highest-leverage additions.</p>
      <h4>Your advantages</h4>
      <p>Schema types you have that no competitor does. These are defensible. Protect them by keeping that markup active and validated.</p>
      <h4>Gaps to close</h4>
      <p>Schema types competitors have that you do not. These are your priority adds. Each one you implement closes a competitive gap.</p>
      <h4>Score trend</h4>
      <p>Are competitors improving faster than you? The trend chart shows trajectory, which matters more than any single score.</p>
    `,
  },
  {
    slug: "roadmap-explained",
    title: "How the roadmap works",
    category: "strategy",
    summary: "Your roadmap is a prioritized action plan for improving AEO readiness. It is organized in phases and tracks completion over time.",
    body: `
      <p>The roadmap is your implementation plan. It breaks AEO improvements into manageable tasks, organized by phase and priority.</p>
      <h4>Phases</h4>
      <p>Tasks are grouped into phases that build on each other. Phase 1 covers the fundamentals (Organization schema, basic technical fixes). Later phases add more advanced optimizations. Complete earlier phases before moving to later ones.</p>
      <h4>Categories</h4>
      <p>Each task belongs to a category: schema, content, technical, or authority. This helps you route work to the right team members or service providers.</p>
      <h4>Status</h4>
      <p>Tasks move through pending, in progress, and done. You can mark tasks as done directly from the dashboard. Your team at NeverRanked may also update task status as they implement changes.</p>
      <h4>Notes</h4>
      <p>You can leave notes on any task. Use this to flag questions, provide context, or share progress updates with your team.</p>
    `,
  },
];

export function handleLearn(user: User): Response {
  const grouped = new Map<string, Article[]>();
  for (const a of ARTICLES) {
    const arr = grouped.get(a.category) || [];
    arr.push(a);
    grouped.set(a.category, arr);
  }

  const sections = CATEGORIES.map(cat => {
    const articles = grouped.get(cat.id) || [];
    if (articles.length === 0) return "";
    return `
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">${esc(cat.label)}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${articles.map(a => `
            <a href="/learn/${a.slug}" class="card" style="display:block;text-decoration:none;padding:16px 20px;transition:border-color .3s">
              <div style="font-size:15px;color:var(--text);margin-bottom:4px">${esc(a.title)}</div>
              <div style="font-size:12px;color:var(--text-faint);line-height:1.5">${esc(a.summary)}</div>
            </a>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">Dashboard</div>
      <h1>Knowledge <em>base</em></h1>
      <div style="font-size:14px;color:var(--text-faint);margin-top:12px;max-width:560px;line-height:1.6">
        Everything you need to understand your AEO scores, what the data means, and how to act on it.
      </div>
    </div>
    ${sections}
  `;

  return html(layout("Learn", body, user));
}

export function handleLearnArticle(slug: string, user: User): Response {
  const article = ARTICLES.find(a => a.slug === slug);

  if (!article) {
    return html(layout("Not Found", '<div class="empty"><h3>Article not found</h3><p><a href="/learn" style="color:var(--gold)">Back to knowledge base</a></p></div>', user), 404);
  }

  const cat = CATEGORIES.find(c => c.id === article.category);

  // Find prev/next in same category
  const catArticles = ARTICLES.filter(a => a.category === article.category);
  const idx = catArticles.findIndex(a => a.slug === slug);
  const prev = idx > 0 ? catArticles[idx - 1] : null;
  const next = idx < catArticles.length - 1 ? catArticles[idx + 1] : null;

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/learn" style="color:var(--text-mute)">Knowledge Base</a>${cat ? ' / ' + esc(cat.label) : ''}
      </div>
      <h1><em>${esc(article.title)}</em></h1>
    </div>

    <div style="max-width:640px">
      <div class="article-body" style="font-size:14px;line-height:1.75;color:var(--text-soft)">
        ${article.body}
      </div>

      ${prev || next ? `
        <div style="display:flex;justify-content:space-between;gap:16px;margin-top:48px;padding-top:24px;border-top:1px solid var(--line)">
          ${prev ? `<a href="/learn/${prev.slug}" style="color:var(--text-faint);text-decoration:none;font-size:13px;transition:color .2s" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-faint)'">&larr; ${esc(prev.title)}</a>` : '<span></span>'}
          ${next ? `<a href="/learn/${next.slug}" style="color:var(--text-faint);text-decoration:none;font-size:13px;text-align:right;transition:color .2s" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-faint)'">${esc(next.title)} &rarr;</a>` : '<span></span>'}
        </div>
      ` : ''}
    </div>
  `;

  return html(layout("Learn", body, user));
}
