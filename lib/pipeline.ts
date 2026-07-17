import { randomUUID } from "node:crypto";
import { Repository } from "./repository";
import { httpFetch, type FetchFn } from "./fetcher";
import { parseJob } from "./parser";
import { findDuplicate, diffJobs, type DedupeCandidate } from "./dedupe";
import { verify } from "./verifier";
import { matchJob } from "./matcher";
import { buildDigest } from "./digest";
import {
  normalizedJobSchema,
  sourceSchema,
  type NormalizedJob,
  type Source,
  type RawFetch,
  type ChangeEntry,
  type Verification,
  type MatchResult,
  type Preferences,
  type Digest,
} from "./schema";

/**
 * Pipeline orchestrator: ingest → parse → dedupe → verify → store, plus
 * matching and digest generation. Fetching/parsing produce reusable job
 * records; matching is layered on top per profile.
 */

export type IngestResult = {
  job: NormalizedJob;
  verification: Verification;
  changes: ChangeEntry[];
  isNew: boolean;
};

/** Ingest a single already-retrieved fetch for a known source. */
export async function ingestFetch(
  repo: Repository,
  source: Source,
  raw: RawFetch,
  now: Date = new Date(),
): Promise<IngestResult | null> {
  const parsed = parseJob(raw, source);
  if (!parsed) return null;

  const existing = await repo.listJobs();
  const candidate: DedupeCandidate = {
    sourceId: source.id,
    externalId: parsed.externalId,
    canonicalUrl: parsed.canonicalUrl,
    contentHash: raw.contentHash,
    title: parsed.title,
    company: parsed.company,
    location: parsed.location,
  };
  const dup = findDuplicate(candidate, existing);
  const id = dup?.id ?? randomUUID();
  const nowIso = now.toISOString();

  const verification = verify(raw, id, now);

  const nextJob = normalizedJobSchema.parse({
    id,
    sourceId: source.id,
    externalId: parsed.externalId,
    canonicalUrl: parsed.canonicalUrl,
    title: parsed.title,
    company: parsed.company,
    location: parsed.location,
    postedAt: parsed.postedAt,
    employmentType: parsed.employmentType,
    descriptionText: parsed.descriptionText,
    contentHash: raw.contentHash,
    firstSeenAt: dup?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    status: verification.activeSignal,
    requirements: parsed.requirements,
  } satisfies NormalizedJob);

  const changes = dup ? diffJobs(dup, nextJob) : [];

  await repo.putJob(nextJob);
  await repo.addVerification(verification);
  await repo.addChanges(changes);

  return { job: nextJob, verification, changes, isNew: !dup };
}

/** Manual official-URL ingestion. Creates/uses a per-host manual source. */
export async function ingestUrl(
  repo: Repository,
  url: string,
  opts: { fetchFn?: FetchFn; now?: Date } = {},
): Promise<IngestResult | null> {
  const fetchFn = opts.fetchFn ?? httpFetch;
  const now = opts.now ?? new Date();

  let host = "manual";
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  const source: Source = sourceSchema.parse({
    id: `manual:${host}`,
    company: host,
    careersUrl: `https://${host}`,
    sourceType: "manual-url",
    active: true,
  });
  await repo.upsertSource(source);

  const raw = await fetchFn(url);
  return ingestFetch(repo, source, raw, now);
}

/** Re-fetch and ingest every active source (used by scheduled crawls). */
export async function runIngestForSources(
  repo: Repository,
  fetchFn: FetchFn,
  now: Date = new Date(),
): Promise<IngestResult[]> {
  const sources = (await repo.listSources()).filter((s) => s.active);
  const results: IngestResult[] = [];
  for (const source of sources) {
    const raw = await fetchFn(source.careersUrl);
    const result = await ingestFetch(repo, source, raw, now);
    if (result) results.push(result);
  }
  return results;
}

/** Score every stored job against a profile. */
export async function computeMatches(
  repo: Repository,
  prefs: Preferences,
): Promise<Map<string, MatchResult>> {
  const jobs = await repo.listJobs();
  const map = new Map<string, MatchResult>();
  for (const job of jobs) map.set(job.id, matchJob(job, prefs));
  return map;
}

/**
 * Build a digest and (by default) record its notifications so subsequent
 * runs are idempotent. Re-verifies nothing here — callers should ingest
 * (which verifies) immediately before generating a digest to send.
 */
export async function generateDigest(
  repo: Repository,
  prefs: Preferences,
  opts: { now?: Date; minScore?: number; commit?: boolean } = {},
): Promise<Digest> {
  const now = opts.now ?? new Date();
  const commit = opts.commit ?? true;

  const jobs = await repo.listJobs();
  const matches = await computeMatches(repo, prefs);
  const priorNotifications = await repo.listNotifications();

  const { digest, newNotifications } = buildDigest({
    jobs,
    matches,
    priorNotifications,
    now,
    minScore: opts.minScore,
  });

  if (commit) {
    for (const n of newNotifications) await repo.addNotification(n);
  }
  return digest;
}
