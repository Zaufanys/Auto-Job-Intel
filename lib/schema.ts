import { z } from "zod";

/**
 * Domain schema for AutoJob Intel.
 *
 * Every record that leaves the pipeline is validated against one of these
 * Zod schemas. Extracted requirements always carry `EvidenceSpan`s so any
 * claim (years, location, skill) can be traced back to the exact source text.
 */

export const jobStatusSchema = z.enum(["verified", "uncertain", "closed"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** The exact source sentence behind an extracted requirement. */
export const evidenceSpanSchema = z.object({
  field: z.string(),
  quote: z.string(),
  source: z.string(),
});
export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;

/** Candidate search profile / preferences. */
export const preferencesSchema = z.object({
  /** Location tokens matched case-insensitively against a job's location. */
  locations: z.array(z.string()).default(["Michigan", "MI"]),
  remote: z.enum(["onsite", "hybrid", "remote", "any"]).default("any"),
  roleFamilies: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  seniority: z.enum(["intern", "early", "mid", "senior"]).default("early"),
  /** Hard cap on the minimum years a posting may require. */
  maxYears: z.number().int().min(0).default(3),
  /** Allow postings slightly above `maxYears` to appear as flagged stretch roles. */
  allowStretch: z.boolean().default(true),
  resumeText: z.string().default(""),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** A registered, official job source. */
export const sourceSchema = z.object({
  id: z.string(),
  company: z.string(),
  careersUrl: z.string().url(),
  sourceType: z.enum(["structured-data", "feed", "manual-url"]),
  active: z.boolean().default(true),
});
export type Source = z.infer<typeof sourceSchema>;

/** Raw retrieval record — the auditable evidence that a fetch happened. */
export const rawFetchSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  httpStatus: z.number().int(),
  fetchedAt: z.string(),
  contentHash: z.string(),
  ok: z.boolean(),
  /** The retrieved body (HTML or JSON) kept as raw evidence. */
  body: z.string(),
});
export type RawFetch = z.infer<typeof rawFetchSchema>;

/** Structured requirements extracted from a posting, each with evidence. */
export const jobRequirementsSchema = z.object({
  yearsMin: z.number().nullable(),
  yearsMax: z.number().nullable(),
  education: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  clearance: z.string().nullable(),
  location: z.string().nullable(),
  remote: z.enum(["onsite", "hybrid", "remote", "unknown"]).default("unknown"),
  evidence: z.array(evidenceSpanSchema).default([]),
  /** 0..1 confidence in the extraction. */
  confidence: z.number().min(0).max(1),
});
export type JobRequirements = z.infer<typeof jobRequirementsSchema>;

/** A normalized, deduplicated job record — reusable across profiles. */
export const normalizedJobSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  externalId: z.string().nullable(),
  canonicalUrl: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  postedAt: z.string().nullable(),
  employmentType: z.string().nullable(),
  descriptionText: z.string(),
  contentHash: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  status: jobStatusSchema,
  requirements: jobRequirementsSchema,
});
export type NormalizedJob = z.infer<typeof normalizedJobSchema>;

/**
 * Output of the parser: the posting fields extracted from a raw fetch,
 * before the pipeline assigns an id, status, and timestamps.
 */
export const parsedPostingSchema = z.object({
  externalId: z.string().nullable(),
  canonicalUrl: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  postedAt: z.string().nullable(),
  employmentType: z.string().nullable(),
  descriptionText: z.string(),
  requirements: jobRequirementsSchema,
});
export type ParsedPosting = z.infer<typeof parsedPostingSchema>;

/** A recorded verification check against a canonical URL. */
export const verificationSchema = z.object({
  jobId: z.string(),
  checkedAt: z.string(),
  httpStatus: z.number().int(),
  finalUrl: z.string(),
  activeSignal: jobStatusSchema,
  evidence: z.string(),
});
export type Verification = z.infer<typeof verificationSchema>;

/** One entry in a job's change history. */
export const changeEntrySchema = z.object({
  jobId: z.string(),
  changedAt: z.string(),
  field: z.string(),
  from: z.string(),
  to: z.string(),
});
export type ChangeEntry = z.infer<typeof changeEntrySchema>;

export const hardFilterResultSchema = z.object({
  rule: z.enum(["location", "seniority", "experience", "remote"]),
  passed: z.boolean(),
  detail: z.string(),
});
export type HardFilterResult = z.infer<typeof hardFilterResultSchema>;

/** Explainable match output: hard filters, matches, gaps, unknowns. */
export const matchExplanationSchema = z.object({
  hardFilters: z.array(hardFilterResultSchema),
  matched: z.array(z.string()),
  gaps: z.array(z.string()),
  unknowns: z.array(z.string()),
});
export type MatchExplanation = z.infer<typeof matchExplanationSchema>;

export const matchResultSchema = z.object({
  jobId: z.string(),
  score: z.number().int().min(0).max(100),
  passedHardFilters: z.boolean(),
  isStretch: z.boolean(),
  explanation: matchExplanationSchema,
});
export type MatchResult = z.infer<typeof matchResultSchema>;

export const savedStageSchema = z.enum([
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
]);
export type SavedStage = z.infer<typeof savedStageSchema>;

export const savedJobSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stage: savedStageSchema.default("saved"),
  resumeVersion: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedJob = z.infer<typeof savedJobSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  reason: z.enum(["new", "changed", "closed-correction"]),
  channel: z.enum(["email", "discord", "preview"]),
  dedupeKey: z.string(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** A single item in a rendered digest. */
export const digestItemSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  officialUrl: z.string(),
  score: z.number(),
  reason: z.enum(["new", "changed", "closed-correction"]),
  dedupeKey: z.string(),
});
export type DigestItem = z.infer<typeof digestItemSchema>;

export const digestSchema = z.object({
  generatedAt: z.string(),
  items: z.array(digestItemSchema),
  corrections: z.array(digestItemSchema),
});
export type Digest = z.infer<typeof digestSchema>;
