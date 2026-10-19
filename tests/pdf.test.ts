import { expect, it } from "vitest";
import { htmlToPdf } from "@/lib/tailor/pdf";

// Needs a local Chromium: npx playwright-core install chromium
it("renders HTML to a PDF buffer", async () => {
  const pdf = await htmlToPdf("<h1>Hi</h1>");
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
}, 60_000);

it("falls back instead of hanging when a linked stylesheet is unreachable", async () => {
  const t = Date.now();
  const pdf = await htmlToPdf('<link rel="stylesheet" href="http://10.255.255.1/x.css"><h1>Hi</h1>');
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(Date.now() - t).toBeLessThan(10_000);
}, 30_000);
