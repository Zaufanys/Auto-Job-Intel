import { test } from "node:test";
import assert from "node:assert/strict";

import { verify } from "../lib/verifier";
import { makeRawFetch } from "../lib/fetcher";

const NOW = new Date("2026-07-15T12:00:00.000Z");

function fetchWith(body: string, httpStatus = 200, ok = true) {
  return makeRawFetch({
    url: "https://careers.example.com/job",
    body,
    httpStatus,
    ok,
    fetchedAt: NOW.toISOString(),
  });
}

const POSTING = `<html><body>
<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","validThrough":"2027-01-01"}</script>
<a>Apply now</a></body></html>`;

test("a live posting with a future validThrough is verified", () => {
  const v = verify(fetchWith(POSTING), "j1", NOW);
  assert.equal(v.activeSignal, "verified");
});

test("a 404 is closed", () => {
  const v = verify(fetchWith("Not found", 404, false), "j1", NOW);
  assert.equal(v.activeSignal, "closed");
});

test("a closed marker in the body is closed", () => {
  const body = POSTING.replace("Apply now", "This position has been filled");
  const v = verify(fetchWith(body), "j1", NOW);
  assert.equal(v.activeSignal, "closed");
});

test("a past validThrough is closed", () => {
  const body = POSTING.replace("2027-01-01", "2020-01-01");
  const v = verify(fetchWith(body), "j1", NOW);
  assert.equal(v.activeSignal, "closed");
});

test("a 200 page that isn't a posting is uncertain, not verified", () => {
  const v = verify(fetchWith("<html><body><h1>Careers</h1></body></html>"), "j1", NOW);
  assert.equal(v.activeSignal, "uncertain");
});

test("a failed fetch is uncertain", () => {
  const v = verify(fetchWith("", 0, false), "j1", NOW);
  assert.equal(v.activeSignal, "uncertain");
});
