"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JobView } from "@/lib/view";
import type { Preferences, SavedStage, Verification } from "@/lib/schema";

type SavedItem = {
  id: string;
  jobId: string;
  stage: SavedStage;
  resumeVersion: string | null;
  notes: string | null;
  title: string;
  company: string;
  location: string;
  officialUrl: string;
  jobStatus: string;
};

type IngestResponse = {
  job?: JobView;
  verification?: Verification;
  evidence?: { field: string; quote: string; source: string }[];
  isNew?: boolean;
  error?: string;
};

type DigestItem = {
  jobId: string;
  title: string;
  company: string;
  location: string;
  officialUrl: string;
  score: number;
  reason: string;
};

const STAGES: SavedStage[] = ["saved", "applied", "interview", "offer", "rejected"];

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return (await res.json()) as T;
}
async function sendJSON<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

function statusClass(status: string): string {
  if (status === "verified") return "good";
  if (status === "uncertain") return "warn";
  return "danger";
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Preferences | null>(null);
  const [matches, setMatches] = useState<JobView[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [min, setMin] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.jobId)), [saved]);

  const loadMatches = useCallback(async () => {
    const data = await getJSON<{ matches: JobView[] }>("/api/match?min=0");
    setMatches(data.matches);
  }, []);
  const loadSaved = useCallback(async () => {
    const data = await getJSON<{ saved: SavedItem[] }>("/api/saved");
    setSaved(data.saved);
  }, []);

  useEffect(() => {
    (async () => {
      const p = await getJSON<{ profile: Preferences }>("/api/profile");
      setProfile(p.profile);
      await Promise.all([loadMatches(), loadSaved()]);
      setLoading(false);
    })();
  }, [loadMatches, loadSaved]);

  const visible = useMemo(
    () =>
      matches.filter(
        (m) => m.score >= min && (!verifiedOnly || m.status === "verified"),
      ),
    [matches, min, verifiedOnly],
  );

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="logo-mark" aria-hidden="true" />
          <span className="brand-name">AutoJob Intel</span>
        </a>
        <nav className="topnav">
          <a href="/">Home</a>
          <a href="#profile">Profile</a>
          <a href="#ingest">Add source</a>
          <a href="#saved">Saved</a>
        </nav>
      </header>

      <section className="section" style={{ marginTop: 8 }}>
        <div className="eyebrow">Workspace</div>
        <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)" }}>Your job intelligence</h1>
        <p className="section-sub">
          Everything here runs on the real pipeline — ingest an official URL, edit your
          profile, and matches re-score with cited evidence. No external services required.
        </p>
      </section>

      {loading && <div className="card">Loading your workspace…</div>}

      {!loading && (
        <div className="grid">
          {/* Profile editor */}
          <div className="card span-5" id="profile">
            <ProfileEditor
              profile={profile}
              onSaved={async (p) => {
                setProfile(p);
                await loadMatches();
              }}
            />
          </div>

          {/* Ingestion */}
          <div className="card span-7" id="ingest">
            <IngestForm
              onIngested={async () => {
                await Promise.all([loadMatches(), loadSaved()]);
              }}
            />
          </div>

          {/* Matches */}
          <div className="card span-12">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Ranked matches</h2>
              <span className="pill">{visible.length} shown</span>
            </div>
            <div className="row" style={{ margin: "8px 0 16px" }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                Min fit {min}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                  style={{ width: 160 }}
                />
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                />
                Verified only
              </label>
            </div>
            <div className="list">
              {visible.length === 0 && (
                <div className="item empty">No matches at this threshold.</div>
              )}
              {visible.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isSaved={savedIds.has(m.id)}
                  onSave={async () => {
                    await sendJSON("/api/saved", "POST", { jobId: m.id });
                    await loadSaved();
                  }}
                />
              ))}
            </div>
          </div>

          {/* Saved pipeline */}
          <div className="card span-12" id="saved">
            <h2>Saved &amp; application pipeline</h2>
            {saved.length === 0 && (
              <p className="muted">
                Nothing saved yet. Use “Save” on a match above to track it here.
              </p>
            )}
            <div className="list">
              {saved.map((s) => (
                <SavedRow
                  key={s.id}
                  item={s}
                  onUpdate={async (patch) => {
                    await sendJSON("/api/saved", "POST", { jobId: s.jobId, ...patch });
                    await loadSaved();
                  }}
                  onRemove={async () => {
                    await fetch(`/api/saved?id=${s.id}`, { method: "DELETE" });
                    await loadSaved();
                  }}
                />
              ))}
            </div>
          </div>

          {/* Digest */}
          <div className="card span-12">
            <DigestPreview />
          </div>
        </div>
      )}
    </main>
  );
}

function ProfileEditor({
  profile,
  onSaved,
}: {
  profile: Preferences | null;
  onSaved: (p: Preferences) => void;
}) {
  const [draft, setDraft] = useState<Preferences | null>(profile);
  const [status, setStatus] = useState("");
  useEffect(() => setDraft(profile), [profile]);
  if (!draft) return <h2>Search profile</h2>;

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="stack">
      <h2>Search profile</h2>
      <label>
        Locations (comma-separated)
        <input
          value={draft.locations.join(", ")}
          onChange={(e) =>
            update(
              "locations",
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            )
          }
        />
      </label>
      <label>
        Skills (comma-separated)
        <input
          value={draft.skills.join(", ")}
          onChange={(e) =>
            update(
              "skills",
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            )
          }
        />
      </label>
      <label>
        Role families (comma-separated)
        <input
          value={draft.roleFamilies.join(", ")}
          onChange={(e) =>
            update(
              "roleFamilies",
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            )
          }
        />
      </label>
      <div className="row">
        <label style={{ flex: 1 }}>
          Max years
          <input
            type="number"
            min={0}
            value={draft.maxYears}
            onChange={(e) => update("maxYears", Number(e.target.value))}
          />
        </label>
        <label style={{ flex: 1 }}>
          Remote
          <select
            value={draft.remote}
            onChange={(e) => update("remote", e.target.value as Preferences["remote"])}
          >
            <option value="any">Any</option>
            <option value="onsite">Onsite</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </label>
      </div>
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={draft.allowStretch}
          onChange={(e) => update("allowStretch", e.target.checked)}
        />
        Allow stretch roles (+2 years)
      </label>
      <button
        className="btn"
        onClick={async () => {
          setStatus("Saving…");
          const res = await sendJSON<{ profile?: Preferences; error?: string }>(
            "/api/profile",
            "PUT",
            draft,
          );
          if (res.profile) {
            setStatus("Saved — matches re-scored.");
            onSaved(res.profile);
          } else {
            setStatus(res.error ?? "Could not save.");
          }
        }}
      >
        Save profile
      </button>
      {status && <p className="muted">{status}</p>}
    </div>
  );
}

function IngestForm({ onIngested }: { onIngested: () => void }) {
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <h2>Ingest an official URL</h2>
      <p className="muted" style={{ margin: 0 }}>
        Paste an official employer job URL. Optionally paste the page HTML to ingest
        without a live request (useful offline or when a site blocks bots).
      </p>
      <label>
        Official job URL
        <input
          placeholder="https://careers.example.com/jobs/123"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label>
        Page HTML (optional)
        <textarea
          placeholder="<html>…</html>"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />
      </label>
      <button
        className="btn"
        disabled={busy || !url}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          const res = await sendJSON<IngestResponse>("/api/ingest", "POST", {
            url,
            html: html.trim() ? html : undefined,
          });
          setResult(res);
          setBusy(false);
          if (res.job) onIngested();
        }}
      >
        {busy ? "Ingesting…" : "Ingest & verify"}
      </button>
      {result?.error && <p className="tag danger">{result.error}</p>}
      {result?.job && result.verification && (
        <div className="item">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{result.job.title}</strong>
            <span className={`tag ${statusClass(result.verification.activeSignal)}`}>
              {result.verification.activeSignal}
            </span>
          </div>
          <p className="muted" style={{ margin: "4px 0" }}>
            {result.job.company} · {result.job.location} · fit {result.job.score} ·{" "}
            {result.isNew ? "new record" : "matched existing record"}
          </p>
          <p className="muted" style={{ margin: 0 }}>{result.verification.evidence}</p>
          {result.evidence?.slice(0, 3).map((e, i) => (
            <blockquote className="evidence" key={i}>
              <strong>{e.field}:</strong> “{e.quote}”
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  isSaved,
  onSave,
}: {
  match: JobView;
  isSaved: boolean;
  onSave: () => void;
}) {
  return (
    <article className="item job">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3>{match.title}</h3>
          <div className="muted">
            {match.company} · {match.location} · {match.posted}
          </div>
        </div>
        <div className="score-badge">
          <span className="metric">{match.score}</span>
          <span className="muted">fit</span>
        </div>
      </div>
      <div className="row">
        <span className={`tag ${statusClass(match.status)}`}>{match.status}</span>
        <span className="pill">Experience: {match.years} yrs</span>
        {match.isStretch && <span className="tag warn">stretch</span>}
        {!match.passedHardFilters && <span className="tag danger">hard filter failed</span>}
      </div>
      <div className="chips">
        {match.matched.map((m) => (
          <span className="chip match" key={m}>
            ✓ {m}
          </span>
        ))}
        {match.missing.map((m) => (
          <span className="chip gap" key={m}>
            ✕ {m}
          </span>
        ))}
        {match.unknowns.map((m) => (
          <span className="chip" key={m}>
            ? {m}
          </span>
        ))}
      </div>
      <blockquote className="evidence">{match.evidence}</blockquote>
      <div className="row">
        <a className="btn secondary" href={match.officialUrl} target="_blank" rel="noreferrer">
          Official listing ↗
        </a>
        <button className="btn" onClick={onSave} disabled={isSaved}>
          {isSaved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </article>
  );
}

function SavedRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: SavedItem;
  onUpdate: (patch: { stage?: SavedStage; resumeVersion?: string | null }) => void;
  onRemove: () => void;
}) {
  return (
    <div className="item">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{item.title}</strong>
          <div className="muted">
            {item.company} · {item.location}
          </div>
        </div>
        <span className={`tag ${statusClass(item.jobStatus)}`}>{item.jobStatus}</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          Stage
          <select
            value={item.stage}
            onChange={(e) => onUpdate({ stage: e.target.value as SavedStage })}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          Résumé
          <input
            placeholder="e.g. automotive-security-v2"
            defaultValue={item.resumeVersion ?? ""}
            onBlur={(e) => onUpdate({ resumeVersion: e.target.value || null })}
          />
        </label>
        <button className="btn secondary" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function DigestPreview() {
  const [items, setItems] = useState<DigestItem[] | null>(null);
  const [corrections, setCorrections] = useState<DigestItem[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Digest preview</h2>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const data = await getJSON<{
              digest: { items: DigestItem[]; corrections: DigestItem[] };
            }>("/api/digest?min=70");
            setItems(data.digest.items);
            setCorrections(data.digest.corrections);
            setBusy(false);
          }}
        >
          {busy ? "Building…" : "Preview digest"}
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Only verified-active jobs at fit ≥ 70 that haven’t been sent. Closed jobs that were
        previously alerted appear as corrections.
      </p>
      {items && items.length === 0 && corrections.length === 0 && (
        <div className="item empty">Nothing new to send — the digest is empty.</div>
      )}
      {items && items.length > 0 && (
        <div className="list">
          {items.map((it) => (
            <div className="item" key={it.jobId}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{it.title}</strong>
                <span className="pill">fit {it.score}</span>
              </div>
              <div className="muted">
                {it.company} · {it.location} · {it.reason}
              </div>
            </div>
          ))}
        </div>
      )}
      {corrections.length > 0 && (
        <>
          <h3 style={{ marginTop: 8 }}>Corrections</h3>
          <div className="list">
            {corrections.map((it) => (
              <div className="item" key={`c-${it.jobId}`}>
                <span className="tag danger">closed</span> {it.title} — {it.company}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
