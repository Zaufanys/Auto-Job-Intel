import { createHash } from "node:crypto";
import { type RawFetch } from "./schema";

/**
 * Fetcher — retrieves a URL and records auditable evidence: the final URL
 * after redirects, HTTP status, a content hash, and the raw body.
 *
 * Safety: only http/https, a hard size cap, a timeout, and no auth headers.
 * We never bypass bot defenses or log in; failures degrade to a recorded
 * non-OK fetch rather than throwing.
 */

export type FetchFn = (url: string) => Promise<RawFetch>;

const MAX_BYTES = 2_000_000; // 2 MB content cap
const TIMEOUT_MS = 10_000;

export function contentHash(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}

/** Build a RawFetch record from an already-retrieved body (used by seeding/tests). */
export function makeRawFetch(params: {
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  body: string;
  fetchedAt?: string;
  ok?: boolean;
}): RawFetch {
  const body = params.body.slice(0, MAX_BYTES);
  return {
    url: params.url,
    finalUrl: params.finalUrl ?? params.url,
    httpStatus: params.httpStatus ?? 200,
    fetchedAt: params.fetchedAt ?? new Date().toISOString(),
    contentHash: contentHash(body),
    ok: params.ok ?? true,
    body,
  };
}

/** Live HTTP fetch. Records the outcome even on failure. */
export async function httpFetch(url: string): Promise<RawFetch> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return errorFetch(url, "invalid-url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return errorFetch(url, "unsupported-protocol");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "AutoJobIntelBot/0.1 (+official-link verification)" },
    });
    const raw = await res.text();
    const body = raw.slice(0, MAX_BYTES);
    return {
      url,
      finalUrl: res.url || url,
      httpStatus: res.status,
      fetchedAt: new Date().toISOString(),
      contentHash: contentHash(body),
      ok: res.ok,
      body,
    };
  } catch {
    return errorFetch(url, "fetch-failed");
  } finally {
    clearTimeout(timer);
  }
}

function errorFetch(url: string, reason: string): RawFetch {
  return {
    url,
    finalUrl: url,
    httpStatus: 0,
    fetchedAt: new Date().toISOString(),
    contentHash: contentHash(reason),
    ok: false,
    body: "",
  };
}
