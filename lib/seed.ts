import { promises as fs } from "node:fs";
import path from "node:path";
import { Repository } from "./repository";
import { makeRawFetch } from "./fetcher";
import { ingestFetch } from "./pipeline";
import { DEFAULT_PREFERENCES } from "./config";
import { sourceSchema, type Source } from "./schema";

/**
 * Seed data — official-style fixtures the demo ships with so the app has
 * something to show on first run. Fixtures live in `/fixtures` and are
 * ingested through the exact same pipeline a live fetch would use.
 */

type SeedEntry = {
  fixture: string;
  company: string;
  url: string;
};

const SEED: SeedEntry[] = [
  {
    fixture: "product-cybersecurity-engineer.html",
    company: "Example Mobility",
    url: "https://careers.example-mobility.com/jobs/product-cybersecurity-engineer",
  },
  {
    fixture: "embedded-validation-engineer.html",
    company: "Example Automotive",
    url: "https://jobs.example-automotive.com/embedded-validation-engineer",
  },
  {
    fixture: "cyber-defense-analyst.html",
    company: "Example Enterprise",
    url: "https://careers.example-enterprise.com/cyber-defense-analyst",
  },
  {
    fixture: "closed-penetration-tester.html",
    company: "Example Labs",
    url: "https://careers.example-labs.com/automotive-penetration-tester",
  },
];

function fixturesDir(): string {
  return path.join(process.cwd(), "fixtures");
}

/** Populate the repository from fixtures if it is empty (or when forced). */
export async function ensureSeeded(
  repo: Repository,
  opts: { force?: boolean; now?: Date } = {},
): Promise<void> {
  const now = opts.now ?? new Date("2026-07-15T12:00:00.000Z");
  const jobs = await repo.listJobs();
  if (jobs.length > 0 && !opts.force) return;

  await repo.setPreferences(DEFAULT_PREFERENCES);

  for (const [index, entry] of SEED.entries()) {
    const source: Source = sourceSchema.parse({
      id: `seed-${index + 1}`,
      company: entry.company,
      careersUrl: entry.url,
      sourceType: "structured-data",
      active: true,
    });
    await repo.upsertSource(source);

    const body = await fs.readFile(
      path.join(fixturesDir(), entry.fixture),
      "utf8",
    );
    const raw = makeRawFetch({
      url: entry.url,
      finalUrl: entry.url,
      body,
      fetchedAt: now.toISOString(),
    });
    await ingestFetch(repo, source, raw, now);
  }
}
