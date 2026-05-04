/**
 * NVI PDF rendering via Cloudflare Browser Rendering.
 *
 * Takes a report id, loads its context, renders the HTML template,
 * uses puppeteer (managed by Cloudflare's Browser Rendering API) to
 * convert to PDF, uploads to R2, returns the R2 key + signed URL.
 *
 * The template is exactly what /admin/nvi/preview/:id renders, so
 * what the customer gets in their inbox matches what we review in
 * the admin preview pixel-for-pixel.
 */
import puppeteer from "@cloudflare/puppeteer";
import type { Env } from "../types";
import { loadReportContext, buildNviReportHtml } from "./template";

export interface RenderedPdf {
  ok: boolean;
  reason?: string;
  r2Key?: string;
  bytes?: number;
}

export async function renderAndStoreNviPdf(
  env: Env,
  reportId: number,
): Promise<RenderedPdf> {
  if (!env.BROWSER) {
    return { ok: false, reason: "BROWSER binding not configured" };
  }
  if (!env.NVI_REPORTS) {
    return { ok: false, reason: "NVI_REPORTS R2 bucket binding not configured" };
  }

  const ctx = await loadReportContext(env, reportId);
  if (!ctx) return { ok: false, reason: `report ${reportId} not found` };

  const html = buildNviReportHtml(ctx);

  // Render
  const browser = await puppeteer.launch(env.BROWSER);
  let pdf: Uint8Array;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfRaw = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
    pdf = pdfRaw instanceof Uint8Array ? pdfRaw : new Uint8Array(pdfRaw as ArrayBuffer);
  } finally {
    await browser.close();
  }

  // Upload to R2
  const key = `${ctx.report.client_slug}/${ctx.report.reporting_period}.pdf`;
  await env.NVI_REPORTS.put(key, pdf, {
    httpMetadata: {
      contentType: "application/pdf",
      contentDisposition: `attachment; filename="nvi-${ctx.report.client_slug}-${ctx.report.reporting_period}.pdf"`,
    },
  });

  // Stamp the report row with the R2 key. Signed URL generation lives
  // in a separate route since R2 signed URL semantics depend on the
  // Cloudflare account-level access policy and we generate them at
  // delivery time, not at render time.
  await env.DB.prepare(
    "UPDATE nvi_reports SET pdf_r2_key = ? WHERE id = ?"
  ).bind(key, reportId).run();

  return { ok: true, r2Key: key, bytes: pdf.byteLength };
}

/** Fetch the rendered PDF from R2 for delivery or admin download.
 *  Returns the raw bytes plus content-type. */
export async function fetchNviPdf(
  env: Env,
  r2Key: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!env.NVI_REPORTS) return null;
  const obj = await env.NVI_REPORTS.get(r2Key);
  if (!obj) return null;
  return {
    bytes: await obj.arrayBuffer(),
    contentType: obj.httpMetadata?.contentType || "application/pdf",
  };
}
