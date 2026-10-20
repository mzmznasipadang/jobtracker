import { z } from "zod";
export const Status = z.enum(["saved", "ready", "applied", "interview", "offer", "rejected", "ghosted", "skipped"]);
export type Status = z.infer<typeof Status>;
export const Source = z.enum([
    "linkedin", "jobstreet", "glints", "wellfound", "kalibrr", "dealls", "upwork",
    "contra", "toptal", "projects", "sribulancer", "fastwork", "other",
]);
export type Source = z.infer<typeof Source>;
export const SalaryFit = z.enum(["ok", "below_minimum", "above_range", "unknown"]);
export type SalaryFit = z.infer<typeof SalaryFit>;
export const JobFields = z.object({
    company: z.string(),
    companyDomain: z.string().nullable(),
    title: z.string(),
    location: z.string().nullable(),
    workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
    employmentType: z.string().nullable(),
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.string().nullable(),
    salaryPeriod: z.enum(["hour", "day", "month", "year"]).nullable(),
    requirements: z.array(z.string()),
    niceToHave: z.array(z.string()),
    description: z.string(),
    applyMethod: z.enum(["site", "email", "form"]),
    applyEmail: z.string().nullable(),
    applyUrl: z.string().nullable(),
    recruiterEmail: z.string().nullable(),
    language: z.enum(["en", "id"]),
});
export type JobFields = z.infer<typeof JobFields>;
export const Job = JobFields.extend({
    id: z.number(),
    url: z.string(),
    source: Source,
    status: Status,
    busy: z.enum(["extracting", "checking", "tailoring"]).nullable(),
    busySince: z.string().nullable(),
    busyError: z.string().nullable(),
    statusLocked: z.boolean(),
    detailsEditedAt: z.string().nullable(),
    archivedAt: z.string().nullable(),
    purgeAfter: z.string().nullable(),
    rawText: z.string().nullable(),
    extractError: z.string().nullable(),
    matchScore: z.number().nullable(),
    matchJson: z.string().nullable(),
    salaryFit: SalaryFit.nullable(),
    scamRisk: z.enum(["low", "medium", "high"]).nullable(),
    scamJson: z.string().nullable(),
    followUpDue: z.boolean(),
    appliedAt: z.string().nullable(),
    firstResponseAt: z.string().nullable(),
    reachedInterview: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type Job = z.infer<typeof Job>;
const bullets = z.array(z.object({ id: z.string(), text: z.string() }));
export const MasterCv = z.object({
    basics: z.object({
        name: z.string(), email: z.string(), phone: z.string(), location: z.string(),
        links: z.array(z.string()),
    }),
    summary: z.string(),
    experience: z.array(z.object({
        id: z.string(), company: z.string(), title: z.string(), start: z.string(),
        end: z.string().nullable(), location: z.string().nullable(), bullets,
    })),
    projects: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), bullets })),
    education: z.array(z.object({
        id: z.string(), school: z.string(), degree: z.string(), start: z.string(), end: z.string(),
    })),
    skills: z.array(z.object({ id: z.string(), name: z.string(), category: z.string() })),
    certifications: z.array(z.object({ id: z.string(), name: z.string(), issuer: z.string(), year: z.string() })),
    languages: z.array(z.string()),
});
export type MasterCv = z.infer<typeof MasterCv>;
// Nested defaults use prefault({}) so each section fills itself from an empty input.
const nonNeg = z.number().min(0);
export const Settings = z.object({
    profile: z.object({
        name: z.string().default(""),
        email: z.string().default(""),
        phone: z.string().default(""),
        links: z.array(z.string()).default([]),
    }).prefault({}),
    preferences: z.object({
        targetRoles: z.array(z.string()).default([]),
        seniority: z.string().default(""),
        workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]),
        locations: z.array(z.string()).default([]),
        employmentTypes: z.array(z.string()).default([]),
        dealBreakers: z.array(z.string()).default([]),
    }).prefault({}),
    salary: z.object({
        expectedMonthlyIdr: nonNeg.default(0),
        minimumMonthlyIdr: nonNeg.default(0),
        expectedUsdHourly: nonNeg.default(0),
        fx: z.object({
            USD: z.number().positive().default(16000),
            SGD: z.number().positive().default(12000),
            EUR: z.number().positive().default(17500),
        }).prefault({}),
        hoursPerMonth: z.number().positive().default(173),
    }).prefault({}),
    pipeline: z.object({
        ghostDays: z.number().int().min(1).default(14),
        followUpDays: z.number().int().min(1).default(7),
        cvLanguage: z.enum(["auto", "en", "id"]).default("auto"),
    }).prefault({}),
    outlookAddress: z.string().nullable().default(null),
    publicPageEnabled: z.boolean().default(true),
    aiModel: z.string().min(1).default("claude-opus-5-5"),
});
export type Settings = z.infer<typeof Settings>;
