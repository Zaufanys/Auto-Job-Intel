"use client";

import { useMemo, useState } from "react";
import { jobs } from "@/lib/mock-data";
import type { JobStatus } from "@/lib/types";

const PIPELINE = [
  {
    step: "01",
    title: "Ingest",
    desc: "Pull postings from official employer career sites and manually added job URLs — no logged-in scraping, no bot defenses bypassed.",
  },
  {
    step: "02",
    title: "Verify",
    desc: "Re-visit the canonical link and record HTTP status, final URL, and a content hash. Every job is active, closed, or uncertain.",
  },
  {
    step: "03",
    title: "Extract",
    desc: "Normalize each posting and pull out experience years, education, skills, and location — each requirement cites its source sentence.",
  },
  {
    step: "04",
    title: "Match",
    desc: "Apply hard filters for location, seniority, and experience first, then score skills and explain every gap and unknown.",
  },
  {
    step: "05",
    title: "Alert",
    desc: "Send a deduplicated digest only after a final active-link re-check — and issue a correction when a job later closes.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "Official links only",
    body: "Every listing points to the employer's own posting, not a re-hosted copy that may be stale or altered.",
  },
  {
    title: "Evidence, not vibes",
    body: "Extracted requirements quote the exact sentence they came from, so you can audit every claim.",
  },
  {
    title: "Verified before sent",
    body: "Links are re-checked immediately before any alert; closed or uncertain jobs never go out as verified.",
  },
  {
    title: "Explainable fit",
    body: "Each score separates hard filters, matches, gaps, and unknowns — no opaque black-box ranking.",
  },
] as const;

const NEVER = [
  "CAPTCHA or bot-defense bypass",
  "Logged-in or authenticated scraping",
  "Automatic application submission",
  "Fabricated or re-hosted links",
  "Claims of comprehensive coverage",
];

const STATUS_LABEL: Record<JobStatus, string> = {
  verified: "Verified active",
  uncertain: "Uncertain",
  closed: "Closed",
};

function statusClass(status: JobStatus): string {
  if (status === "verified") return "good";
  if (status === "uncertain") return "warn";
  return "danger";
}

export default function Home() {
  const [min, setMin] = useState(70);
  const [onlyVerified, setOnlyVerified] = useState(true);

  const visible = useMemo(
    () =>
      jobs
        .filter((j) => j.score >= min && (!onlyVerified || j.status === "verified"))
        .sort((a, b) => b.score - a.score),
    [min, onlyVerified],
  );

  const verifiedCount = jobs.filter((j) => j.status === "verified").length;

  return (
    <main className="shell">
      {/* Header */}
      <header className="topbar">
        <div className="brand">
          <span className="logo-mark" aria-hidden="true" />
          <span className="brand-name">AutoJob Intel</span>
        </div>
        <nav className="topnav">
          <a href="#how">How it works</a>
          <a href="#demo">Live demo</a>
          <a href="#trust">Trust</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="hero">
        <div>
          <div className="eyebrow">Official-link job intelligence</div>
          <h1>
            Job search built on <span className="grad">trust</span>, not volume.
          </h1>
          <p className="lead">
            AutoJob Intel tracks automotive, embedded, cybersecurity, and early-career roles with
            verified official links, extracted experience requirements, explainable fit scores, and
            closing-status re-checks — so every alert is one you can actually act on.
          </p>
          <div className="row hero-cta">
            <a className="btn" href="#demo">
              Try the live demo
            </a>
            <a className="btn secondary" href="#how">
              See how it works
            </a>
          </div>
          <div className="row hero-tags">
            <span className="pill">Official career sites</span>
            <span className="pill">Link re-checks</span>
            <span className="pill">Cited requirements</span>
          </div>
        </div>

        <div className="card hero-card">
          <div className="hero-card-head">
            <span className="muted">Michigan · early career</span>
            <span className="tag good">live</span>
          </div>
          <div className="stat-row">
            <div>
              <div className="metric">{verifiedCount}</div>
              <div className="muted">verified high-fit matches</div>
            </div>
            <div>
              <div className="metric">&gt;95%</div>
              <div className="muted">links active at send time</div>
            </div>
          </div>
          <div className="mini-ledger">
            {jobs.slice(0, 3).map((j) => (
              <div className="mini-row" key={j.id}>
                <span className={`dot ${statusClass(j.status)}`} aria-hidden="true" />
                <span className="mini-title">{j.title}</span>
                <span className="mini-score">{j.score}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section">
        <div className="section-head">
          <div className="eyebrow">The pipeline</div>
          <h2 className="section-title">From official posting to trustworthy alert</h2>
          <p className="section-sub">
            Fetching and parsing stay separate from matching, so verified job records are reusable
            across every candidate profile.
          </p>
        </div>
        <div className="pipeline">
          {PIPELINE.map((p) => (
            <div className="card step" key={p.step}>
              <div className="step-num">{p.step}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive demo */}
      <section id="demo" className="section">
        <div className="section-head">
          <div className="eyebrow">Live demo</div>
          <h2 className="section-title">Ranked, explainable openings</h2>
          <p className="section-sub">
            Interactive prototype running on mock data. Adjust the fit threshold and verification
            filter to see how ranking and evidence respond.
          </p>
        </div>

        <div className="grid">
          <div className="card span-4">
            <h3>Search profile</h3>
            <div className="stack">
              <label>
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span>Minimum fit</span>
                  <strong>{min}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="row">
                  <input
                    style={{ width: "auto" }}
                    type="checkbox"
                    checked={onlyVerified}
                    onChange={(e) => setOnlyVerified(e.target.checked)}
                  />{" "}
                  Verified active links only
                </span>
              </label>
              <div className="item">
                <strong>Target</strong>
                <p>
                  Michigan · automotive cyber · embedded software · validation · cyber defense ·
                  early-career and selected stretch roles.
                </p>
              </div>
            </div>
          </div>

          <div className="card span-8">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>Ranked openings</h3>
              <span className="pill">{visible.length} shown</span>
            </div>
            <div className="list">
              {visible.length === 0 && (
                <div className="item empty">
                  No openings clear this threshold. Lower the minimum fit or disable the
                  verified-only filter.
                </div>
              )}
              {visible.map((j) => (
                <article className="item job" key={j.id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <h3>{j.title}</h3>
                      <div className="muted">
                        {j.company} · {j.location} · {j.posted}
                      </div>
                    </div>
                    <div className="score-badge">
                      <span className="metric">{j.score}</span>
                      <span className="muted">fit</span>
                    </div>
                  </div>
                  <div className="row">
                    <span className={`tag ${statusClass(j.status)}`}>{STATUS_LABEL[j.status]}</span>
                    <span className="pill">Experience: {j.years} yrs</span>
                  </div>
                  <div className="chips">
                    {j.matched.map((m) => (
                      <span className="chip match" key={m}>
                        ✓ {m}
                      </span>
                    ))}
                    {j.missing.map((m) => (
                      <span className="chip gap" key={m}>
                        ✕ {m}
                      </span>
                    ))}
                  </div>
                  <blockquote className="evidence">{j.evidence}</blockquote>
                  <a className="btn secondary" href={j.officialUrl}>
                    Official listing ↗
                  </a>
                </article>
              ))}
            </div>
          </div>

          <div className="card span-7">
            <h3>Verification ledger</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Experience</th>
                    <th>Next check</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.title}</td>
                      <td>
                        <span className={`tag ${statusClass(j.status)}`}>
                          {STATUS_LABEL[j.status]}
                        </span>
                      </td>
                      <td>{j.years} yrs</td>
                      <td>Within 12 hours</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card span-5">
            <h3>Digest rules</h3>
            <div className="list">
              <div className="item">Alert only on new or materially changed postings.</div>
              <div className="item">Prefer official employer URLs.</div>
              <div className="item">Show exact years required and location.</div>
              <div className="item">Re-check active status before notifying.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="section">
        <div className="section-head">
          <div className="eyebrow">Why it&apos;s different</div>
          <h2 className="section-title">Trust is the product</h2>
          <p className="section-sub">
            Most aggregators optimize for how many links they can show. AutoJob Intel optimizes for
            whether you can rely on each one.
          </p>
        </div>
        <div className="principles">
          {PRINCIPLES.map((p) => (
            <div className="card principle" key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
        <div className="card never-card">
          <h3>What we never do</h3>
          <div className="chips">
            {NEVER.map((n) => (
              <span className="chip gap" key={n}>
                ✕ {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div>
          <strong>AutoJob Intel</strong> — starter build: filters, explainable fit, cited experience
          extraction, and a verification ledger.
        </div>
        <div className="muted">
          Running on mock data · database and AI integrations behind interfaces.
        </div>
      </footer>
    </main>
  );
}
