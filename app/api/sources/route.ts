import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { sourceSchema } from "@/lib/schema";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** List registered official job sources. */
export async function GET() {
  const repo = getRepository();
  await ensureSeeded(repo);
  return NextResponse.json({ sources: await repo.listSources() });
}

const createSourceSchema = z.object({
  company: z.string().min(1),
  careersUrl: z.string().url(),
  sourceType: z.enum(["structured-data", "feed", "manual-url"]).default("manual-url"),
  active: z.boolean().default(true),
});

/** Register a new official source. */
export async function POST(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid source.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const source = sourceSchema.parse({ id: randomUUID(), ...parsed.data });
  await repo.upsertSource(source);
  return NextResponse.json({ source }, { status: 201 });
}
