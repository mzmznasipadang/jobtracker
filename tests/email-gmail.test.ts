import { getOwnerAccount } from "@/lib/accounts";
import { OAuth2Client } from "google-auth-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { authUrl, exchangeCode } from "@/lib/email/gmail";
import { getKv, setKv } from "@/lib/settings";

beforeEach(() => {
  resetDb();
  vi.restoreAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("APP_URL", "https://tracking.example.id");
});

describe("authUrl", () => {
  it("asks for offline access, consent, both scopes, the callback URI and the state", () => {
    const u = new URL(authUrl("st4te"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: "cid",
      redirect_uri: "https://tracking.example.id/api/gmail/callback",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state: "st4te",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
    });
  });
});

describe("exchangeCode", () => {
  const tokens = (t: object) => vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({ tokens: t, res: null } as never);

  it("stores the refresh token encrypted and clears the error", async () => {
    setKv(getOwnerAccount(), "gmailError", "old");
    tokens({ refresh_token: "r-token", access_token: "a" });
    await exchangeCode(getOwnerAccount(), "code");
    expect(decrypt(getKv<string>(getOwnerAccount(), "gmailToken")!)).toBe("r-token");
    expect(getKv(getOwnerAccount(), "gmailError")).toBeNull();
  });

  it("stores nothing and explains when Google returns no refresh token", async () => {
    tokens({ access_token: "a" });
    await exchangeCode(getOwnerAccount(), "code");
    expect(getKv(getOwnerAccount(), "gmailToken")).toBeNull();
    expect(getKv(getOwnerAccount(), "gmailError")).toMatch(/did not return a refresh token/);
  });
});
