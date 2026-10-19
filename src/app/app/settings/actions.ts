"use server";

import type { Account } from "@/lib/accounts";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AiError } from "@/lib/ai";
import { requireSession } from "@/lib/auth";
import { clearCvParseState, saveMasterCv, startCvParse } from "@/lib/cv/parse";
import { disconnectGmail } from "@/lib/email/gmail";
import { syncInbox } from "@/lib/email/sync";
import { saveSettings } from "@/lib/settings";
import { MasterCv } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class UserError extends Error {}

const MAX_PDF = 10 * 1024 * 1024;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k));
const list = (f: FormData, k: string) => str(f, k).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (e instanceof AiError) return `AI error (${e.code}): ${e.message}`;
  return e instanceof UserError ? e.message : "Something went wrong";
}

// requireSession redirects by throwing, so it stays outside the try.
async function guarded<T extends object>(fn: (account: Account) => T | Promise<T>): Promise<Result<T>> {
  const account = await requireSession();
  try {
    const out = await fn(account);
    revalidatePath("/app/settings");
    return { ok: true, ...out };
  } catch (e) {
    if (!(e instanceof ZodError || e instanceof AiError || e instanceof UserError)) console.error(e);
    return { ok: false, error: message(e) };
  }
}

const save = (patch: Parameters<typeof saveSettings>[1]) => guarded((account) => (saveSettings(account, patch), {}));

export const saveProfile = async (f: FormData) =>
  save({ profile: { name: str(f, "name"), email: str(f, "email"), phone: str(f, "phone"), links: list(f, "links") } });

export const savePreferences = async (f: FormData) =>
  save({
    preferences: {
      targetRoles: list(f, "targetRoles"),
      seniority: str(f, "seniority"),
      workModes: f.getAll("workModes") as ("remote" | "hybrid" | "onsite")[], // zod rejects anything else
      locations: list(f, "locations"),
      employmentTypes: list(f, "employmentTypes"),
      dealBreakers: list(f, "dealBreakers"),
    },
  });

export const saveSalary = async (f: FormData) =>
  save({
    salary: {
      expectedMonthlyIdr: num(f, "expectedMonthlyIdr"),
      minimumMonthlyIdr: num(f, "minimumMonthlyIdr"),
      expectedUsdHourly: num(f, "expectedUsdHourly"),
      fx: { USD: num(f, "fxUSD"), SGD: num(f, "fxSGD"), EUR: num(f, "fxEUR") },
      hoursPerMonth: num(f, "hoursPerMonth"),
    },
  });

export const savePipeline = async (f: FormData) =>
  save({
    pipeline: {
      ghostDays: num(f, "ghostDays"),
      followUpDays: num(f, "followUpDays"),
      cvLanguage: str(f, "cvLanguage") as "auto" | "en" | "id",
    },
  });

export const saveGeneral = async (f: FormData) =>
  save({
    outlookAddress: str(f, "outlookAddress") || null,
    publicPageEnabled: f.get("publicPageEnabled") === "on",
  });

export async function parseMasterCv(f: FormData) {
  return guarded(async (account) => {
    const file = f.get("pdf");
    let input: Parameters<typeof startCvParse>[1];
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PDF) throw new UserError("PDF is larger than 10 MB");
      const pdf = Buffer.from(await file.arrayBuffer());
      if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new UserError("File is not a PDF");
      input = { pdf };
    } else {
      const text = str(f, "text");
      if (!text) throw new UserError("Upload a PDF or paste your CV text");
      input = { text };
    }
    try {
      void startCvParse(account, input); // deliberately not awaited
    } catch (e) {
      throw new UserError((e as Error).message);
    }
    return {};
  });
}

export async function clearCvParse() {
  return guarded((account) => (clearCvParseState(account), {}));
}

export async function saveMasterCvAction(cv: MasterCv) {
  return guarded((account) => {
    const parsed = MasterCv.parse(cv);
    saveMasterCv(account, { ...parsed, experience: parsed.experience.map((e) => ({ ...e, bullets: e.bullets.filter((b) => b.text.trim()) })) });
    return {};
  });
}

// Not awaited (Cloudflare cuts requests at ~100 s; classification calls Claude). The card polls gmailSyncing.
export async function syncGmail() {
  return guarded((account) => {
    syncInbox(account)
      .then(() => revalidatePath("/app/inbox"))
      .catch((e) => console.error("Gmail sync failed:", e instanceof Error ? e.message : e));
    return {};
  });
}

export async function disconnectGmailAction() {
  return guarded(async (account) => { await disconnectGmail(account); return {}; });
}
