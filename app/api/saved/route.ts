import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { savedStageSchema, type SavedJob } from "@/lib/schema";

export const dynamic = "force-dynamic";

/** List saved jobs joined with their job title/company for display. */
export async function GET() {
  const repo = getRepository();
  await ensureSeeded(repo);
  const [saved, jobs] = await Promise.all([repo.listSaved(), repo.listJobs()]);
  const items = saved
    .map((s) => {
      const job = jobs.find((j) => j.id === s.jobId);
      return job
        ? {
            ...s,
            title: job.title,
            company: job.company,
            location: job.location,
            officialUrl: job.canonicalUrl,
            jobStatus: job.status,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return NextResponse.json({ saved: items });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  jobId: z.string(),
  stage: savedStageSchema.optional(),
  resumeVersion: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Save a job or update its pipeline stage / resume version / notes. */
export async function POST(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid saved job.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const job = await repo.getJob(parsed.data.jobId);
  if (!job) {
    return NextResponse.json({ error: "Unknown jobId." }, { status: 404 });
  }

  const existing = (await repo.listSaved()).find(
    (s) => s.id === parsed.data.id || s.jobId === parsed.data.jobId,
  );
  const now = new Date().toISOString();

  const saved: SavedJob = {
    id: existing?.id ?? randomUUID(),
    jobId: parsed.data.jobId,
    stage: parsed.data.stage ?? existing?.stage ?? "saved",
    resumeVersion:
      parsed.data.resumeVersion ?? existing?.resumeVersion ?? null,
    notes: parsed.data.notes ?? existing?.notes ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await repo.putSaved(saved);
  return NextResponse.json({ saved }, { status: existing ? 200 : 201 });
}

/** Remove a saved job by `?id=`. */
export async function DELETE(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  await repo.removeSaved(id);
  return NextResponse.json({ ok: true });
}
