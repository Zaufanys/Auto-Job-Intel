import { test } from "node:test";
import assert from "node:assert/strict";

import { matchJob } from "../lib/matcher";
import {
  matchResultSchema,
  normalizedJobSchema,
  preferencesSchema,
  type JobRequirements,
  type NormalizedJob,
} from "../lib/schema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build (and validate) a NormalizedJob from partial fields. */
function makeJob(
  overrides: Omit<Partial<NormalizedJob>, "requirements"> & {
    requirements?: Partial<JobRequirements>;
  },
): NormalizedJob {
  const { requirements: reqOverrides, ...jobOverrides } = overrides;

  const requirements: JobRequirements = {
    yearsMin: 0,
    yearsMax: null,
    education: [],
    skills: [],
    clearance: null,
    location: null,
    remote: "unknown",
    evidence: [],
    confidence: 0.9,
    ...reqOverrides,
  };

  return normalizedJobSchema.parse({
    id: "job-1",
    sourceId: "src-1",
    externalId: null,
    canonicalUrl: "https://careers.example.com/job-1",
    title: "Software Engineer",
    company: "Example Corp",
    location: "Dearborn, MI",
    postedAt: null,
    employmentType: null,
    descriptionText: "A great job.",
    contentHash: "hash",
    firstSeenAt: "2026-07-17T00:00:00Z",
    lastSeenAt: "2026-07-17T00:00:00Z",
    status: "verified",
    ...jobOverrides,
    requirements,
  });
}

const prefs = preferencesSchema.parse({
  locations: ["Dearborn", "Michigan", "MI"],
  remote: "any",
  roleFamilies: ["software engineer", "backend"],
  skills: ["TypeScript", "React", "Node.js", "SQL"],
  seniority: "early",
  maxYears: 3,
  allowStretch: true,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("well-matching early-career job passes hard filters and scores high", () => {
  const job = makeJob({
    title: "Software Engineer, Backend",
    location: "Dearborn, MI",
    descriptionText: "Join our backend team building software.",
    requirements: {
      yearsMin: 0,
      skills: ["TypeScript", "React", "Node.js"],
      location: "Dearborn, MI",
      remote: "onsite",
      confidence: 0.9,
    },
  });

  const result = matchJob(job, prefs);

  assert.equal(result.passedHardFilters, true);
  assert.equal(result.isStretch, false);
  assert.ok(result.score >= 75, `expected score >= 75, got ${result.score}`);
  assert.ok(result.explanation.matched.length > 0);
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});

test("job requiring 6 years fails the experience hard filter even with allowStretch", () => {
  const job = makeJob({
    requirements: {
      yearsMin: 6,
      skills: ["TypeScript"],
      location: "Dearborn, MI",
      remote: "onsite",
    },
  });

  const result = matchJob(job, prefs);
  const experience = result.explanation.hardFilters.find((f) => f.rule === "experience");

  assert.equal(result.passedHardFilters, false);
  assert.equal(experience?.passed, false);
  assert.ok(result.score <= 40, `expected score <= 40, got ${result.score}`);
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});

test("job requiring 4 years passes as a stretch when maxYears is 3", () => {
  const stretchPrefs = preferencesSchema.parse({
    locations: ["Dearborn", "MI"],
    remote: "any",
    roleFamilies: ["software engineer"],
    skills: ["TypeScript", "React"],
    maxYears: 3,
    allowStretch: true,
  });

  const job = makeJob({
    requirements: {
      yearsMin: 4,
      skills: ["TypeScript", "React"],
      location: "Dearborn, MI",
      remote: "onsite",
    },
  });

  const result = matchJob(job, stretchPrefs);

  assert.equal(result.passedHardFilters, true);
  assert.equal(result.isStretch, true);
  assert.ok(
    result.explanation.gaps.some((g) => g.toLowerCase().includes("stretch")),
    "expected a stretch note in gaps",
  );
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});

test("non-preferred, non-remote location fails the location hard filter", () => {
  const job = makeJob({
    location: "Austin, TX",
    requirements: {
      yearsMin: 1,
      skills: ["TypeScript"],
      location: "Austin, TX",
      remote: "onsite",
    },
  });

  const result = matchJob(job, prefs);
  const location = result.explanation.hardFilters.find((f) => f.rule === "location");

  assert.equal(location?.passed, false);
  assert.equal(result.passedHardFilters, false);
  assert.ok(result.score <= 40, `expected score <= 40, got ${result.score}`);
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});

test("remote job in a non-preferred city passes location via remote policy", () => {
  const job = makeJob({
    location: "Austin, TX",
    requirements: {
      yearsMin: 0,
      skills: ["TypeScript", "React"],
      location: "Austin, TX",
      remote: "remote",
    },
  });

  const result = matchJob(job, prefs);
  const location = result.explanation.hardFilters.find((f) => f.rule === "location");

  assert.equal(location?.passed, true);
  assert.equal(result.passedHardFilters, true);
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});

test("null yearsMin and unknown remote surface as unknowns", () => {
  const job = makeJob({
    location: "Dearborn, MI",
    requirements: {
      yearsMin: null,
      skills: [],
      location: null,
      remote: "unknown",
    },
  });

  const result = matchJob(job, prefs);
  const experience = result.explanation.hardFilters.find((f) => f.rule === "experience");

  // Unknown years still passes the hard filter but is flagged as unknown.
  assert.equal(experience?.passed, true);
  assert.ok(
    result.explanation.unknowns.some((u) => u.toLowerCase().includes("years")),
    "expected an unknown note about years of experience",
  );
  assert.ok(
    result.explanation.unknowns.some((u) => u.toLowerCase().includes("remote")),
    "expected an unknown note about remote policy",
  );
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});

test("job-required skills the candidate lacks appear as gaps", () => {
  const job = makeJob({
    location: "Dearborn, MI",
    requirements: {
      yearsMin: 1,
      skills: ["TypeScript", "Kubernetes", "Rust"],
      location: "Dearborn, MI",
      remote: "onsite",
    },
  });

  const result = matchJob(job, prefs);

  assert.ok(
    result.explanation.gaps.some((g) => g.toLowerCase().includes("kubernetes")),
    "expected Kubernetes to be listed as a gap",
  );
  assert.ok(
    result.explanation.gaps.some((g) => g.toLowerCase().includes("rust")),
    "expected Rust to be listed as a gap",
  );
  assert.doesNotThrow(() => matchResultSchema.parse(result));
});
