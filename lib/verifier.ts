import { type RawFetch, type Verification, type JobStatus } from "./schema";

/**
 * Verifier — decides whether a posting is active, closed, or uncertain from
 * an evidence-bearing fetch. Never guesses "active" silently: anything
 * ambiguous is `uncertain` and held back from verified alerts.
 */

const CLOSED_MARKERS = [
  "no longer accepting applications",
  "position has been filled",
  "this position is closed",
  "this job is closed",
  "posting has expired",
  "job posting expired",
  "applications are closed",
  "we are no longer accepting",
  "role has been filled",
];

const ACTIVE_MARKERS = [
  "apply now",
  "apply for this job",
  "submit application",
  "start your application",
];

/** Extract `validThrough` from any JobPosting JSON-LD in the body. */
function findValidThrough(body: string): Date | null {
  const blocks = body.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!blocks) return null;
  for (const block of blocks) {
    const json = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    try {
      const parsed = JSON.parse(json);
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"] && Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        const type = node?.["@type"];
        const isPosting = Array.isArray(type)
          ? type.includes("JobPosting")
          : type === "JobPosting";
        if (isPosting && node.validThrough) {
          const d = new Date(node.validThrough);
          if (!Number.isNaN(d.getTime())) return d;
        }
      }
    } catch {
      // ignore malformed block
    }
  }
  return null;
}

export function verify(
  fetch: RawFetch,
  jobId: string,
  now: Date = new Date(),
): Verification {
  const base = {
    jobId,
    checkedAt: now.toISOString(),
    httpStatus: fetch.httpStatus,
    finalUrl: fetch.finalUrl,
  };
  const decide = (activeSignal: JobStatus, evidence: string): Verification => ({
    ...base,
    activeSignal,
    evidence,
  });

  // Network failure (no HTTP response) → cannot confirm.
  if (fetch.httpStatus === 0) {
    return decide("uncertain", "Fetch failed with no HTTP response; status unconfirmed.");
  }
  // A definitive "gone" status is a closed signal.
  if (fetch.httpStatus === 404 || fetch.httpStatus === 410) {
    return decide("closed", `Canonical URL returned ${fetch.httpStatus} — posting removed.`);
  }
  // Any other error status is inconclusive.
  if (fetch.httpStatus >= 400) {
    return decide("uncertain", `Unexpected status ${fetch.httpStatus} on re-check.`);
  }

  const body = fetch.body.toLowerCase();

  const closedMarker = CLOSED_MARKERS.find((m) => body.includes(m));
  if (closedMarker) {
    return decide("closed", `Closed signal in page text: “${closedMarker}”.`);
  }

  const validThrough = findValidThrough(fetch.body);
  if (validThrough && validThrough.getTime() < now.getTime()) {
    return decide(
      "closed",
      `Structured data validThrough ${validThrough.toISOString().slice(0, 10)} is in the past.`,
    );
  }

  const hasActiveMarker = ACTIVE_MARKERS.some((m) => body.includes(m));
  const looksLikePosting = /application\/ld\+json/i.test(fetch.body) || hasActiveMarker;

  if (looksLikePosting) {
    return decide(
      "verified",
      validThrough
        ? `Active: 200 OK, no closed markers, validThrough ${validThrough.toISOString().slice(0, 10)} in the future.`
        : "Active: 200 OK with a live posting and no closed markers.",
    );
  }

  // 200 but the page doesn't look like a live posting (e.g. redirected to a
  // generic careers landing page) — do not claim verified.
  return decide(
    "uncertain",
    "200 OK but no clear active-posting signal; holding until confirmed.",
  );
}
