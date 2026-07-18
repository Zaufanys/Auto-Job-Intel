import { NextResponse } from "next/server";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { generateDigest } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * Preview or send the digest for the saved profile.
 * `?min=` sets the fit threshold; `?commit=1` records notifications so the
 * next run is idempotent (default is a non-committing preview).
 */
export async function GET(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);

  const url = new URL(request.url);
  const min = url.searchParams.get("min");
  const commit = url.searchParams.get("commit") === "1";

  const prefs = await repo.getPreferences();
  const digest = await generateDigest(repo, prefs, {
    minScore: min ? Number(min) : undefined,
    commit,
  });

  return NextResponse.json({ digest, committed: commit });
}
