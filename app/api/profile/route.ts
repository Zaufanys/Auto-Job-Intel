import { NextResponse } from "next/server";
import { getRepository } from "@/lib/config";
import { ensureSeeded } from "@/lib/seed";
import { preferencesSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

/** Read the saved search profile. */
export async function GET() {
  const repo = getRepository();
  await ensureSeeded(repo);
  return NextResponse.json({ profile: await repo.getPreferences() });
}

/** Update the search profile. Body is validated and defaulted via Zod. */
export async function PUT(request: Request) {
  const repo = getRepository();
  await ensureSeeded(repo);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const saved = await repo.setPreferences(parsed.data);
  return NextResponse.json({ profile: saved });
}
