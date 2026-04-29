/**
 * Schema completeness grader.
 *
 * Empirical research (730-citation study, 2026): incomplete or generic
 * schema produces an 18-percentage-point CITATION PENALTY vs no schema
 * at all. AI engines interpret partial schema as a mismatch between
 * what you claim and what you deliver.
 *
 * This module grades JSON-LD against per-type field manifests:
 *   - Required fields missing  -> -15 points each
 *   - Recommended fields missing -> -5 points each
 *   - Placeholder text detected -> -20 points each
 *   - Empty / null values       -> -10 points each
 *
 * Score is clamped to [0, 100]. We block deployment below 60 (the
 * empirical "cliff" where partial schema starts hurting). Above 80 is
 * green-zone. 60-79 is gold-zone (deploys, but flagged for review).
 *
 * The grader is intentionally conservative -- false positives are
 * preferable to silent quality drift that produces the citation
 * penalty.
 */

export interface SchemaGrade {
  /** 0-100 numeric score. Floor at 0, no negative scores. */
  score: number;
  /** Human-readable issues. Each entry is one specific finding. */
  issues: string[];
  /** Schema type as detected from @type. Useful for the UI. */
  detectedType: string | null;
  /** True when score is at or above the deploy threshold (60). */
  meetsDeployThreshold: boolean;
}

/** Per-schema-type field manifests. Required fields lose 15 points
 *  each when missing; recommended fields lose 5 each. */
interface TypeManifest {
  required: string[];
  recommended: string[];
  /** Optional nested validators. e.g. FAQPage.mainEntity should be a
   *  non-empty array where each entry has name + acceptedAnswer.text. */
  custom?: (data: any, issues: string[]) => void;
}

const MANIFESTS: Record<string, TypeManifest> = {
  Organization: {
    required: ["name", "url"],
    recommended: ["logo", "sameAs", "address", "contactPoint", "founder", "foundingDate", "description"],
  },
  LocalBusiness: {
    required: ["name", "address", "telephone"],
    recommended: ["openingHours", "geo", "priceRange", "image", "url", "description", "sameAs"],
  },
  FAQPage: {
    required: ["mainEntity"],
    recommended: [],
    custom: (data, issues) => {
      const me = data.mainEntity;
      if (!Array.isArray(me) || me.length === 0) {
        issues.push("FAQPage.mainEntity should be an array of at least one Question");
        return;
      }
      me.forEach((q: any, i: number) => {
        if (q?.["@type"] !== "Question") issues.push(`FAQPage.mainEntity[${i}] missing @type=Question`);
        if (!q?.name) issues.push(`FAQPage.mainEntity[${i}].name (the question text) is missing`);
        const ans = q?.acceptedAnswer;
        if (!ans) issues.push(`FAQPage.mainEntity[${i}].acceptedAnswer is missing`);
        else if (!ans.text) issues.push(`FAQPage.mainEntity[${i}].acceptedAnswer.text (the answer text) is missing`);
      });
    },
  },
  HowTo: {
    required: ["name", "step"],
    recommended: ["image", "totalTime", "estimatedCost", "supply", "tool", "description"],
    custom: (data, issues) => {
      if (Array.isArray(data.step) && data.step.length === 0) issues.push("HowTo.step is empty");
    },
  },
  Article: {
    required: ["headline", "author", "datePublished", "image"],
    recommended: ["dateModified", "publisher", "mainEntityOfPage", "description"],
    custom: (data, issues) => {
      const a = data.author;
      if (a && typeof a === "object" && !Array.isArray(a)) {
        if (!a.name) issues.push("Article.author.name is missing");
      }
    },
  },
  BlogPosting: {
    required: ["headline", "author", "datePublished", "image"],
    recommended: ["dateModified", "publisher", "mainEntityOfPage", "description"],
  },
  Product: {
    required: ["name", "image", "description"],
    recommended: ["brand", "sku", "offers", "aggregateRating", "review"],
  },
  AggregateRating: {
    required: ["ratingValue", "reviewCount", "itemReviewed"],
    recommended: ["bestRating", "worstRating"],
  },
  SoftwareApplication: {
    required: ["name", "applicationCategory", "operatingSystem"],
    recommended: ["offers", "aggregateRating", "screenshot", "description"],
  },
  BreadcrumbList: {
    required: ["itemListElement"],
    recommended: [],
    custom: (data, issues) => {
      const items = data.itemListElement;
      if (!Array.isArray(items) || items.length === 0) {
        issues.push("BreadcrumbList.itemListElement should be a non-empty array");
        return;
      }
      items.forEach((it: any, i: number) => {
        if (!it?.name) issues.push(`BreadcrumbList.itemListElement[${i}].name is missing`);
        if (!it?.item && !it?.position) issues.push(`BreadcrumbList.itemListElement[${i}] needs item URL or position`);
      });
    },
  },
};

/** Patterns that indicate placeholder / generic content. Any match is
 *  a -20 penalty; the issue is reported with the offending field. */
const PLACEHOLDER_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\blorem ipsum\b/i, label: "lorem ipsum filler" },
  { regex: /\b(your|my|company|business) (name|brand|company)\b/i, label: "generic 'your name' placeholder" },
  { regex: /\[(your|client|brand|name|insert|tbd|todo|placeholder)\b[^\]]*\]/i, label: "bracketed placeholder" },
  { regex: /^example\.(com|org|net)$/i, label: "example.com placeholder URL" },
  { regex: /https?:\/\/example\.(com|org|net)/i, label: "example.com placeholder URL" },
  { regex: /^(\+?1?[\s.-]?)?\(?(555|000|123)\)?[\s.-]?\d{3}[\s.-]?\d{4}$/, label: "fake phone number (555/000/123)" },
  { regex: /@(example|test|placeholder)\.(com|org|net)/i, label: "fake email domain" },
  { regex: /\b(tbd|tba|coming soon|to be (added|determined)|placeholder)\b/i, label: "TBD / placeholder marker" },
  { regex: /^xxx+$/i, label: "xxx placeholder" },
  { regex: /^(test|sample|demo) ?(name|company|brand|product)$/i, label: "test/sample placeholder" },
];

/** Walk every leaf string value in a JSON object, calling cb for each.
 *  Skips @type / @context / @id since those are metadata fields. */
function walkLeaves(obj: any, path: string, cb: (value: string, leafPath: string) => void): void {
  if (obj == null) return;
  if (typeof obj === "string") { cb(obj, path); return; }
  if (typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkLeaves(v, `${path}[${i}]`, cb));
    return;
  }
  for (const k of Object.keys(obj)) {
    if (k.startsWith("@")) continue;
    walkLeaves(obj[k], path ? `${path}.${k}` : k, cb);
  }
}

/** Detect generic / placeholder content by string matching every leaf. */
function detectPlaceholders(data: any): string[] {
  const issues: string[] = [];
  const seenPatterns = new Set<string>();
  walkLeaves(data, "", (value, path) => {
    if (!value || value.length < 3) return;
    for (const { regex, label } of PLACEHOLDER_PATTERNS) {
      if (regex.test(value)) {
        const dedup = `${label}@${path}`;
        if (seenPatterns.has(dedup)) return;
        seenPatterns.add(dedup);
        issues.push(`Placeholder detected at "${path}": ${label} ("${value.slice(0, 60)}")`);
        break;
      }
    }
  });
  return issues;
}

/** Detect empty / null values on declared fields. Different from
 *  "missing" -- the field exists but its value is empty string, null,
 *  or an empty array/object. */
function detectEmpties(data: any, manifest: TypeManifest): string[] {
  const issues: string[] = [];
  const allFields = [...manifest.required, ...manifest.recommended];
  for (const field of allFields) {
    if (!(field in data)) continue;
    const v = data[field];
    if (v === "" || v === null) {
      issues.push(`Empty value at "${field}"`);
    } else if (Array.isArray(v) && v.length === 0) {
      issues.push(`Empty array at "${field}"`);
    } else if (typeof v === "object" && Object.keys(v).length === 0) {
      issues.push(`Empty object at "${field}"`);
    }
  }
  return issues;
}

/** Grade a single JSON-LD object. */
function gradeOne(data: any): SchemaGrade {
  const detectedType = data?.["@type"] || null;
  const issues: string[] = [];
  let score = 100;

  if (!detectedType) {
    issues.push("Schema has no @type -- AI engines may not recognize this as structured data");
    score -= 30;
    return { score: Math.max(0, score), issues, detectedType: null, meetsDeployThreshold: false };
  }

  const typeName = Array.isArray(detectedType) ? detectedType[0] : detectedType;
  const manifest = MANIFESTS[typeName as string];

  if (!manifest) {
    // Unknown type -- we can still detect placeholders but not
    // required-field completeness. Don't penalize heavily; this might
    // be a niche but valid type (Recipe, Event, JobPosting, etc.).
    issues.push(`Schema type "${typeName}" is not in our quality grader -- only generic checks applied`);
    score -= 5;
    const placeholders = detectPlaceholders(data);
    issues.push(...placeholders);
    score -= placeholders.length * 20;
    return { score: Math.max(0, score), issues, detectedType: typeName, meetsDeployThreshold: score >= 60 };
  }

  // Required fields
  for (const field of manifest.required) {
    if (!(field in data)) {
      issues.push(`Required field "${field}" missing`);
      score -= 15;
    }
  }
  // Recommended fields
  for (const field of manifest.recommended) {
    if (!(field in data)) {
      issues.push(`Recommended field "${field}" missing`);
      score -= 5;
    }
  }
  // Empty values
  const empties = detectEmpties(data, manifest);
  issues.push(...empties);
  score -= empties.length * 10;

  // Placeholders
  const placeholders = detectPlaceholders(data);
  issues.push(...placeholders);
  score -= placeholders.length * 20;

  // Custom validators
  if (manifest.custom) {
    const before = issues.length;
    manifest.custom(data, issues);
    score -= (issues.length - before) * 12;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, issues, detectedType: typeName, meetsDeployThreshold: score >= 60 };
}

/**
 * Public API. Accepts the raw JSON-LD string or parsed object. If the
 * payload is a @graph collection, grades each entry and returns the
 * lowest score (the weakest link gates deployment).
 */
export function gradeSchema(jsonLd: string | object): SchemaGrade {
  let parsed: any;
  if (typeof jsonLd === "string") {
    try {
      parsed = JSON.parse(jsonLd);
    } catch {
      return {
        score: 0,
        issues: ["Schema is not valid JSON"],
        detectedType: null,
        meetsDeployThreshold: false,
      };
    }
  } else {
    parsed = jsonLd;
  }

  // @graph collection: grade each, return weakest.
  if (parsed && Array.isArray(parsed["@graph"])) {
    const grades = parsed["@graph"].map((entry: any) => gradeOne(entry));
    const weakest = grades.reduce<SchemaGrade>((min, g) => g.score < min.score ? g : min, grades[0] || {
      score: 0, issues: ["@graph is empty"], detectedType: null, meetsDeployThreshold: false,
    });
    // Surface that we picked the weakest and how many we graded.
    return {
      ...weakest,
      issues: [`Graded ${grades.length} entries in @graph; showing weakest (score ${weakest.score})`, ...weakest.issues],
    };
  }

  // Plain top-level schema.
  return gradeOne(parsed);
}

/** Turn a score into a UI label. Used by the dashboard renderer. */
export function gradeBucket(score: number): "green" | "gold" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "gold";
  return "red";
}
