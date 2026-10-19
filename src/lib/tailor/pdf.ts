import { chromium } from "playwright-core";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    // Montserrat comes from Google Fonts; without egress the font fetch can hang, so wait at most 3 s and fall back to Arial.
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]));
    return await page.pdf({ format: "A4", margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" }, printBackground: true });
  } finally {
    await browser.close();
  }
}
