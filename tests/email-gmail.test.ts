import { getOwnerAccount } from "@/lib/accounts";
import { OAuth2Client } from "google-auth-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { authUrl, exchangeCode, disconnectGmail } from "@/lib/email/gmail";
import { getKv, setKv } from "@/lib/settings";

const profile = vi.hoisted(() => vi.fn());
vi.mock("@googleapis/gmail", () => ({ gmail: () => ({ users: { getProfile: profile } }) }));

beforeEach(() => {
  profile.mockResolvedValue({ data: { emailAddress: "mailbox@gmail.com" } });
  resetDb();
  vi.restoreAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("APP_URL", "https://tracking.example.id");
});

describe("authUrl", () => {
  it("asks for offline access, consent, both scopes, the callback URI and the state", () => {
    const u = new URL(authUrl("st4te", "challenge"));
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
    tokens({ refresh_token: "r-token", access_token: "a", scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send" });
    await exchangeCode(getOwnerAccount(), "code", "verifier");
    expect(decrypt(getKv<string>(getOwnerAccount(), "gmailToken")!)).toBe("r-token");
    expect(getKv(getOwnerAccount(), "gmailError")).toBeNull();
  });

  it("stores nothing and explains when Google returns no refresh token", async () => {
    tokens({ access_token: "a" });
    await exchangeCode(getOwnerAccount(), "code", "verifier");
    expect(getKv(getOwnerAccount(), "gmailToken")).toBeNull();
    expect(getKv(getOwnerAccount(), "gmailError")).toMatch(/did not return a refresh token/);
  });
});

it("does not overwrite an existing connection when scopes/profile are missing", async () => {
  setKv(getOwnerAccount(), "gmailToken", "existing-token");
  const token = vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({ tokens: { refresh_token: "new", scope: "https://www.googleapis.com/auth/gmail.readonly" }, res: null } as never);
  await expect(exchangeCode(getOwnerAccount(), "code", "verifier")).rejects.toThrow();
  expect(getKv(getOwnerAccount(), "gmailToken")).toBe("existing-token");
  token.mockResolvedValue({ tokens: {refresh_token:"new", scope:"https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"}, res:null } as never);
  profile.mockRejectedValue(new Error("profile failed"));
  await expect(exchangeCode(getOwnerAccount(), "code", "verifier")).rejects.toThrow();
  expect(getKv(getOwnerAccount(), "gmailToken")).toBe("existing-token");
});
it("disconnects locally even when upstream token revocation fails", async () => {
  setKv(getOwnerAccount(), "gmailToken", "invalid-encrypted-value");
  setKv(getOwnerAccount(), "gmailAddress", "mailbox@gmail.com");
  await disconnectGmail(getOwnerAccount());
  expect(getKv(getOwnerAccount(), "gmailToken")).toBeNull();
  expect(getKv(getOwnerAccount(), "gmailAddress")).toBeNull();
});
