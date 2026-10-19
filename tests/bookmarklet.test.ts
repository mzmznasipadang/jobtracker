import { describe, expect, it } from "vitest";
import { bookmarkletHref, splitPasted } from "@/lib/bookmarklet";

describe("bookmarkletHref", () => {
  const href = bookmarkletHref("https://tracking.naspadstudio.id");
  it("is a short javascript: URL with the handshake, the clipboard fallback and the origin", () => {
    expect(href.startsWith("javascript:")).toBe(true);
    for (const s of ["jobtracker-ready", "jobtracker-capture", "clipboard", "https://tracking.naspadstudio.id"]) expect(href).toContain(s);
    expect(href.length).toBeLessThan(2000);
  });
  it("normalises a trailing slash and is syntactically valid JS", () => {
    expect(bookmarkletHref("http://localhost:3000/")).toContain('"http://localhost:3000"');
    expect(() => new Function(href.slice("javascript:".length))).not.toThrow();
  });
});

describe("splitPasted", () => {
  it("takes the URL from the first line", () => {
    expect(splitPasted("https://x.com/job/1\n\nBody")).toEqual({ url: "https://x.com/job/1", text: "Body" });
  });
  it("leaves text without a leading URL alone", () => {
    expect(splitPasted("Just a description")).toEqual({ url: "", text: "Just a description" });
  });
});
