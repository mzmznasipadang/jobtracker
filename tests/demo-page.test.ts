import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/db", () => { throw new Error("Demo must not load account data"); });
vi.mock("@/lib/auth", () => { throw new Error("Demo must not require sign-in"); });
import DemoPage from "@/app/demo/page";

it.each(["overview", "draft", "results"])("renders the public %s demo with disclosure and beta link", async (view) => {
  const html = renderToStaticMarkup(await DemoPage({ searchParams: Promise.resolve({ view }) }));
  expect(html).toContain("Demo data · For illustration");
  expect(html).toContain('href="/beta"');
  expect(html).toContain('aria-current="page"');
  expect(html).not.toContain("<form");
  if (view === "overview") expect(html).toContain("Northstar Labs");
  if (view === "draft") expect(html).toContain("Alex Morgan");
  if (view === "results") {
    expect(html).toContain("40%");
    expect(html).toContain("30");
    expect(html).toContain("Not actual user outcomes");
  }
});
it("falls back to overview for an unknown view", async () => {
  const html = renderToStaticMarkup(await DemoPage({ searchParams: Promise.resolve({ view: "invalid" }) }));
  expect(html).toContain("Needs action");
});
