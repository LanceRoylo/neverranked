/**
 * A small identity block read from the scanned page's own HTML: the business
 * name, a plain-words category and the town, plus the title and meta
 * description. Stored in free_check_scans.summary_json at scan time.
 *
 * Two uses:
 *   - the "Ask it yourself" kit prefills its three questions with the
 *     category and town, so a visitor can paste them into an AI tool
 *   - the live AI check (later) will offer the same fields for confirmation
 *
 * Everything here is the SITE's words, never ours. Every field is capped and
 * stripped of markup, and every reader escapes it on output. Nothing is
 * guessed: a field the page does not state is null, and the kit shows an
 * editable placeholder instead.
 */

export interface SiteIdentity {
  /** JSON-LD name of the business node, then og:site_name, then the title. */
  name: string | null;
  /** Plain-words category from the most specific JSON-LD @type we know. */
  category: string | null;
  /** JSON-LD address.addressLocality. */
  town: string | null;
  og_site_name: string | null;
  title: string | null;
  meta_description: string | null;
}

const FIELD_CAP = 40;
const LONG_CAP = 200;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 31 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    });
}

/** Strip markup and control characters, collapse whitespace, cap length. */
export function cleanField(v: unknown, cap = FIELD_CAP): string | null {
  if (typeof v !== "string") return null;
  const s = decodeEntities(v)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  return s.length > cap ? s.slice(0, cap).trim() : s;
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const k = tag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i"));
    if (!k || k[1].toLowerCase() !== key) continue;
    const c = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i);
    if (c) return c[1];
  }
  return null;
}

/** schema.org types we can say in plain words. Singular nouns. The kit
 *  pluralises them for "What are the best ... in ...?". Most specific first
 *  wins, so a page typed both LocalBusiness and Dentist reads as "dentist". */
const CATEGORY_BY_TYPE: Record<string, string> = {
  dentist: "dentist",
  orthodontist: "orthodontist",
  physician: "doctor",
  medicalclinic: "medical clinic",
  optician: "optician",
  pharmacy: "pharmacy",
  veterinarycare: "veterinarian",
  attorney: "lawyer",
  legalservice: "law firm",
  notary: "notary",
  accountingservice: "accountant",
  financialservice: "financial advisor",
  bankorcreditunion: "bank",
  insuranceagency: "insurance agency",
  realestateagent: "real estate agent",
  hvacbusiness: "HVAC company",
  plumber: "plumber",
  electrician: "electrician",
  roofingcontractor: "roofer",
  generalcontractor: "general contractor",
  housepainter: "house painter",
  locksmith: "locksmith",
  movingcompany: "moving company",
  autorepair: "auto repair shop",
  autodealer: "car dealer",
  hotel: "hotel",
  resort: "resort",
  bedandbreakfast: "bed and breakfast",
  motel: "motel",
  hostel: "hostel",
  restaurant: "restaurant",
  cafeorcoffeeshop: "coffee shop",
  bakery: "bakery",
  barorpub: "bar",
  winery: "winery",
  brewery: "brewery",
  hairsalon: "hair salon",
  beautysalon: "beauty salon",
  dayspa: "day spa",
  nailsalon: "nail salon",
  healthclub: "gym",
  exercisegym: "gym",
  childcare: "child care center",
  school: "school",
  preschool: "preschool",
  florist: "florist",
  travelagency: "travel agency",
  theater: "theater",
  movietheater: "movie theater",
  museum: "museum",
  employmentagency: "staffing agency",
  storage: "self storage",
  selfstorage: "self storage",
  petstore: "pet store",
  furniturestore: "furniture store",
  jewelrystore: "jewelry store",
  bikestore: "bike shop",
  bookstore: "bookstore",
  clothingstore: "clothing store",
};

/** Walk parsed JSON-LD and collect every object node, following @graph and
 *  nested values. Bounded so a hostile page cannot make us loop. */
function collectNodes(data: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 6 || out.length > 200 || data === null || typeof data !== "object") return;
  if (Array.isArray(data)) {
    for (const d of data) collectNodes(d, out, depth + 1);
    return;
  }
  const obj = data as Record<string, unknown>;
  out.push(obj);
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") collectNodes(v, out, depth + 1);
  }
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  const arr = Array.isArray(t) ? t : [t];
  return arr.filter((x): x is string => typeof x === "string").map((x) => x.replace(/^.*[/#]/, "").toLowerCase());
}

const BUSINESS_HINT = /business|organization|organisation|service|store|restaurant|hotel|lodging|dentist|physician|attorney|agent|clinic|contractor|plumber|electrician|salon|spa|gym|agency|bank/;

export function extractIdentity(html: string): SiteIdentity {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanField(titleMatch ? titleMatch[1] : null, LONG_CAP);
  const meta_description = cleanField(metaContent(html, "name", "description"), LONG_CAP);
  const og_site_name = cleanField(metaContent(html, "property", "og:site_name"));

  const nodes: Record<string, unknown>[] = [];
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const b of blocks.slice(0, 20)) {
    const inner = b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try { collectNodes(JSON.parse(inner), nodes); } catch { /* a broken block is the page's problem, not ours */ }
  }

  let category: string | null = null;
  let name: string | null = null;
  let town: string | null = null;

  for (const node of nodes) {
    const types = typesOf(node);
    if (!category) {
      for (const t of types) {
        if (CATEGORY_BY_TYPE[t]) { category = CATEGORY_BY_TYPE[t]; break; }
      }
    }
    if (!name && types.some((t) => BUSINESS_HINT.test(t))) {
      name = cleanField(node["name"]);
    }
    if (!town) {
      const addr = node["address"];
      const addrs = Array.isArray(addr) ? addr : [addr];
      for (const a of addrs) {
        if (a && typeof a === "object") {
          const loc = cleanField((a as Record<string, unknown>)["addressLocality"]);
          if (loc) { town = loc; break; }
        }
      }
    }
  }

  if (!name) name = og_site_name;
  if (!name && title) name = cleanField(title.split(/\s[|\-–:]\s/)[0]);

  return { name, category, town, og_site_name, title, meta_description };
}
