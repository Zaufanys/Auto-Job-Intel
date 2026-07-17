import { promises as fs } from "node:fs";
import { Repository } from "../lib/repository";
import { ensureSeeded } from "../lib/seed";
import { DATA_FILE } from "../lib/config";

/**
 * `npm run seed` — rebuild the local data store from fixtures.
 * Safe to run repeatedly; it starts from a clean file each time.
 */
async function main() {
  await fs.rm(DATA_FILE, { force: true });
  const repo = Repository.file(DATA_FILE);
  await ensureSeeded(repo, { force: true });
  const jobs = await repo.listJobs();
  const byStatus = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Seeded ${jobs.length} jobs → ${DATA_FILE}`);
  console.log("Status breakdown:", byStatus);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
