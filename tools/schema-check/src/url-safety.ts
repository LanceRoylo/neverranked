/**
 * SSRF guard for user-supplied scan targets.
 *
 * The grader fetches URLs a stranger types in, plus URLs extracted from those
 * pages (llms.txt links, agent-action endpoints), and reports whether they are
 * reachable. That is an SSRF surface and a reachability oracle. Cloudflare
 * Workers cannot reach RFC1918 / cloud-metadata addresses from the edge, so the
 * real exploitability is limited, but we refuse them anyway as defense in depth
 * and to stop the tool from being a fingerprint oracle for internal names.
 *
 * Returns true only for a plain http(s) URL whose host is a public name or a
 * public IP literal. Rejects other schemes, localhost, single-label and
 * special-use hostnames, and private/loopback/link-local/CGNAT IP literals.
 */
export function isPublicHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;

  // Special-use / internal names, and single-label hosts (no dot -> not public).
  if (
    host === "localhost" ||
    host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa") ||
    !host.includes(".")
  ) {
    // (an IPv6 literal has ':' not '.', handled below before this can misfire)
    if (!host.includes(":")) return false;
  }

  // IPv6 literal (URL strips the surrounding []): block loopback / ULA / link-local.
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || h === "::" || h === "::ffff:127.0.0.1") return false;
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return false;
    return true;
  }

  // IPv4 literal: block private / loopback / link-local (+metadata) / CGNAT / this-host.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const oct = m.slice(1).map(Number);
    if (oct.some((n) => n > 255)) return false;
    const [a, b] = oct;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // link-local incl. 169.254.169.254 metadata
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast / reserved
    return true;
  }

  return true; // ordinary public hostname
}
