// Base HTML shell. Every authed page wraps its body in layout().

import { esc, raw, trust } from "../render";
import type { SafeString } from "../render";
import { CSS } from "../styles";

export type NavKey = "home" | "clients" | "intake" | "login";

export interface LayoutOpts {
  title: string;
  nav?: NavKey;
  body: string; // trusted html
  flash?: { kind: "ok" | "error"; text: string } | null;
}

export function layout(opts: LayoutOpts): string {
  const nav = opts.nav ?? "home";
  const flashHtml =
    opts.flash
      ? `<div class="flash ${opts.flash.kind === "ok" ? "ok" : ""}">${esc(opts.flash.text)}</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(opts.title)} — Never Ranked Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=DM+Mono:wght@300;400;500&family=Barlow+Condensed:wght@300;400;500&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
<div class="shell">
  <header class="topbar">
    <a class="brand" href="/">Never Ranked<sup>©</sup></a>
    <nav>
      <a href="/" class="${nav === "home" ? "active" : ""}">Dashboard</a>
      <a href="/clients" class="${nav === "clients" ? "active" : ""}">Clients</a>
      <a href="/intake" class="${nav === "intake" ? "active" : ""}">Intake</a>
    </nav>
    <div class="session">
      § Signed in
      <a href="/logout">Logout →</a>
    </div>
  </header>
  <main class="main">
    ${flashHtml}
    ${opts.body}
  </main>
  <footer class="footer">
    <span>§ Never Ranked Ops</span>
    <span>Internal — Do not share</span>
  </footer>
</div>
</body>
</html>`;
}

export function loginLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(title)} — Never Ranked Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=DM+Mono:wght@300;400;500&family=Barlow+Condensed:wght@300;400;500&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
<div class="login-screen">
${body}
</div>
</body>
</html>`;
}
