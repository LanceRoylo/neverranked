/**
 * Schema Generator — produces JSON-LD structured data
 * from client business info and scan data.
 *
 * Each generator returns a plain object ready to be
 * JSON.stringify'd into a <script type="application/ld+json"> block.
 */

import type { InjectionConfig } from "./types";

/** Parse business address JSON safely */
function parseAddress(raw: string | null): {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Parse social profiles JSON safely */
function parseSocial(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ---------- Schema generators ----------

export function generateOrganization(config: InjectionConfig): object {
  const addr = parseAddress(config.business_address);
  const social = parseSocial(config.business_social);

  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.business_name || "",
    url: config.business_url || "",
  };

  if (config.business_description) {
    org.description = config.business_description;
  }
  if (config.business_logo_url) {
    org.logo = config.business_logo_url;
  }
  if (config.business_email) {
    org.email = config.business_email;
  }
  if (config.business_phone) {
    org.telephone = config.business_phone;
  }
  if (addr.street) {
    org.address = {
      "@type": "PostalAddress",
      ...(addr.street && { streetAddress: addr.street }),
      ...(addr.city && { addressLocality: addr.city }),
      ...(addr.state && { addressRegion: addr.state }),
      ...(addr.zip && { postalCode: addr.zip }),
      ...(addr.country && { addressCountry: addr.country }),
    };
  }
  if (social.length > 0) {
    org.sameAs = social;
  }

  return org;
}

export function generateWebSite(config: InjectionConfig): object {
  const site: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: config.business_name || "",
    url: config.business_url || "",
  };

  // Add SearchAction for sitelinks search box
  if (config.business_url) {
    const baseUrl = config.business_url.replace(/\/$/, "");
    site.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    };
  }

  return site;
}

export function generateLocalBusiness(config: InjectionConfig): object {
  const addr = parseAddress(config.business_address);
  const social = parseSocial(config.business_social);

  const biz: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: config.business_name || "",
    url: config.business_url || "",
  };

  if (config.business_description) {
    biz.description = config.business_description;
  }
  if (config.business_logo_url) {
    biz.image = config.business_logo_url;
  }
  if (config.business_phone) {
    biz.telephone = config.business_phone;
  }
  if (config.business_email) {
    biz.email = config.business_email;
  }
  if (addr.street) {
    biz.address = {
      "@type": "PostalAddress",
      ...(addr.street && { streetAddress: addr.street }),
      ...(addr.city && { addressLocality: addr.city }),
      ...(addr.state && { addressRegion: addr.state }),
      ...(addr.zip && { postalCode: addr.zip }),
      ...(addr.country && { addressCountry: addr.country }),
    };
  }
  if (social.length > 0) {
    biz.sameAs = social;
  }

  return biz;
}

export function generateBreadcrumbList(
  pages: { name: string; url: string }[]
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: pages.map((page, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: page.name,
      item: page.url,
    })),
  };
}

export function generateFAQPage(
  faqs: { question: string; answer: string }[]
): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function generateAggregateRating(
  config: InjectionConfig,
  ratingValue: number,
  reviewCount: number,
  bestRating = 5
): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.business_name || "",
    url: config.business_url || "",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue,
      reviewCount,
      bestRating,
    },
  };
}

export function generateArticle(meta: {
  headline: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  imageUrl?: string;
  publisherName: string;
  publisherLogoUrl?: string;
  description?: string;
}): object {
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.headline,
    datePublished: meta.datePublished,
    author: {
      "@type": "Person",
      name: meta.author,
    },
    publisher: {
      "@type": "Organization",
      name: meta.publisherName,
      ...(meta.publisherLogoUrl && {
        logo: { "@type": "ImageObject", url: meta.publisherLogoUrl },
      }),
    },
  };

  if (meta.dateModified) article.dateModified = meta.dateModified;
  if (meta.imageUrl) article.image = meta.imageUrl;
  if (meta.description) article.description = meta.description;

  return article;
}

// ---------- Validation ----------

export function validateJsonLd(
  obj: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!obj || typeof obj !== "object") {
    errors.push("Must be an object");
    return { valid: false, errors };
  }

  const data = obj as Record<string, unknown>;

  if (data["@context"] !== "https://schema.org") {
    errors.push('@context must be "https://schema.org"');
  }
  if (!data["@type"] || typeof data["@type"] !== "string") {
    errors.push("@type is required and must be a string");
  }

  // Type-specific checks
  const type = data["@type"] as string;
  if (
    ["Organization", "LocalBusiness", "WebSite"].includes(type) &&
    !data.name
  ) {
    errors.push(`${type} requires a "name" field`);
  }
  if (type === "FAQPage" && !Array.isArray(data.mainEntity)) {
    errors.push("FAQPage requires a mainEntity array");
  }
  if (type === "BreadcrumbList" && !Array.isArray(data.itemListElement)) {
    errors.push("BreadcrumbList requires an itemListElement array");
  }
  if (type === "Article" && !data.headline) {
    errors.push("Article requires a headline");
  }

  return { valid: errors.length === 0, errors };
}

/** Map schema type names to generator functions for auto-generation */
export const SCHEMA_TYPES = [
  "Organization",
  "WebSite",
  "LocalBusiness",
  "BreadcrumbList",
  "FAQPage",
  "AggregateRating",
  "Article",
] as const;

export type SchemaType = (typeof SCHEMA_TYPES)[number];

/** Generate a schema block given just a type and config */
export function autoGenerate(
  type: SchemaType,
  config: InjectionConfig
): object | null {
  switch (type) {
    case "Organization":
      return generateOrganization(config);
    case "WebSite":
      return generateWebSite(config);
    case "LocalBusiness":
      return generateLocalBusiness(config);
    case "BreadcrumbList":
      // Breadcrumb needs page info, generate a template
      return generateBreadcrumbList([
        { name: "Home", url: config.business_url || "/" },
      ]);
    case "FAQPage":
      // FAQ needs content, generate a template
      return generateFAQPage([
        {
          question: "What does your company do?",
          answer: config.business_description || "We provide professional services.",
        },
      ]);
    case "AggregateRating":
      // Rating needs data, generate a placeholder
      return generateAggregateRating(config, 4.8, 50);
    case "Article":
      return null; // Articles need per-page data, can't auto-generate
    default:
      return null;
  }
}
