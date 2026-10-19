import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_CHARS = 60_000;

// JobPosting may be top-level, in an array, or inside @graph.
function jobPostings(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(jobPostings);
  if (typeof node !== "object" || node === null) return [];
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  const self: unknown[] = t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting")) ? [o] : [];
  return self.concat(jobPostings(o["@graph"]));
}

export async function fetchJobText(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  let html: string;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  const $ = cheerio.load(html);
  const ld: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      for (const p of jobPostings(JSON.parse($(el).text()))) ld.push(JSON.stringify(p));
    } catch { /* malformed JSON-LD is common; the visible text still works */ }
  });
  $("script,style,nav,footer,header,noscript,svg").remove();
  const text = [...ld, $.root().text()].join("\n").replace(/\s+/g, " ").trim();
  if (text.length < 500) return { ok: false, reason: "too little text" };
  return { ok: true, text: text.slice(0, MAX_CHARS) };
}
