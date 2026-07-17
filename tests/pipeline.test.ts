import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Repository } from "../lib/repository";
import { makeRawFetch } from "../lib/fetcher";
import { ingestFetch, generateDigest, computeMatches } from "../lib/pipeline";
import { DEFAULT_PREFERENCES } from "../lib/config";
import { sourceSchema, type Source } from "../lib/schema";

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");
}

function source(id: string, company: string, url: string): Source {
  return sourceSchema.parse({
    id,
    company,
    careersUrl: url,
    sourceType: "structured-data",
    active: true,
  });
}

const NOW = new Date("2026-07-15T12:00:00.000Z");

test("ingest extracts, verifies, and stores a normalized job", async () => {
  const repo = Repository.memory();
  const src = source(
    "s1",
    "Example Mobility",
    "https://careers.example-mobility.com/jobs/product-cybersecurity-engineer",
  );
  const raw = makeRawFetch({
    url: src.careersUrl,
    body: fixture("product-cybersecurity-engineer.html"),
    fetchedAt: NOW.toISOString(),
  });

  const result = await ingestFetch(repo, src, raw, NOW);
  assert.ok(result);
  assert.equal(result.isNew, true);
  assert.equal(result.job.status, "verified");
  assert.equal(result.job.requirements.yearsMin, 0);
  assert.equal(result.job.requirements.yearsMax, 3);
  assert.ok(result.job.requirements.evidence.some((e) => e.field === "years"));

  // A verification record was written.
  const verifications = await repo.listVerifications(result.job.id);
  assert.equal(verifications.length, 1);
});

test("re-ingesting the same posting deduplicates instead of creating a copy", async () => {
  const repo = Repository.memory();
  const src = source(
    "s1",
    "Example Mobility",
    "https://careers.example-mobility.com/jobs/product-cybersecurity-engineer",
  );
  const raw = makeRawFetch({
    url: src.careersUrl,
    body: fixture("product-cybersecurity-engineer.html"),
    fetchedAt: NOW.toISOString(),
  });

  const first = await ingestFetch(repo, src, raw, NOW);
  const second = await ingestFetch(repo, src, raw, NOW);

  assert.ok(first && second);
  assert.equal(second.isNew, false);
  assert.equal(first.job.id, second.job.id);
  assert.equal((await repo.listJobs()).length, 1);
});

test("a filled posting is detected as closed with a change record", async () => {
  const repo = Repository.memory();
  const src = source(
    "s1",
    "Example Mobility",
    "https://careers.example-mobility.com/jobs/product-cybersecurity-engineer",
  );
  const body = fixture("product-cybersecurity-engineer.html");

  const open = await ingestFetch(
    repo,
    src,
    makeRawFetch({ url: src.careersUrl, body, fetchedAt: NOW.toISOString() }),
    NOW,
  );
  assert.equal(open?.job.status, "verified");

  // Same URL, now with a closed banner appended.
  const closedBody = body.replace(
    "</body>",
    "<p>This position has been filled and we are no longer accepting applications.</p></body>",
  );
  const later = new Date("2026-07-20T12:00:00.000Z");
  const closed = await ingestFetch(
    repo,
    src,
    makeRawFetch({ url: src.careersUrl, body: closedBody, fetchedAt: later.toISOString() }),
    later,
  );

  assert.ok(closed);
  assert.equal(closed.isNew, false);
  assert.equal(closed.job.status, "closed");
  assert.ok(closed.changes.some((c) => c.field === "status" && c.to === "closed"));
});

test("digest includes verified matches, excludes closed, and is idempotent", async () => {
  const repo = Repository.memory();
  await repo.setPreferences(DEFAULT_PREFERENCES);

  const specs: Array<[string, string, string]> = [
    ["s1", "Example Mobility", "https://careers.example-mobility.com/a"],
    ["s2", "Example Automotive", "https://jobs.example-automotive.com/b"],
    ["s3", "Example Enterprise", "https://careers.example-enterprise.com/c"],
    ["s4", "Example Labs", "https://careers.example-labs.com/d"],
  ];
  const files = [
    "product-cybersecurity-engineer.html",
    "embedded-validation-engineer.html",
    "cyber-defense-analyst.html",
    "closed-penetration-tester.html",
  ];
  for (let i = 0; i < specs.length; i++) {
    const [id, company, url] = specs[i];
    const src = source(id, company, url);
    await repo.upsertSource(src);
    await ingestFetch(
      repo,
      src,
      makeRawFetch({ url, body: fixture(files[i]), fetchedAt: NOW.toISOString() }),
      NOW,
    );
  }

  const first = await generateDigest(repo, DEFAULT_PREFERENCES, {
    now: NOW,
    minScore: 70,
    commit: true,
  });
  assert.ok(first.items.length >= 2, "expected multiple verified items");
  assert.ok(
    first.items.every((i) => i.reason === "new"),
    "first send should all be new",
  );
  // The closed posting never appears as a sendable item.
  assert.ok(!first.items.some((i) => i.title.toLowerCase().includes("penetration")));

  // Running again immediately sends nothing (idempotent).
  const second = await generateDigest(repo, DEFAULT_PREFERENCES, {
    now: NOW,
    minScore: 70,
    commit: true,
  });
  assert.equal(second.items.length, 0);
});

test("a job that closes after being alerted produces a correction exactly once", async () => {
  const repo = Repository.memory();
  await repo.setPreferences(DEFAULT_PREFERENCES);
  const src = source("s1", "Example Enterprise", "https://careers.example-enterprise.com/c");
  await repo.upsertSource(src);
  const body = fixture("cyber-defense-analyst.html");

  // Ingest + alert.
  await ingestFetch(
    repo,
    src,
    makeRawFetch({ url: src.careersUrl, body, fetchedAt: NOW.toISOString() }),
    NOW,
  );
  const sent = await generateDigest(repo, DEFAULT_PREFERENCES, {
    now: NOW,
    minScore: 70,
    commit: true,
  });
  assert.ok(sent.items.length >= 1);

  // Later it closes.
  const later = new Date("2026-07-22T12:00:00.000Z");
  const closedBody = body.replace(
    "</body>",
    "<p>This job is closed.</p></body>",
  );
  await ingestFetch(
    repo,
    src,
    makeRawFetch({ url: src.careersUrl, body: closedBody, fetchedAt: later.toISOString() }),
    later,
  );

  const correctionRun = await generateDigest(repo, DEFAULT_PREFERENCES, {
    now: later,
    minScore: 70,
    commit: true,
  });
  assert.equal(correctionRun.corrections.length, 1);
  assert.equal(correctionRun.corrections[0].reason, "closed-correction");

  // The correction is not repeated on a subsequent run.
  const again = await generateDigest(repo, DEFAULT_PREFERENCES, {
    now: later,
    minScore: 70,
    commit: true,
  });
  assert.equal(again.corrections.length, 0);
});

test("matches are computed against the stored profile", async () => {
  const repo = Repository.memory();
  await repo.setPreferences(DEFAULT_PREFERENCES);
  const src = source("s1", "Example Mobility", "https://careers.example-mobility.com/a");
  await repo.upsertSource(src);
  const result = await ingestFetch(
    repo,
    src,
    makeRawFetch({
      url: src.careersUrl,
      body: fixture("product-cybersecurity-engineer.html"),
      fetchedAt: NOW.toISOString(),
    }),
    NOW,
  );
  assert.ok(result);

  const matches = await computeMatches(repo, DEFAULT_PREFERENCES);
  const match = matches.get(result.job.id);
  assert.ok(match);
  assert.equal(match.passedHardFilters, true);
  assert.ok(match.score >= 70);
});
