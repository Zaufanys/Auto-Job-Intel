import { type NormalizedJob, type ChangeEntry } from "./schema";

/**
 * Deduplication + change history.
 *
 * A duplicate is detected by (in priority order): identical canonical URL,
 * matching (sourceId, externalId), identical content hash, or high
 * title/company/location similarity. Merging preserves the original id and
 * records a `ChangeEntry` for every field that materially changed.
 */

export type DedupeCandidate = {
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  contentHash: string;
  title: string;
  company: string;
  location: string;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .replace(/[^a-z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean),
  );
}

function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

export function findDuplicate(
  candidate: DedupeCandidate,
  existing: NormalizedJob[],
): NormalizedJob | null {
  // 1. Same canonical URL.
  const byUrl = existing.find((j) => j.canonicalUrl === candidate.canonicalUrl);
  if (byUrl) return byUrl;

  // 2. Same (source, external id).
  if (candidate.externalId) {
    const byExternal = existing.find(
      (j) => j.sourceId === candidate.sourceId && j.externalId === candidate.externalId,
    );
    if (byExternal) return byExternal;
  }

  // 3. Identical content hash.
  const byHash = existing.find((j) => j.contentHash === candidate.contentHash);
  if (byHash) return byHash;

  // 4. Fuzzy title/company/location match.
  const bySimilarity = existing.find(
    (j) =>
      norm(j.company) === norm(candidate.company) &&
      norm(j.location) === norm(candidate.location) &&
      jaccard(j.title, candidate.title) >= 0.8,
  );
  return bySimilarity ?? null;
}

/** Fields worth tracking in the change history. */
export function diffJobs(prev: NormalizedJob, next: NormalizedJob): ChangeEntry[] {
  const changes: ChangeEntry[] = [];
  const record = (field: string, from: string, to: string) => {
    if (from !== to) {
      changes.push({
        jobId: prev.id,
        changedAt: next.lastSeenAt,
        field,
        from,
        to,
      });
    }
  };
  record("title", prev.title, next.title);
  record("location", prev.location, next.location);
  record("status", prev.status, next.status);
  record("employmentType", prev.employmentType ?? "", next.employmentType ?? "");
  record("contentHash", prev.contentHash, next.contentHash);
  record(
    "yearsMin",
    String(prev.requirements.yearsMin ?? ""),
    String(next.requirements.yearsMin ?? ""),
  );
  record(
    "yearsMax",
    String(prev.requirements.yearsMax ?? ""),
    String(next.requirements.yearsMax ?? ""),
  );
  return changes;
}
