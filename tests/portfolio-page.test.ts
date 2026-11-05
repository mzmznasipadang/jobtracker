import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it } from "vitest";
import PublicResults from "@/app/page";
import { getOwnerAccount } from "@/lib/accounts";
import { resetDb } from "@/lib/db";
import { saveSettings } from "@/lib/settings";

beforeEach(() => resetDb());

it("shows the owner's current portfolio only while the public page is enabled", () => {
  const account = getOwnerAccount();
  expect(renderToStaticMarkup(PublicResults())).not.toContain("View portfolio");
  saveSettings(account, { profile: { portfolioUrl: "https://portfolio.example/work" } });
  expect(renderToStaticMarkup(PublicResults())).toContain('href="https://portfolio.example/work"');
  saveSettings(account, { profile: { portfolioUrl: "https://updated.example" } });
  const updated = renderToStaticMarkup(PublicResults());
  expect(updated).toContain('href="https://updated.example"');
  expect(updated).not.toContain("https://portfolio.example/work");
  saveSettings(account, { publicPageEnabled: false });
  expect(renderToStaticMarkup(PublicResults())).not.toContain("https://updated.example");
  saveSettings(account, { publicPageEnabled: true, profile: { portfolioUrl: "" } });
  expect(renderToStaticMarkup(PublicResults())).not.toContain("View portfolio");
});
