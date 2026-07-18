import { NextResponse } from "next/server";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { computeMatches } from "@/lib/pipeline";
import { toJobView } from "@/lib/view";

export const dynamic = "force-dynamic";

/**
 * Ranked matches for the saved profile.
 * Query params: `min` (minimum score), `verifiedOnly` ("1" to require verified).
 */
export async function GET(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);

  const url = new URL(request.url);
  const min = Number(url.searchParams.get("min") ?? "0");
  const verifiedOnly = url.searchParams.get("verifiedOnly") === "1";

  const prefs = await repo.getPreferences();
  const jobs = await repo.listJobs();
  const matches = await computeMatches(repo, prefs);
  const now = new Date();

  const views = jobs
    .map((job) => toJobView(job, matches.get(job.id), now))
    .filter((v) => v.score >= min && (!verifiedOnly || v.status === "verified"))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ matches: views, profile: prefs });
}
