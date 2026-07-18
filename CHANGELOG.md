# Changelog

## Phase 1 — working end-to-end pipeline

Implemented the full ingest → verify → match → digest system. It runs locally with no external
services (file-backed repository) and ships a test suite that uses saved HTML fixtures only.

### Added
- **Domain schema** (`lib/schema.ts`) — Zod models for preferences, sources, raw fetches, normalized
  jobs, requirements with evidence spans, verifications, change history, matches, saved jobs, and
  notifications.
- **Repository** (`lib/repository.ts`) — persistence interface with file-backed and in-memory
  backends; a Supabase implementation can be dropped in behind the same interface.
- **Fetcher** (`lib/fetcher.ts`) — records final URL, HTTP status, content hash, and raw body;
  timeout, size cap, http/https only, no auth.
- **Parser** (`lib/parser.ts`) — schema.org `JobPosting` JSON-LD extraction with a heuristic
  fallback; experience/skills/education/location/clearance extraction, each with an evidence span.
- **Deduplication + change history** (`lib/dedupe.ts`) — merge by canonical URL, external id, content
  hash, or fuzzy title/company/location; diff to a change log.
- **Verifier** (`lib/verifier.ts`) — `verified` / `uncertain` / `closed` from status, closed markers,
  and structured-data `validThrough`.
- **Matcher** (`lib/matcher.ts`) — hard filters (location, seniority, experience, remote) then an
  explainable 0–100 score with matched / gaps / unknowns and stretch handling.
- **Digest** (`lib/digest.ts`) — idempotent alerts for verified matches over a threshold, plus
  one-time closed-job corrections.
- **Pipeline orchestrator** (`lib/pipeline.ts`) and view model (`lib/view.ts`).
- **REST API** — `/api/jobs`, `/api/match`, `/api/profile`, `/api/sources`, `/api/ingest`,
  `/api/saved`, `/api/digest`.
- **Dashboard** (`/dashboard`) — profile editor, URL/HTML ingestion, ranked matches with evidence,
  saved-jobs pipeline with stages and résumé versions, and a digest preview.
- **Fixtures + seed** — official-style HTML postings and `npm run seed`.
- **Tests** — parser, matcher, verifier, and pipeline (24 tests) via `node:test` + `tsx`.

### Changed
- Landing page now pulls live matches from the API (falls back to seed data).
- Added `test` and `seed` npm scripts and `tsx` as a dev dependency.

### Notes
- Supabase persistence and email/Discord delivery remain optional integrations behind the existing
  interfaces (see `docs/ARCHITECTURE.md`). No live-site access is used in tests or CI.
