// POST /api/intake — public endpoint, CORS-restricted to neverranked.com
// Consumes JSON or form-encoded bodies. Honeypot field: "company_website" (bots fill, humans don't).

import type { Env } from "../types";
import { json } from "../render";
import { insertIntake } from "../db";

const ALLOWED_ORIGINS = new Set([
  "https://neverranked.com",
  "https://www.neverranked.com",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return {};
}

export async function handleApiIntake(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: cors });
  }

  // Optional origin check — if the request came from a browser, require an allowlisted Origin.
  // Server-to-server calls (no Origin header) are permitted so curl/scripts can still test.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origin not allowed" }, { status: 403 });
  }

  let name = "";
  let email = "";
  let domain = "";
  let goals = "";
  let honeypot = "";

  const contentType = request.headers.get("Content-Type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const data = (await request.json()) as Record<string, unknown>;
      name = String(data.name ?? "").trim();
      email = String(data.email ?? "").trim();
      domain = String(data.domain ?? "").trim();
      goals = String(data.goals ?? "").trim();
      honeypot = String(data.company_website ?? "").trim();
    } else {
      const fd = await request.formData();
      name = String(fd.get("name") ?? "").trim();
      email = String(fd.get("email") ?? "").trim();
      domain = String(fd.get("domain") ?? "").trim();
      goals = String(fd.get("goals") ?? "").trim();
      honeypot = String(fd.get("company_website") ?? "").trim();
    }
  } catch {
    return json({ error: "Malformed body" }, { status: 400, headers: cors });
  }

  // Honeypot tripped → silently "succeed" without inserting
  if (honeypot) {
    return json({ ok: true }, { headers: cors });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Valid email required" }, { status: 400, headers: cors });
  }
  if (!domain) {
    return json({ error: "Domain required" }, { status: 400, headers: cors });
  }

  // Normalize domain: strip protocol + path
  domain = domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  if (email.length > 200 || domain.length > 200 || goals.length > 4000 || name.length > 200) {
    return json({ error: "Field too long" }, { status: 400, headers: cors });
  }

  await insertIntake(env.DB, {
    name: name || null,
    email,
    domain,
    goals: goals || null,
    source: "marketing-site-form",
  });

  return json({ ok: true }, { headers: cors });
}
