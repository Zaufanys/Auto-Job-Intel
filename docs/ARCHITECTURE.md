# Architecture

- Source adapters per employer/platform; respect robots, terms, rate limits, and public access.
- Fetcher saves raw evidence hash and retrieval metadata.
- Parser normalizes job records and extracts requirements with evidence spans.
- Deduper combines external IDs, canonical URLs, title/location/company similarity, and content hashes.
- Verifier revisits canonical URLs and evaluates active/closed signals.
- Matcher applies deterministic constraints before semantic/model scoring.
- Notification service uses idempotency keys and re-verifies immediately before send.

Use a queue for crawling and verification. Keep fetch/parsing separate from matching so job records are reusable across profiles.
