import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { ingestUrl } from "@/lib/pipeline";
import { makeRawFetch, type FetchFn } from "@/lib/fetcher";
import { toJobView } from "@/lib/view";
import { computeMatches } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  url: z.string().url(),
  /** Optional pre-fetched HTML — ingest without a live request (paste a posting). */
  html: z.string().optional(),
});

/**
 * Manual official-URL ingestion. Runs the full pipeline (fetch → parse →
 * dedupe → verify → store) and returns the normalized job, its verification
 * evidence, and how it matches the saved profile.
 */
export async function POST(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a valid official job URL.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { url, html } = parsed.data;
  const fetchFn: FetchFn | undefined = html
    ? async (u) => makeRawFetch({ url: u, finalUrl: u, body: html })
    : undefined;

  const result = await ingestUrl(repo, url, { fetchFn });
  if (!result) {
    return NextResponse.json(
      {
        error:
          "Could not extract a job posting from that URL. It may require a login, block automated access, or not be a job page.",
      },
      { status: 422 },
    );
  }

  const prefs = await repo.getPreferences();
  const matches = await computeMatches(repo, prefs);
  const view = toJobView(result.job, matches.get(result.job.id));

  return NextResponse.json({
    job: view,
    verification: result.verification,
    evidence: result.job.requirements.evidence,
    changes: result.changes,
    isNew: result.isNew,
  });
}
