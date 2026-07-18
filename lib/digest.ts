import {
  type NormalizedJob,
  type MatchResult,
  type Notification,
  type Digest,
  type DigestItem,
} from "./schema";

/**
 * Digest builder.
 *
 * Only verified-active jobs that clear the fit threshold and haven't already
 * been sent go out. Idempotency is enforced with a `dedupeKey` per item.
 * When a previously-alerted job later closes, a `closed-correction` item is
 * emitted exactly once.
 */

export type DigestInput = {
  jobs: NormalizedJob[];
  matches: Map<string, MatchResult>;
  priorNotifications: Notification[];
  now: Date;
  minScore?: number;
  channel?: Notification["channel"];
};

export type DigestOutput = {
  digest: Digest;
  newNotifications: Notification[];
};

function newDedupeKey(job: NormalizedJob): string {
  return `${job.id}:${job.contentHash}`;
}
function closedDedupeKey(job: NormalizedJob): string {
  return `${job.id}:closed`;
}

export function buildDigest(input: DigestInput): DigestOutput {
  const { jobs, matches, priorNotifications, now } = input;
  const minScore = input.minScore ?? 70;
  const channel = input.channel ?? "preview";

  const sentKeys = new Set(priorNotifications.map((n) => n.dedupeKey));
  const notifiedJobIds = new Set(
    priorNotifications
      .filter((n) => n.reason !== "closed-correction")
      .map((n) => n.jobId),
  );

  const items: DigestItem[] = [];
  const corrections: DigestItem[] = [];
  const newNotifications: Notification[] = [];

  const makeNotification = (
    job: NormalizedJob,
    reason: Notification["reason"],
    dedupeKey: string,
  ): Notification => ({
    id: `ntf_${dedupeKey}`,
    jobId: job.id,
    reason,
    channel,
    dedupeKey,
    createdAt: now.toISOString(),
    sentAt: null,
  });

  for (const job of jobs) {
    const match = matches.get(job.id);

    // Correction path: a job we alerted on has since closed.
    if (job.status === "closed") {
      const key = closedDedupeKey(job);
      if (notifiedJobIds.has(job.id) && !sentKeys.has(key)) {
        const item: DigestItem = {
          jobId: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          officialUrl: job.canonicalUrl,
          score: match?.score ?? 0,
          reason: "closed-correction",
          dedupeKey: key,
        };
        corrections.push(item);
        newNotifications.push(makeNotification(job, "closed-correction", key));
      }
      continue;
    }

    // Alert path: verified, passes hard filters, clears the threshold, unseen.
    if (job.status !== "verified") continue;
    if (!match || !match.passedHardFilters || match.score < minScore) continue;

    const key = newDedupeKey(job);
    if (sentKeys.has(key)) continue;

    const reason: Notification["reason"] = notifiedJobIds.has(job.id)
      ? "changed"
      : "new";
    items.push({
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      officialUrl: job.canonicalUrl,
      score: match.score,
      reason,
      dedupeKey: key,
    });
    newNotifications.push(makeNotification(job, reason, key));
  }

  items.sort((a, b) => b.score - a.score);

  return {
    digest: { generatedAt: now.toISOString(), items, corrections },
    newNotifications,
  };
}
