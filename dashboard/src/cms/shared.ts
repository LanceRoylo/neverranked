/**
 * Shared utilities used by every CMS driver:
 *   - AES-GCM helpers (same crypto used by the legacy wordpress.ts)
 *   - A minimal Markdown-to-HTML conversion that fits our content
 *     pipeline (headings, bold/italic, links, paragraphs).
 *
 * Drivers import these instead of reimplementing. Keeping the crypto
 * here means we keep one key material path (WP_ENCRYPTION_KEY) and
 * one key-rotation story.
 */
import type { Env } from "../types";

// ---------- AES-GCM ----------

async function deriveKey(env: Env): Promise<CryptoKey> {
  const hex = env.WP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("WP_ENCRYPTION_KEY must be set as a 32-byte hex string (64 chars)");
  }
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, env: Env): Promise<string> {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  let binary = "";
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

export async function decryptSecret(blob: string, env: Env): Promise<string> {
  const key = await deriveKey(env);
  const binary = atob(blob);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

// ---------- Markdown ----------

/**
 * Markdown-ish to HTML, narrowed to what our voice engine actually
 * generates. Headings, bold, italic, links, paragraphs. No tables,
 * no images, no code blocks -- those would need real parsing and we
 * don't ship them today.
 *
 * Each driver decides whether to use this output or pre-process it
 * further (e.g. WordPress block editor wants HTML; Webflow's rich
 * text field wants HTML too; Shopify's article body_html is HTML).
 */
export function sharedMarkdownToHtml(md: string): string {
  let html = md.trim();
  html = html.replace(/\r\n?/g, "\n");
  html = html.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
             .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
             .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
             .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
             .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
             .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
             .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
             .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.split(/\n{2,}/).map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (/^<(h\d|ul|ol|li|blockquote|pre|p|div)/i.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n\n");
  return html;
}

/** Slug helper used by drivers that need one (Webflow, etc.). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
