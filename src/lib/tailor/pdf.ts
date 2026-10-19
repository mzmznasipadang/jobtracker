import { chromium } from "playwright-core";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready); // Montserrat comes from Google Fonts; Arial if that fails
    return await page.pdf({ format: "A4", margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" }, printBackground: true });
  } finally {
    await browser.close();
  }
}
