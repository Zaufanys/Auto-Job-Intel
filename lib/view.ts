import {
  type NormalizedJob,
  type MatchResult,
  type JobStatus,
} from "./schema";

/**
 * View model — the flat shape the UI and public API render. Joins a
 * normalized job with its match result and picks the most relevant evidence.
 */
export type JobView = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  years: string;
  status: JobStatus;
  score: number;
  officialUrl: string;
  matched: string[];
  missing: string[];
  unknowns: string[];
  evidence: string;
  passedHardFilters: boolean;
  isStretch: boolean;
};

export function formatYears(min: number | null, max: number | null): string {
  if (min === null && max === null) return "not stated";
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `${min}+`;
  return `up to ${max}`;
}

export function relativePosted(postedAt: string | null, now: Date = new Date()): string {
  if (!postedAt) return "recently";
  const then = new Date(postedAt);
  if (Number.isNaN(then.getTime())) return "recently";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
}

function pickEvidence(job: NormalizedJob): string {
  const years = job.requirements.evidence.find((e) => e.field === "years");
  if (years) return `“${years.quote}”`;
  const first = job.requirements.evidence[0];
  if (first) return `“${first.quote}”`;
  if (job.status === "closed") return "Posting no longer active on last re-check.";
  return "Verified against the official posting.";
}

export function toJobView(
  job: NormalizedJob,
  match: MatchResult | undefined,
  now: Date = new Date(),
): JobView {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    posted: relativePosted(job.postedAt, now),
    years: formatYears(job.requirements.yearsMin, job.requirements.yearsMax),
    status: job.status,
    score: match?.score ?? 0,
    officialUrl: job.canonicalUrl,
    matched: match?.explanation.matched ?? [],
    missing: match?.explanation.gaps ?? [],
    unknowns: match?.explanation.unknowns ?? [],
    evidence: pickEvidence(job),
    passedHardFilters: match?.passedHardFilters ?? false,
    isStretch: match?.isStretch ?? false,
  };
}
