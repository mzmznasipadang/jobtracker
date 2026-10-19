import { chromium } from "playwright-core";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    // Montserrat comes from Google Fonts. Wait for the stylesheet links, then the fonts, within one 3 s budget
    // so a host without egress falls back to Arial instead of hanging.
    await page.evaluate(async () => {
      const budget = new Promise((r) => setTimeout(r, 3000));
      const sheets = [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].map((l) =>
        l.sheet ? null : new Promise((r) => { l.onload = l.onerror = r; }));
      await Promise.race([Promise.all(sheets), budget]);
      void document.body.offsetHeight; // layout starts the font downloads the sheets declare
      await Promise.race([document.fonts.ready, budget]);
    });
    return await page.pdf({ format: "A4", margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" }, printBackground: true });
  } finally {
    await browser.close();
  }
}
