<div align="center">

# 🚗 AutoJob Intel

### Verified job intelligence with explainable matching

**Official-link job tracking for automotive, embedded, cybersecurity, and early-career roles — built on trust, not volume.**

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-validated-3E67B1)](https://zod.dev/)
[![Tests](https://img.shields.io/badge/tests-24%20passing-3FCF8E)](./tests)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## 🎯 What is AutoJob Intel?

Most job aggregators optimize for **volume** — the more links they can show, the better they look.
AutoJob Intel optimizes for **trust**: every listing points to an official employer posting, every
requirement cites the exact sentence it came from, and every alert is re-verified as *active* before
it reaches you.

It runs **end-to-end today with zero external services** — the whole ingest → verify → match →
digest pipeline works against a local file-backed store. Supabase and email/Discord are optional
adapters behind interfaces (see [Deployment](#-deployment--optional-integrations)).

> **The build target:** a candidate configures a Michigan early-career search profile, adds official
> employer career sources, receives normalized jobs with extracted experience requirements, sees
> verification evidence and explainable fit, saves a job, and receives a deduplicated digest — only
> after a final active-link check. ✅ **Implemented.**

---

## ✨ Highlights

| | Feature | What it means |
|---|---|---|
| 🔗 | **Official links only** | Every job points to the employer's own posting, not a re-hosted copy. |
| 🔍 | **Status verification** | Links are re-checked and marked `verified` · `uncertain` · `closed`. |
| 📄 | **Cited requirements** | Extracted years/skills/education quote the exact source sentence. |
| 🧭 | **Explainable fit** | Scores separate hard filters, matches, gaps, and unknowns — no black box. |
| ♻️ | **Dedup + change history** | Re-ingested postings merge into one record with a tracked change log. |
| 📨 | **Trustworthy digests** | Deduplicated alerts sent only after re-check, with closed-job corrections. |
| 🛡️ | **Compliant by design** | No CAPTCHA bypass, no logged-in scraping, no auto-apply, no fabricated links. |

---

## 🔄 How it works

Fetching and parsing stay **separate** from matching, so verified job records are reusable across
every candidate profile.

```mermaid
flowchart LR
    A[📥 Ingest<br/>official career sites<br/>+ manual URLs] --> B[🔍 Verify<br/>HTTP status, final URL,<br/>content hash]
    B --> C[📄 Extract<br/>years, skills, education<br/>with evidence spans]
    C --> D[🧭 Match<br/>hard filters first,<br/>then explainable score]
    D --> E[📨 Alert<br/>deduplicated digest<br/>after re-check]

    style A fill:#18224a,stroke:#7dd3fc,color:#f5f7ff
    style B fill:#18224a,stroke:#7dd3fc,color:#f5f7ff
    style C fill:#18224a,stroke:#a78bfa,color:#f5f7ff
    style D fill:#18224a,stroke:#a78bfa,color:#f5f7ff
    style E fill:#18224a,stroke:#86efac,color:#f5f7ff
```

| Stage | Module | Responsibility |
|-------|--------|----------------|
| **Ingest** | `lib/fetcher.ts` | Retrieve a URL; record final URL, HTTP status, content hash, raw body. |
| **Parse** | `lib/parser.ts` | Prefer schema.org `JobPosting` JSON-LD; extract requirements with evidence spans. |
| **Dedupe** | `lib/dedupe.ts` | Merge by URL, external id, hash, or fuzzy title match; record change history. |
| **Verify** | `lib/verifier.ts` | Decide `verified` / `uncertain` / `closed` from status, markers, and `validThrough`. |
| **Match** | `lib/matcher.ts` | Hard filters (location, seniority, experience, remote) → explainable 0–100 score. |
| **Digest** | `lib/digest.ts` | Idempotent alerts for verified matches; one-time corrections when a job closes. |

`lib/pipeline.ts` orchestrates them over a `Repository` (`lib/repository.ts`).

---

## 🚀 Getting started

```bash
# Requires Node.js 20.9+
cp .env.example .env.local     # optional — the app runs without any keys
npm install
npm run seed                   # populate the local store from fixtures
npm run dev
```

Open **http://localhost:3000** for the landing page and **/dashboard** for the working app.
The first request auto-seeds if you skip `npm run seed`.

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # strict TypeScript
npm test           # unit + integration tests (node:test via tsx)
npm run seed       # rebuild the local data store from fixtures
```

---

## 🖥️ The app

- **Landing page (`/`)** — explains the product; its live-demo section pulls real matches from the API.
- **Dashboard (`/dashboard`)** — the working workspace:
  - **Search profile** editor (locations, skills, role families, max years, remote, stretch).
  - **Ingest** an official URL (or paste HTML to ingest offline) → normalized job + verification evidence.
  - **Ranked matches** with fit score, `verified`/`closed` tags, matched/gap/unknown chips, and cited evidence.
  - **Saved & application pipeline** with stage (`saved → applied → interview → offer/rejected`) and résumé version.
  - **Digest preview** — verified matches ≥ threshold, plus closed-job corrections.

---

## 🌐 API

All routes are under `app/api/*` and run on the file-backed repository.

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/jobs` | All stored jobs scored against the profile. |
| `GET` | `/api/match?min=&verifiedOnly=` | Ranked matches for the saved profile. |
| `GET` `PUT` | `/api/profile` | Read / update the search profile (Zod-validated). |
| `GET` `POST` | `/api/sources` | List / register official sources. |
| `POST` | `/api/ingest` | Ingest `{ url, html? }` through the full pipeline. |
| `GET` `POST` `DELETE` | `/api/saved` | Manage the saved-jobs pipeline. |
| `GET` | `/api/digest?min=&commit=` | Preview (or commit) the digest. |

```bash
# Ingest a posting by pasting its HTML (no live request needed)
curl -X POST localhost:3000/api/ingest -H 'content-type: application/json' \
  -d '{"url":"https://careers.example.com/jobs/1","html":"<html>…</html>"}'
```

---

## 🗂️ Project structure

```
autojob-intel/
├── app/
│   ├── page.tsx            # Landing page (live demo)
│   ├── dashboard/page.tsx  # Full working app
│   ├── icon.svg            # Favicon
│   └── api/                # jobs · match · profile · sources · ingest · saved · digest
├── lib/
│   ├── schema.ts           # Zod domain models (evidence spans, requirements, matches…)
│   ├── repository.ts       # Persistence interface + file/in-memory backends
│   ├── fetcher.ts parser.ts verifier.ts dedupe.ts matcher.ts digest.ts
│   ├── pipeline.ts         # Orchestrator
│   ├── view.ts config.ts seed.ts
├── fixtures/               # Saved official-style HTML postings (JSON-LD)
├── tests/                  # parser · matcher · verifier · pipeline (node:test)
├── scripts/seed.ts         # `npm run seed`
├── supabase/schema.sql     # Optional Postgres schema
└── docs/                   # PRD · architecture · roadmap · security
```

---

## 🧱 Data model

The domain is defined once as Zod schemas in [`lib/schema.ts`](./lib/schema.ts) and persisted through the
`Repository`: `Preferences` · `Source` · `RawFetch` · `NormalizedJob` (+ `JobRequirements` with
`EvidenceSpan`s) · `Verification` · `ChangeEntry` · `MatchResult` · `SavedJob` · `Notification`.
The equivalent Postgres tables live in [`supabase/schema.sql`](./supabase/schema.sql). Job records are
stored independently of matches, so one verified posting can be scored against many profiles.

---

## 🧪 Testing

`npm test` runs the suite with Node's built-in runner (via `tsx`) — **no live-site dependency**. Tests
use saved HTML fixtures:

- **parser** — extraction + evidence spans from JSON-LD and the heuristic fallback.
- **matcher** — hard filters, scoring, matched/gaps/unknowns, stretch handling.
- **verifier** — active / closed (`validThrough`, 404, filled markers) / uncertain.
- **pipeline** — ingest → dedupe → verify → digest, idempotency, and closed-job corrections.

---

## ☁️ Deployment & optional integrations

The default `Repository` writes JSON to `.data/` — no setup required. To productionize:

- **Database** — implement the `Repository` interface (`lib/repository.ts`) against Supabase/Postgres
  using [`supabase/schema.sql`](./supabase/schema.sql). No pipeline or API code changes needed.
- **Live crawling** — `runIngestForSources` already fetches registered sources via `lib/fetcher.ts`
  (timeout, size cap, no auth). Add employer adapters as new `Source` types.
- **Email / Discord** — the digest returns structured items with idempotency keys; wire a sender to
  `generateDigest`'s output. Env vars are stubbed in [`.env.example`](./.env.example).

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## 🛡️ Trust & safety

AutoJob Intel treats imported job text as untrusted input and **never** bypasses CAPTCHAs/bot defenses,
scrapes logged-in pages, auto-submits applications, fabricates/re-hosts links, or claims comprehensive
coverage. It prefers official APIs, feeds, and structured data, and respects site terms, rate limits,
and robots directives. See [`docs/SECURITY.md`](./docs/SECURITY.md).

---

## 🗺️ Roadmap & docs

- **Phase 1 ✅** — source registry, official-URL ingestion, verifier, matcher, saved jobs, digest.
- **Phase 2** — employer adapters, resume-parsing import, richer application tracking, Supabase persistence.
- **Phase 3** — career-center accounts, recruiter-side verified talent pools, labor-market analytics.

| Doc | Purpose |
|-----|---------|
| [`docs/PRD.md`](./docs/PRD.md) | Product requirements & quality metrics |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System architecture & adapters |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) · [`CHANGELOG.md`](./CHANGELOG.md) | Roadmap & change log |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Security & privacy baseline |
| [`CLAUDE_HANDOFF.md`](./CLAUDE_HANDOFF.md) | Implementation status & next steps |

---

## 📄 License

Released under the [MIT License](./LICENSE).

<div align="center">
<sub>Built for candidates who would rather have five trustworthy leads than five hundred stale ones.</sub>
</div>
