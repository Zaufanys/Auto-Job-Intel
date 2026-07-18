import { NextResponse } from "next/server";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { computeMatches } from "@/lib/pipeline";
import { toJobView } from "@/lib/view";

export const dynamic = "force-dynamic";

/** All stored jobs, scored against the saved profile, as view models. */
export async function GET() {
  const repo = getRepository();
  await ensureSeeded(repo);

  const prefs = await repo.getPreferences();
  const jobs = await repo.listJobs();
  const matches = await computeMatches(repo, prefs);
  const now = new Date();

  const views = jobs
    .map((job) => toJobView(job, matches.get(job.id), now))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ jobs: views, observedAt: now.toISOString() });
}
