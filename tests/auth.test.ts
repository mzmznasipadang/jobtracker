import { expect, it } from "vitest";
import { safeNext } from "@/lib/auth";
it("only returns local /app destinations", () => {
  for (const value of [null, "//evil.com", "https://evil.com", "/settings", "/apple", "/app\\evil", "/app\r\nLocation: x"]) expect(safeNext(value)).toBe("/app");
  expect(safeNext("/app/new?via=bm")).toBe("/app/new?via=bm");
  expect(safeNext("/app?next=x")).toBe("/app?next=x");
});
