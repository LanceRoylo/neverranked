// HTML rendering helpers. Plain template literals, explicit escaping.

export function esc(x: unknown): string {
  if (x === null || x === undefined) return "";
  return String(x)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tagged-template helper: `html`...`` returns an already-escaped string.
 * Interpolations are escaped unless wrapped in `raw()`.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v instanceof SafeString) {
        out += v.value;
      } else if (Array.isArray(v)) {
        out += v
          .map((item) => (item instanceof SafeString ? item.value : esc(item)))
          .join("");
      } else {
        out += esc(v);
      }
    }
  }
  return out;
}

export class SafeString {
  constructor(public value: string) {}
}

/** Mark a string as already-safe HTML (skips escaping). */
export function raw(s: string): SafeString {
  return new SafeString(s);
}

/** Turn an already-built html() string back into a SafeString for composition. */
export function trust(s: string): SafeString {
  return new SafeString(s);
}

export function page(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...(init.headers ?? {}),
    },
  });
}

export function redirect(location: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...extraHeaders,
    },
  });
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Minimal, safe markdown-ish renderer for client notes.
 * Handles: headings (# / ## / ###), bold (**x**), italic (*x*), inline code (`x`),
 * unordered lists (- x), links ([text](url)), paragraph breaks. Escapes everything else.
 * Not a full markdown parser — intentionally small and auditable.
 */
export function renderNotes(md: string | null | undefined): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${inline(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === "") {
      flushPara();
      closeList();
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    const li = /^-\s+(.*)$/.exec(line);
    if (h1) {
      flushPara();
      closeList();
      out.push(`<h3>${inline(h1[1])}</h3>`);
    } else if (h2) {
      flushPara();
      closeList();
      out.push(`<h4>${inline(h2[1])}</h4>`);
    } else if (h3) {
      flushPara();
      closeList();
      out.push(`<h5>${inline(h3[1])}</h5>`);
    } else if (li) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
    } else {
      closeList();
      paraBuf.push(line);
    }
  }
  flushPara();
  closeList();
  return out.join("\n");
}

function inline(s: string): string {
  // Escape first, then apply inline patterns.
  let t = esc(s);
  // Inline code
  t = t.replace(/`([^`]+)`/g, (_m, g1) => `<code>${g1}</code>`);
  // Bold
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m, g1) => `<strong>${g1}</strong>`);
  // Italic (single star, not already consumed by bold)
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, (_m, pre, g1) => `${pre}<em>${g1}</em>`);
  // Links [text](url) — url must be http(s) or mailto or relative path
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*)\)/g,
    (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`,
  );
  return t;
}
