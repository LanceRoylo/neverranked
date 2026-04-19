/**
 * AEO Analyzer -- Schema hierarchy regression harness
 *
 * Every "the tool missed X" report gets a fixture added here BEFORE we
 * fix the underlying code. That way we can never re-miss the same thing.
 *
 * Run with:
 *   npx tsx packages/aeo-analyzer/src/__tests__/hierarchy.test.ts
 *
 * Exits non-zero if any fixture fails. No framework dep -- just plain TS.
 */

// Declared locally so this file typechecks inside Worker tsconfigs that
// don't pull in @types/node. The test is only meant to run via tsx/Node.
declare const process: { exit(code: number): never };

import {
  hasSchemaType,
  isSubtypeOf,
  getAncestors,
  normalizeType,
  getUnknownTypes,
} from "../hierarchy";

interface Fixture {
  name: string;
  pageTypes: string[];
  target: string;
  expected: boolean;
  origin?: string; // Where the blind spot was reported from (e.g. "friend report 2026-04-15")
}

const FIXTURES: Fixture[] = [
  // ---- The original blind spot that started this harness ----
  {
    name: "ProfessionalService satisfies Organization (Thing > Organization > LocalBusiness > ProfessionalService)",
    pageTypes: ["ProfessionalService"],
    target: "Organization",
    expected: true,
    origin: "friend report 2026-04-15",
  },

  // ---- LocalBusiness family satisfying Organization ----
  { name: "LocalBusiness -> Organization", pageTypes: ["LocalBusiness"], target: "Organization", expected: true },
  { name: "Dentist -> Organization", pageTypes: ["Dentist"], target: "Organization", expected: true },
  { name: "LegalService -> Organization", pageTypes: ["LegalService"], target: "Organization", expected: true },
  { name: "Attorney -> Organization", pageTypes: ["Attorney"], target: "Organization", expected: true },
  { name: "Restaurant -> Organization", pageTypes: ["Restaurant"], target: "Organization", expected: true },
  { name: "Hotel -> Organization", pageTypes: ["Hotel"], target: "Organization", expected: true },
  { name: "Hospital -> Organization", pageTypes: ["Hospital"], target: "Organization", expected: true },
  { name: "Physician -> Organization", pageTypes: ["Physician"], target: "Organization", expected: true },
  { name: "Store -> Organization", pageTypes: ["Store"], target: "Organization", expected: true },
  { name: "AutoDealer -> Organization", pageTypes: ["AutoDealer"], target: "Organization", expected: true },
  { name: "Plumber -> Organization", pageTypes: ["Plumber"], target: "Organization", expected: true },
  { name: "RealEstateAgent -> Organization", pageTypes: ["RealEstateAgent"], target: "Organization", expected: true },

  // ---- LocalBusiness family is also Place ----
  { name: "Restaurant -> Place (LocalBusiness is also Place)", pageTypes: ["Restaurant"], target: "Place", expected: true },
  { name: "Hotel -> Place", pageTypes: ["Hotel"], target: "Place", expected: true },

  // ---- Organization subtree (non-LocalBusiness) ----
  { name: "NGO -> Organization", pageTypes: ["NGO"], target: "Organization", expected: true },
  { name: "Corporation -> Organization", pageTypes: ["Corporation"], target: "Organization", expected: true },
  { name: "CollegeOrUniversity -> Organization", pageTypes: ["CollegeOrUniversity"], target: "Organization", expected: true },
  { name: "SportsTeam -> Organization", pageTypes: ["SportsTeam"], target: "Organization", expected: true },
  { name: "NewsMediaOrganization -> Organization", pageTypes: ["NewsMediaOrganization"], target: "Organization", expected: true },

  // ---- Article/CreativeWork subtree ----
  { name: "BlogPosting -> Article", pageTypes: ["BlogPosting"], target: "Article", expected: true },
  { name: "NewsArticle -> Article", pageTypes: ["NewsArticle"], target: "Article", expected: true },
  { name: "ScholarlyArticle -> Article", pageTypes: ["ScholarlyArticle"], target: "Article", expected: true },
  { name: "LiveBlogPosting -> Article (deep subtype)", pageTypes: ["LiveBlogPosting"], target: "Article", expected: true },
  { name: "TechArticle -> CreativeWork", pageTypes: ["TechArticle"], target: "CreativeWork", expected: true },
  { name: "Recipe -> HowTo", pageTypes: ["Recipe"], target: "HowTo", expected: true },

  // ---- WebPage subtree ----
  { name: "FAQPage -> WebPage", pageTypes: ["FAQPage"], target: "WebPage", expected: true },
  { name: "QAPage -> WebPage", pageTypes: ["QAPage"], target: "WebPage", expected: true },

  // ---- Rating subtree ----
  { name: "AggregateRating -> Rating", pageTypes: ["AggregateRating"], target: "Rating", expected: true },

  // ---- BreadcrumbList inherits from ItemList ----
  { name: "BreadcrumbList matches itself", pageTypes: ["BreadcrumbList"], target: "BreadcrumbList", expected: true },
  { name: "BreadcrumbList -> ItemList", pageTypes: ["BreadcrumbList"], target: "ItemList", expected: true },

  // ---- Negative cases (make sure we don't over-match) ----
  { name: "Person is NOT Organization", pageTypes: ["Person"], target: "Organization", expected: false },
  { name: "Product is NOT Organization", pageTypes: ["Product"], target: "Organization", expected: false },
  { name: "Article is NOT Organization", pageTypes: ["Article"], target: "Organization", expected: false },
  { name: "BreadcrumbList is NOT Article", pageTypes: ["BreadcrumbList"], target: "Article", expected: false },
  { name: "Empty types is NOT Organization", pageTypes: [], target: "Organization", expected: false },
  { name: "Unknown type is NOT Organization", pageTypes: ["TotallyMadeUpType"], target: "Organization", expected: false },

  // ---- Multiple types on one page (realistic JSON-LD usage) ----
  {
    name: "Page with [WebSite, Organization] has Organization",
    pageTypes: ["WebSite", "Organization"],
    target: "Organization",
    expected: true,
  },
  {
    name: "Page with [ProfessionalService, WebSite] has Organization via subtype",
    pageTypes: ["ProfessionalService", "WebSite"],
    target: "Organization",
    expected: true,
  },
  {
    name: "Page with [@type array] like ['LocalBusiness', 'Dentist'] has Organization",
    pageTypes: ["LocalBusiness", "Dentist"],
    target: "Organization",
    expected: true,
  },

  // ---- Type normalization (URL prefixes, schema: prefix) ----
  {
    name: "URL-prefixed type 'https://schema.org/Organization' is Organization",
    pageTypes: ["https://schema.org/Organization"],
    target: "Organization",
    expected: true,
  },
  {
    name: "schema:-prefixed type 'schema:ProfessionalService' satisfies Organization",
    pageTypes: ["schema:ProfessionalService"],
    target: "Organization",
    expected: true,
  },
  {
    name: "Whitespace around type is tolerated",
    pageTypes: ["  ProfessionalService  "],
    target: "Organization",
    expected: true,
  },
];

// ---- Runner ----

interface Result {
  pass: boolean;
  name: string;
  got: boolean;
  expected: boolean;
  origin?: string;
}

function runFixtures(): Result[] {
  const results: Result[] = [];
  for (const f of FIXTURES) {
    const got = hasSchemaType(f.pageTypes, f.target);
    results.push({ pass: got === f.expected, name: f.name, got, expected: f.expected, origin: f.origin });
  }
  return results;
}

// Sanity checks on the helpers themselves (not driven by the fixture list)
function runSanityChecks(): Result[] {
  const results: Result[] = [];

  // normalizeType strips prefixes
  const n1 = normalizeType("https://schema.org/Organization");
  results.push({ pass: n1 === "Organization", name: "normalizeType strips URL prefix", got: n1 === "Organization", expected: true });

  // getAncestors walks up the tree
  const ancestors = getAncestors("ProfessionalService");
  const includesAll = ancestors.includes("ProfessionalService")
    && ancestors.includes("LocalBusiness")
    && ancestors.includes("Organization")
    && ancestors.includes("Place")
    && ancestors.includes("Thing");
  results.push({ pass: includesAll, name: "getAncestors('ProfessionalService') includes full chain", got: includesAll, expected: true });

  // isSubtypeOf is self-matching
  const selfMatch = isSubtypeOf("Organization", "Organization");
  results.push({ pass: selfMatch, name: "isSubtypeOf matches self", got: selfMatch, expected: true });

  // Unknown types are surfaced
  const unknown = getUnknownTypes(["Organization", "TotallyMadeUpType", "ProfessionalService"]);
  const correctUnknown = unknown.length === 1 && unknown[0] === "TotallyMadeUpType";
  results.push({ pass: correctUnknown, name: "getUnknownTypes finds the made-up one only", got: correctUnknown, expected: true });

  return results;
}

function main(): void {
  const fixtureResults = runFixtures();
  const sanityResults = runSanityChecks();
  const all = [...fixtureResults, ...sanityResults];

  let failed = 0;
  for (const r of all) {
    if (r.pass) continue;
    failed++;
    const originNote = r.origin ? ` [origin: ${r.origin}]` : "";
    console.error(`FAIL: ${r.name}${originNote}`);
    console.error(`      got ${r.got}, expected ${r.expected}`);
  }

  const passed = all.length - failed;
  console.log(`\n${passed}/${all.length} hierarchy fixtures passed`);

  if (failed > 0) {
    console.error(`${failed} fixture(s) failed`);
    process.exit(1);
  }
}

main();
