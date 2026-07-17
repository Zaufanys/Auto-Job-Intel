# Claude Handoff — AutoJob Intel

## Current state
The full Phase-1 pipeline is implemented and runs locally with no external services. See
`CHANGELOG.md` for the complete list. The app has a landing page, a working `/dashboard`, a REST API,
and a 24-test suite over saved HTML fixtures.

## Build target — ✅ implemented
A user configures a Michigan early-career search profile, adds official employer career sources,
receives normalized jobs with extracted experience requirements, sees verification evidence and
explainable fit, saves a job, and previews a deduplicated digest of verified-active matches with
closed-job corrections.

## Implementation order — status
1. ✅ Profile/preferences editor. *(Auth/RLS deferred — single-profile local store; add Supabase auth when persisting remotely.)*
2. ✅ Source registry + manual official-URL ingestion (`lib/pipeline.ts`, `/api/sources`, `/api/ingest`).
3. ✅ Fetch record with timestamp, final URL, HTTP status, content hash, raw body (`lib/fetcher.ts`).
4. ✅ Parser + Zod-normalized schema with evidence spans for every extracted requirement (`lib/parser.ts`, `lib/schema.ts`).
5. ✅ Deduplication + job change history (`lib/dedupe.ts`).
6. ✅ Verifier with active/closed/uncertain states (`lib/verifier.ts`); ingestion re-verifies before digest.
7. ✅ Matcher: location/seniority/experience/remote hard rules, then explainable scoring (`lib/matcher.ts`).
8. ✅ Saved/application pipeline with résumé-version field (`/api/saved`, dashboard).
9. ✅ Digest with idempotency + closed-job correction flow (`lib/digest.ts`). *(Email/Discord delivery is a thin sender over the digest output — env vars stubbed.)*
10. ✅ Tests using saved HTML fixtures — no live-site dependency (`tests/`).

## Remaining / next steps
- Supabase persistence: implement the `Repository` interface against `supabase/schema.sql` + auth/RLS.
- Real delivery: wire an email (Resend) or Discord sender to `generateDigest` output.
- Employer adapters: add `Source` types + adapters for specific official feeds.
- Resume import: parse uploaded resume text into `Preferences` with user correction.

## Definition of done — ✅ met
- Manual official URL produces a normalized record and verification evidence. ✅
- Years-of-experience extraction cites the exact source sentence. ✅
- Duplicate versions merge into one job with change history. ✅
- A closed or uncertain job is not sent as verified. ✅
- Match explanation clearly distinguishes hard filters, matches, gaps, and unknowns. ✅

## Do not add
CAPTCHA bypass, logged-in scraping, automatic application submission, fabricated links, or claims of comprehensive coverage.
