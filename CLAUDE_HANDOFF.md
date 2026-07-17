# Claude Handoff — AutoJob Intel

## Current state
The starter provides an interactive ranked-jobs dashboard, verified-only and fit filters, exact years display, match/gap explanations, an API route, and a normalized ingestion/matching schema.

## Build target
A user configures a Michigan early-career search profile, adds several official employer career sources, receives normalized jobs with extracted experience requirements, sees verification evidence and explainable fit, saves a job, and receives a deduplicated digest only after a final active-link check.

## Implementation order
1. Supabase auth/RLS, profile/preferences editor, resume text import with user correction.
2. Source registry and one compliant adapter using public structured data or an official feed. Also support manual official job URL ingestion.
3. Fetch record with timestamp, final URL, HTTP status, content hash, and raw evidence location.
4. Parser and Zod-normalized job schema. Preserve evidence spans for every extracted requirement.
5. Deduplication and job change history.
6. Verifier with explicit active, closed, uncertain states. Recheck before every alert.
7. Matcher: enforce location/seniority/experience hard rules; then score skills and explain uncertainty.
8. Saved/application pipeline and resume-version field.
9. Email or Discord digest with idempotency and correction flow when a job closes.
10. Tests using saved HTML fixtures—no live-site dependency in CI.

## Definition of done
- Manual official URL produces a normalized record and verification evidence.
- Years-of-experience extraction cites the exact source sentence.
- Duplicate versions merge into one job with change history.
- A closed or uncertain job is not sent as verified.
- Match explanation clearly distinguishes hard filters, matches, gaps, and unknowns.

## Do not add
CAPTCHA bypass, logged-in scraping, automatic application submission, fabricated links, or claims of comprehensive coverage.
