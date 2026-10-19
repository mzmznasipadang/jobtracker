import { describe, expect, it } from "vitest";
import { fetchJobText } from "@/lib/capture/fetch";

const page = (html: string, status = 200) => (async () => new Response(html, { status })) as typeof fetch;

describe("fetchJobText", () => {
  it("reports non-2xx", async () => {
    expect(await fetchJobText("https://x.test/j", page("no", 403))).toEqual({ ok: false, reason: "HTTP 403" });
  });

  it("strips script/nav content and keeps body text", async () => {
    const body = "Build great things with us. ".repeat(25);
    const r = await fetchJobText("https://x.test/j", page(`<html><head><style>.a{}</style></head><body><nav>MENUJUNK</nav><script>var secret=1</script><main>${body}</main></body></html>`));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Build great things");
      expect(r.text).not.toMatch(/secret|MENUJUNK/);
    }
  });

  it("prepends JobPosting JSON-LD", async () => {
    const ld = JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "JobPosting", title: "LDTITLE" }] });
    const r = await fetchJobText("https://x.test/j", page(`<script type="application/ld+json">${ld}</script><body>${"word ".repeat(150)}</body>`));
    expect(r.ok && r.text.startsWith("{")).toBe(true);
    expect(r.ok && r.text).toContain("LDTITLE");
  });

  it("rejects short pages and caps long ones", async () => {
    expect(await fetchJobText("https://x.test/j", page("<body>" + "a".repeat(100) + "</body>"))).toEqual({ ok: false, reason: "too little text" });
    const r = await fetchJobText("https://x.test/j", page("<body>" + "abc ".repeat(40000) + "</body>"));
    expect(r.ok && r.text.length).toBe(60000);
  });

  it("turns network errors into a reason", async () => {
    const r = await fetchJobText("https://x.test/j", (async () => { throw new Error("boom"); }) as typeof fetch);
    expect(r).toEqual({ ok: false, reason: "boom" });
  });
});
