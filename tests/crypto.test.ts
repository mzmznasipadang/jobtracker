import { expect, test } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

test("encrypt/decrypt round-trip", () => {
  const t = encrypt("hello ✓");
  expect(t.split(".")).toHaveLength(3);
  expect(decrypt(t)).toBe("hello ✓");
});

test("decrypt throws on tamper", () => {
  const [iv, tag, c] = encrypt("secret").split(".");
  const flipped = (c[0] === "A" ? "B" : "A") + c.slice(1);
  expect(() => decrypt([iv, tag, flipped].join("."))).toThrow();
  expect(() => decrypt("garbage")).toThrow();
});
