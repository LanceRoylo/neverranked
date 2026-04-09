#!/usr/bin/env python3
"""
Never Ranked audit runner.

Fetches a site's homepage, robots.txt, and sitemap.xml, samples representative
pages, and extracts technical signals. Outputs a structured JSON report and
writes raw HTML files to the output directory.

Usage:
    python3 scripts/run-audit.py https://example.com --out audits/example/raw/

Requirements: Python 3.9+, no external packages (uses stdlib only).
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.parse
import urllib.error
from html.parser import HTMLParser
from pathlib import Path
from datetime import datetime
from collections import Counter


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0 Safari/537.36 NeverRanked-Audit/1.0"
)

TIMEOUT_SECONDS = 20
MAX_SAMPLE_PAGES = 10


# ---------- fetching ----------

class _PermanentRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Teach urllib about HTTP 308 (Permanent Redirect) — not supported by default."""
    def http_error_308(self, req, fp, code, msg, headers):
        return self.http_error_301(req, fp, code, msg, headers)


_opener = urllib.request.build_opener(_PermanentRedirectHandler())
urllib.request.install_opener(_opener)


def fetch(url: str, timeout: int = TIMEOUT_SECONDS, max_redirects: int = 5) -> tuple[str, dict]:
    """Fetch a URL and return (body_text, headers_dict). Returns ('', {}) on failure.

    Follows 301/302/303/307/308 redirects automatically.
    """
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            headers = dict(resp.headers)
            body = resp.read().decode("utf-8", errors="replace")
            return body, headers
    except urllib.error.HTTPError as e:
        print(f"  [fetch error] {url}: HTTP {e.code} {e.reason}", file=sys.stderr)
        return "", {}
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  [fetch error] {url}: {e}", file=sys.stderr)
        return "", {}


def save(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ---------- sitemap parsing ----------

def parse_sitemap(xml: str) -> list[str]:
    """Extract all <loc> entries from a sitemap, including nested sitemap indexes."""
    urls = re.findall(r"<loc>([^<]+)</loc>", xml)
    return [u.strip() for u in urls]


def pick_sample_pages(all_urls: list[str], max_count: int = MAX_SAMPLE_PAGES) -> list[str]:
    """Pick a diverse sample of pages from the sitemap, covering different URL patterns."""
    # Bucket by path depth + first segment
    buckets: dict[str, list[str]] = {}
    for url in all_urls:
        parsed = urllib.parse.urlparse(url)
        path = parsed.path.strip("/")
        if not path:
            key = "_root"
        else:
            first = path.split("/")[0]
            key = first
        buckets.setdefault(key, []).append(url)

    # Sample evenly from each bucket
    sample: list[str] = []
    bucket_keys = sorted(buckets.keys())
    # Prefer root first
    if "_root" in bucket_keys:
        sample.append(buckets["_root"][0])
        bucket_keys.remove("_root")

    per_bucket = max(1, (max_count - len(sample)) // max(1, len(bucket_keys)))

    for key in bucket_keys:
        for url in buckets[key][:per_bucket]:
            if len(sample) >= max_count:
                break
            sample.append(url)
        if len(sample) >= max_count:
            break

    return sample


# ---------- HTML signal extraction ----------

def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def word_count(html: str) -> int:
    text = strip_html(html)
    return len(re.findall(r"\b\w+\b", text))


def extract_meta(html: str) -> dict:
    """Extract a wide range of technical signals from an HTML page."""
    out: dict = {}

    # Title
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    out["title"] = (m.group(1).strip() if m else None)
    out["title_len"] = len(out["title"]) if out["title"] else 0

    # Meta description (two possible attribute orderings)
    m = re.search(
        r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', html, re.I | re.S
    )
    if not m:
        m = re.search(
            r'<meta\s+content=["\'](.*?)["\']\s+name=["\']description["\']',
            html, re.I | re.S,
        )
    out["meta_desc"] = m.group(1).strip() if m else None
    out["meta_desc_len"] = len(out["meta_desc"]) if out["meta_desc"] else 0

    # Canonical
    m = re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\'](.*?)["\']', html, re.I)
    out["canonical"] = m.group(1) if m else None

    # Robots meta
    m = re.search(r'<meta\s+name=["\']robots["\']\s+content=["\'](.*?)["\']', html, re.I)
    out["robots_meta"] = m.group(1) if m else None

    # OG tags
    out["og_title"] = bool(re.search(r'property=["\']og:title["\']', html, re.I))
    out["og_description"] = bool(re.search(r'property=["\']og:description["\']', html, re.I))
    out["og_image"] = bool(re.search(r'property=["\']og:image["\']', html, re.I))
    out["og_type"] = bool(re.search(r'property=["\']og:type["\']', html, re.I))

    # Twitter cards
    out["twitter_card"] = bool(re.search(r'name=["\']twitter:card["\']', html, re.I))
    out["twitter_image"] = bool(re.search(r'name=["\']twitter:image["\']', html, re.I))

    # Headings
    out["h1_count"] = len(re.findall(r"<h1[\s>]", html, re.I))
    out["h2_count"] = len(re.findall(r"<h2[\s>]", html, re.I))
    out["h3_count"] = len(re.findall(r"<h3[\s>]", html, re.I))
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    if m:
        txt = re.sub(r"<[^>]+>", "", m.group(1))
        out["h1_first"] = re.sub(r"\s+", " ", txt).strip()[:160]
    else:
        out["h1_first"] = None

    # Schema extraction
    schemas = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.I | re.S,
    )
    schema_types: list[str] = []
    schema_parse_errors = 0
    for s in schemas:
        try:
            data = json.loads(s.strip())
        except json.JSONDecodeError:
            schema_parse_errors += 1
            continue
        _collect_schema_types(data, schema_types)
    out["jsonld_block_count"] = len(schemas)
    out["jsonld_parse_errors"] = schema_parse_errors
    out["schema_types"] = schema_types

    # Images + alt text
    imgs = re.findall(r"<img\s+([^>]*?)>", html, re.I)
    out["img_count"] = len(imgs)
    out["img_no_alt"] = sum(1 for i in imgs if not re.search(r"\balt\s*=", i))

    # Links (internal vs external)
    links = re.findall(r'href=["\']([^"\']+)["\']', html, re.I)
    host_from_canonical = None
    if out["canonical"]:
        parsed = urllib.parse.urlparse(out["canonical"])
        host_from_canonical = parsed.netloc
    internal = 0
    external = 0
    for l in links:
        if l.startswith("#") or l.startswith("mailto:") or l.startswith("tel:") or l.startswith("javascript:"):
            continue
        if l.startswith("/"):
            internal += 1
        elif l.startswith("http"):
            parsed = urllib.parse.urlparse(l)
            if host_from_canonical and parsed.netloc == host_from_canonical:
                internal += 1
            else:
                external += 1
        else:
            internal += 1
    out["links_internal"] = internal
    out["links_external"] = external

    # Word count (rough, tag-stripped)
    out["word_count"] = word_count(html)

    # Basic trust/social-proof signals
    out["has_rating_text"] = bool(re.search(r"(\d[\.,]?\d?)\s*(?:stars?|/\s*5|out of 5)", html, re.I))
    out["has_testimonial_text"] = bool(
        re.search(r"testimonial|review|trusted by|\d{1,3}[,.]?\d{3}\+?\s*(?:agents|users|customers|listings|clients)", html, re.I)
    )

    return out


def _collect_schema_types(data, bucket: list[str]) -> None:
    """Recursively collect @type values from a parsed JSON-LD block."""
    if isinstance(data, list):
        for item in data:
            _collect_schema_types(item, bucket)
        return
    if not isinstance(data, dict):
        return
    t = data.get("@type")
    if t:
        if isinstance(t, list):
            bucket.extend(str(x) for x in t)
        else:
            bucket.append(str(t))
    graph = data.get("@graph")
    if isinstance(graph, list):
        for item in graph:
            _collect_schema_types(item, bucket)


# ---------- analysis ----------

def summarize(pages: dict[str, dict]) -> dict:
    """Build a summary object from per-page signals."""
    total_pages = len(pages)
    if total_pages == 0:
        return {"error": "No pages fetched"}

    # Canonical coverage
    pages_with_canonical = sum(1 for p in pages.values() if p.get("canonical"))
    # OG image coverage
    pages_with_og_image = sum(1 for p in pages.values() if p.get("og_image"))
    # Schema coverage
    pages_with_any_schema = sum(1 for p in pages.values() if p.get("jsonld_block_count", 0) > 0)
    # Schema type frequency across all pages
    all_schema_types: Counter = Counter()
    for p in pages.values():
        for t in p.get("schema_types", []):
            all_schema_types[t] += 1

    # H1 sanity
    pages_with_one_h1 = sum(1 for p in pages.values() if p.get("h1_count") == 1)
    pages_with_no_h1 = sum(1 for p in pages.values() if p.get("h1_count", 0) == 0)
    pages_with_multiple_h1 = sum(1 for p in pages.values() if p.get("h1_count", 0) > 1)

    # Title length distribution
    titles = [p.get("title_len", 0) for p in pages.values() if p.get("title_len")]
    title_too_short = sum(1 for t in titles if t < 30)
    title_in_range = sum(1 for t in titles if 30 <= t <= 65)
    title_too_long = sum(1 for t in titles if t > 65)

    # Meta description distribution
    metas = [p.get("meta_desc_len", 0) for p in pages.values() if p.get("meta_desc_len")]
    meta_too_short = sum(1 for m in metas if m < 80)
    meta_in_range = sum(1 for m in metas if 80 <= m <= 160)
    meta_too_long = sum(1 for m in metas if m > 160)

    # Images without alt
    total_imgs = sum(p.get("img_count", 0) for p in pages.values())
    total_no_alt = sum(p.get("img_no_alt", 0) for p in pages.values())

    # External link density (AEO trust signal)
    total_external_links = sum(p.get("links_external", 0) for p in pages.values())
    avg_external_per_page = round(total_external_links / total_pages, 2) if total_pages else 0

    # Word count distribution
    words = [p.get("word_count", 0) for p in pages.values()]
    thin_pages = sum(1 for w in words if w < 300)

    return {
        "total_pages_sampled": total_pages,
        "pages_with_canonical": pages_with_canonical,
        "pages_with_canonical_pct": round(100 * pages_with_canonical / total_pages, 1),
        "pages_with_og_image": pages_with_og_image,
        "pages_with_og_image_pct": round(100 * pages_with_og_image / total_pages, 1),
        "pages_with_any_schema": pages_with_any_schema,
        "pages_with_any_schema_pct": round(100 * pages_with_any_schema / total_pages, 1),
        "schema_type_frequency": dict(all_schema_types.most_common()),
        "h1_structure": {
            "one_h1": pages_with_one_h1,
            "no_h1": pages_with_no_h1,
            "multiple_h1": pages_with_multiple_h1,
        },
        "title_length": {
            "too_short_under_30": title_too_short,
            "in_range_30_65": title_in_range,
            "too_long_over_65": title_too_long,
        },
        "meta_desc_length": {
            "too_short_under_80": meta_too_short,
            "in_range_80_160": meta_in_range,
            "too_long_over_160": meta_too_long,
        },
        "images": {
            "total": total_imgs,
            "without_alt": total_no_alt,
        },
        "external_links_per_page_avg": avg_external_per_page,
        "thin_pages_under_300_words": thin_pages,
    }


def red_flags(summary: dict, pages: dict[str, dict]) -> list[str]:
    """Produce a human-readable list of the most notable findings."""
    flags: list[str] = []
    total = summary.get("total_pages_sampled", 0)

    pct_canonical = summary.get("pages_with_canonical_pct", 0)
    if pct_canonical < 100:
        flags.append(
            f"Canonical tags missing on {total - summary['pages_with_canonical']} of {total} sampled pages ({100 - pct_canonical}%)"
        )

    pct_og = summary.get("pages_with_og_image_pct", 0)
    if pct_og < 100:
        flags.append(
            f"og:image missing on {total - summary['pages_with_og_image']} of {total} sampled pages ({100 - pct_og}%)"
        )

    freq = summary.get("schema_type_frequency", {})
    if "Organization" not in freq:
        flags.append("No Organization schema detected on any sampled page — critical for entity recognition")
    if "WebSite" not in freq:
        flags.append("No WebSite schema detected — SearchAction rich results are disabled")
    if "BreadcrumbList" not in freq:
        flags.append("No BreadcrumbList schema detected — rich result breadcrumbs are disabled")
    if "AggregateRating" not in freq:
        flags.append("No AggregateRating detected — AI engines have no social proof hook to cite")

    if summary.get("h1_structure", {}).get("no_h1", 0) > 0:
        flags.append(f"{summary['h1_structure']['no_h1']} pages have no H1")
    if summary.get("h1_structure", {}).get("multiple_h1", 0) > 0:
        flags.append(f"{summary['h1_structure']['multiple_h1']} pages have multiple H1s")

    if summary.get("title_length", {}).get("too_short_under_30", 0) > 0:
        flags.append(
            f"{summary['title_length']['too_short_under_30']} pages have title tags under 30 characters"
        )
    if summary.get("title_length", {}).get("too_long_over_65", 0) > 0:
        flags.append(
            f"{summary['title_length']['too_long_over_65']} pages have title tags over 65 characters"
        )

    if summary.get("meta_desc_length", {}).get("too_long_over_160", 0) > 0:
        flags.append(
            f"{summary['meta_desc_length']['too_long_over_160']} pages have meta descriptions over 160 characters (will truncate)"
        )
    if summary.get("meta_desc_length", {}).get("too_short_under_80", 0) > 0:
        flags.append(
            f"{summary['meta_desc_length']['too_short_under_80']} pages have meta descriptions under 80 characters (thin)"
        )

    if summary.get("external_links_per_page_avg", 0) < 2:
        flags.append(
            f"Average external links per page is {summary['external_links_per_page_avg']} — AEO authority signal is weak"
        )

    if summary.get("thin_pages_under_300_words", 0) > 0:
        flags.append(f"{summary['thin_pages_under_300_words']} pages have under 300 words (thin content)")

    imgs_no_alt = summary.get("images", {}).get("without_alt", 0)
    total_imgs = summary.get("images", {}).get("total", 0)
    if total_imgs > 0 and imgs_no_alt > 0:
        flags.append(f"{imgs_no_alt} of {total_imgs} images are missing alt text")

    return flags


# ---------- main ----------

def main():
    parser = argparse.ArgumentParser(description="Never Ranked audit runner")
    parser.add_argument("url", help="Target site URL (e.g. https://example.com)")
    parser.add_argument("--out", default="./raw", help="Output directory (default: ./raw)")
    parser.add_argument("--max", type=int, default=MAX_SAMPLE_PAGES, help="Max sample pages")
    args = parser.parse_args()

    base = args.url.rstrip("/")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Never Ranked audit runner")
    print(f"Target: {base}")
    print(f"Output: {out_dir}")
    print()

    # 1. Homepage
    print("[1/4] Fetching homepage...")
    home_html, home_headers = fetch(base)
    if not home_html:
        print("ERROR: Could not fetch homepage. Aborting.", file=sys.stderr)
        sys.exit(1)
    save(out_dir / "home.html", home_html)
    save(out_dir / "home.headers.json", json.dumps(home_headers, indent=2, default=str))
    print(f"  saved {len(home_html):,} bytes")

    # 2. robots.txt
    print("[2/4] Fetching robots.txt...")
    robots_text, _ = fetch(f"{base}/robots.txt")
    if robots_text:
        save(out_dir / "robots.txt", robots_text)
        print(f"  saved {len(robots_text):,} bytes")
    else:
        print("  (no robots.txt or fetch failed)")

    # 3. sitemap.xml
    print("[3/4] Fetching sitemap.xml...")
    sitemap_text, _ = fetch(f"{base}/sitemap.xml")
    all_urls: list[str] = []
    if sitemap_text:
        save(out_dir / "sitemap.xml", sitemap_text)
        all_urls = parse_sitemap(sitemap_text)
        print(f"  saved, found {len(all_urls)} URLs")
        # If it's a sitemap index, follow the children
        if all_urls and any(u.endswith(".xml") for u in all_urls[:5]):
            expanded: list[str] = []
            for child in all_urls[:5]:
                child_text, _ = fetch(child)
                if child_text:
                    expanded.extend(parse_sitemap(child_text))
            if expanded:
                all_urls = expanded
                print(f"  expanded from sitemap index: {len(all_urls)} URLs")
    else:
        print("  (no sitemap.xml or fetch failed)")

    # 4. Sample pages
    sample_urls = [base]
    if all_urls:
        picked = pick_sample_pages([u for u in all_urls if u != base and u != base + "/"], args.max - 1)
        sample_urls.extend(picked)
    print(f"[4/4] Fetching {len(sample_urls)} sample pages...")

    pages: dict[str, dict] = {}
    for url in sample_urls:
        print(f"  {url}")
        html, _ = fetch(url)
        if not html:
            continue
        # Safe filename
        fname = url.replace(base, "").strip("/")
        if not fname:
            fname = "home"
        fname = re.sub(r"[^a-zA-Z0-9._-]+", "_", fname) + ".html"
        save(out_dir / fname, html)

        signals = extract_meta(html)
        signals["url"] = url
        signals["file"] = fname
        signals["html_bytes"] = len(html)
        pages[url] = signals

    # 5. Analysis
    print()
    print("Analyzing signals...")
    summary = summarize(pages)
    flags = red_flags(summary, pages)

    report = {
        "audit_timestamp": datetime.utcnow().isoformat() + "Z",
        "target": base,
        "pages_sampled": len(pages),
        "summary": summary,
        "red_flags": flags,
        "pages": pages,
    }

    report_path = out_dir / "intake-report.json"
    save(report_path, json.dumps(report, indent=2, default=str))

    print()
    print("=" * 60)
    print(f"AUDIT COMPLETE: {report_path}")
    print("=" * 60)
    print()
    print(f"Pages sampled:    {len(pages)}")
    print(f"Canonical coverage: {summary.get('pages_with_canonical_pct', 0)}%")
    print(f"og:image coverage:  {summary.get('pages_with_og_image_pct', 0)}%")
    print(f"Any schema:         {summary.get('pages_with_any_schema_pct', 0)}%")
    print()
    print(f"Red flags found:  {len(flags)}")
    for f in flags:
        print(f"  - {f}")
    print()


if __name__ == "__main__":
    main()
