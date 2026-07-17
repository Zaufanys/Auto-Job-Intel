import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseJob } from "../lib/parser";
import { parsedPostingSchema, type RawFetch, type Source } from "../lib/schema";

const FIXTURES = path.join(process.cwd(), "fixtures");

/** Build a RawFetch from a fixture HTML file. */
function fetchFor(name: string, finalUrl: string): RawFetch {
  const body = readFileSync(path.join(FIXTURES, `${name}.html`), "utf8");
  return {
    url: finalUrl,
    finalUrl,
    httpStatus: 200,
    fetchedAt: "2026-07-17T00:00:00.000Z",
    contentHash: "test",
    ok: true,
    body,
  };
}

/** Build a Source for a given company. */
function sourceFor(id: string, company: string): Source {
  return {
    id,
    company,
    careersUrl: "https://careers.example.com",
    sourceType: "structured-data",
    active: true,
  };
}

test("product-cybersecurity-engineer: JSON-LD extraction with 0-3 years", () => {
  const url = "https://careers.example-mobility.com/jobs/EM-2026-4471";
  const result = parseJob(fetchFor("product-cybersecurity-engineer", url), sourceFor("s1", "Example Mobility"));
  assert.ok(result, "result should be non-null");
  parsedPostingSchema.parse(result);

  assert.equal(result!.title, "Product Cybersecurity Engineer");
  assert.equal(result!.company, "Example Mobility");
  assert.equal(result!.location, "Dearborn, MI");
  assert.equal(result!.externalId, "EM-2026-4471");
  assert.equal(result!.canonicalUrl, url);

  assert.equal(result!.requirements.yearsMin, 0);
  assert.equal(result!.requirements.yearsMax, 3);

  const yearsSpan = result!.requirements.evidence.find((e) => e.field === "years");
  assert.ok(yearsSpan, "should have a years evidence span");
  assert.match(yearsSpan!.quote, /0-3 years/);
  assert.equal(yearsSpan!.source, url);

  for (const skill of ["Python", "ISO/SAE 21434", "firmware", "TARA", "embedded"]) {
    assert.ok(result!.requirements.skills.includes(skill), `expected skill ${skill}`);
  }
  assert.ok(result!.requirements.education.includes("Bachelor's degree"));
  assert.equal(result!.requirements.remote, "onsite");
});

test("embedded-validation-engineer: 2-5 years, C++ and CAN/OBD-II", () => {
  const url = "https://jobs.example-automotive.com/postings/EA-VAL-88231";
  const result = parseJob(fetchFor("embedded-validation-engineer", url), sourceFor("s2", "Example Automotive"));
  assert.ok(result);
  parsedPostingSchema.parse(result);

  assert.equal(result!.title, "Embedded Software Validation Engineer");
  assert.equal(result!.company, "Example Automotive");
  assert.equal(result!.location, "Warren, MI");
  assert.equal(result!.externalId, "EA-VAL-88231");

  assert.equal(result!.requirements.yearsMin, 2);
  assert.equal(result!.requirements.yearsMax, 5);

  const yearsSpan = result!.requirements.evidence.find((e) => e.field === "years");
  assert.ok(yearsSpan);
  assert.match(yearsSpan!.quote, /2-5 years/);

  for (const skill of ["C++", "CAN", "OBD-II"]) {
    assert.ok(result!.requirements.skills.includes(skill), `expected skill ${skill}`);
  }
});

test("cyber-defense-analyst: 1-3 years, Splunk and Wireshark", () => {
  const url = "https://careers.example-enterprise.com/roles/EE-SOC-1207";
  const result = parseJob(fetchFor("cyber-defense-analyst", url), sourceFor("s3", "Example Enterprise"));
  assert.ok(result);
  parsedPostingSchema.parse(result);

  assert.equal(result!.title, "Cyber Defense Analyst");
  assert.equal(result!.company, "Example Enterprise");
  assert.equal(result!.location, "Detroit, MI");

  assert.equal(result!.requirements.yearsMin, 1);
  assert.equal(result!.requirements.yearsMax, 3);

  const yearsSpan = result!.requirements.evidence.find((e) => e.field === "years");
  assert.ok(yearsSpan);
  assert.match(yearsSpan!.quote, /1-3 years/);

  for (const skill of ["Splunk", "Wireshark"]) {
    assert.ok(result!.requirements.skills.includes(skill), `expected skill ${skill}`);
  }
});

test("closed-penetration-tester: 3+ years, filled-position signals present", () => {
  const url = "https://careers.example-labs.com/openings/EL-PEN-0042";
  const result = parseJob(fetchFor("closed-penetration-tester", url), sourceFor("s4", "Example Labs"));
  assert.ok(result);
  parsedPostingSchema.parse(result);

  assert.equal(result!.title, "Penetration Tester");
  assert.equal(result!.company, "Example Labs");
  assert.equal(result!.location, "Ann Arbor, MI");

  assert.equal(result!.requirements.yearsMin, 3);
  assert.equal(result!.requirements.yearsMax, null);

  const yearsSpan = result!.requirements.evidence.find((e) => e.field === "years");
  assert.ok(yearsSpan);
  assert.match(yearsSpan!.quote, /3\+ years/);

  for (const skill of ["penetration testing", "reverse engineering", "firmware"]) {
    assert.ok(result!.requirements.skills.includes(skill), `expected skill ${skill}`);
  }

  // The closed/expired signals live in the raw body for downstream detection.
  const body = fetchFor("closed-penetration-tester", url).body;
  assert.match(body, /no longer accepting applications/i);
  assert.match(body, /2020-04-15/);
});

test("minimal-no-jsonld: heuristic fallback still extracts title and years", () => {
  const url = "https://careers.example.com/firmware-security-engineer";
  const result = parseJob(fetchFor("minimal-no-jsonld", url), sourceFor("s5", "Example Systems"));
  assert.ok(result, "heuristic path should still return a posting");
  parsedPostingSchema.parse(result);

  assert.equal(result!.title, "Firmware Security Engineer");
  assert.equal(result!.company, "Example Systems");
  assert.equal(result!.requirements.yearsMin, 4);
  assert.equal(result!.requirements.yearsMax, null);
  assert.ok(result!.requirements.confidence <= 0.5, "heuristic confidence should be low");

  const yearsSpan = result!.requirements.evidence.find((e) => e.field === "years");
  assert.ok(yearsSpan);
  assert.match(yearsSpan!.quote, /at least 4 years/);
});
