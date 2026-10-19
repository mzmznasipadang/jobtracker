import { expect, it } from "vitest";
import { htmlToPdf } from "@/lib/tailor/pdf";

// Needs a local Chromium: npx playwright-core install chromium
it("renders HTML to a PDF buffer", async () => {
  const pdf = await htmlToPdf("<h1>Hi</h1>");
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
}, 60_000);
