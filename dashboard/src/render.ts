/**
 * Dashboard — HTML rendering helpers
 */

import { CSS } from "./styles";
import type { User } from "./types";

export function layout(title: string, body: string, user: User | null = null): string {
  const navLinks = user
    ? `
      <a href="/" class="nav-links-item${title === 'Dashboard' ? ' active' : ''}">Dashboard</a>
      <a href="/competitors" class="nav-links-item${title === 'Competitors' ? ' active' : ''}">Competitors</a>
      <a href="/roadmap" class="nav-links-item${title === 'Roadmap' ? ' active' : ''}">Roadmap</a>
      ${user.role === 'admin' ? '<a href="/admin" class="nav-links-item' + (title.startsWith('Admin') ? ' active' : '') + '">Admin</a>' : ''}
    `
    : '';

  const userInfo = user
    ? `<div class="user-info">
        <span>${user.email}</span>
        <a href="/logout">Sign out</a>
      </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>${esc(title)} — Never Ranked</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>${CSS}</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>

${user ? `<header class="topbar">
  <a href="/" class="mark">Never Ranked<sup>app</sup></a>
  <div class="nav-links">${navLinks}</div>
  ${userInfo}
</header>` : ''}

<main class="page">
${body}
</main>

</body>
</html>`;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

export function redirect(url: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}
