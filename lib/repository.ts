import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type NormalizedJob,
  type Source,
  type Verification,
  type ChangeEntry,
  type SavedJob,
  type Notification,
  type Preferences,
  preferencesSchema,
} from "./schema";

/**
 * Persistence layer.
 *
 * The whole app runs on the default file/in-memory `Repository` with zero
 * external services. A Supabase-backed implementation of this same interface
 * can be dropped in later (see `docs/ARCHITECTURE.md`) without touching the
 * pipeline or API routes.
 */

export type Store = {
  sources: Source[];
  jobs: NormalizedJob[];
  verifications: Verification[];
  changes: ChangeEntry[];
  saved: SavedJob[];
  notifications: Notification[];
  preferences: Preferences;
};

function emptyStore(): Store {
  return {
    sources: [],
    jobs: [],
    verifications: [],
    changes: [],
    saved: [],
    notifications: [],
    preferences: preferencesSchema.parse({}),
  };
}

interface Backend {
  load(): Promise<Store>;
  save(store: Store): Promise<void>;
}

/** In-memory backend — used by tests and as a fallback. */
class MemoryBackend implements Backend {
  private store: Store;
  constructor(seed?: Partial<Store>) {
    this.store = { ...emptyStore(), ...seed };
  }
  async load(): Promise<Store> {
    return this.store;
  }
  async save(store: Store): Promise<void> {
    this.store = store;
  }
}

/** JSON-file backend — the default for the running app. */
class FileBackend implements Backend {
  constructor(private readonly file: string) {}
  async load(): Promise<Store> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) };
    } catch {
      return emptyStore();
    }
  }
  async save(store: Store): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(store, null, 2), "utf8");
  }
}

export class Repository {
  private constructor(private readonly backend: Backend) {}

  static memory(seed?: Partial<Store>): Repository {
    return new Repository(new MemoryBackend(seed));
  }

  static file(file: string): Repository {
    return new Repository(new FileBackend(file));
  }

  private async mutate<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
    const store = await this.backend.load();
    const result = await fn(store);
    await this.backend.save(store);
    return result;
  }

  // --- Preferences (single profile) ---
  async getPreferences(): Promise<Preferences> {
    return (await this.backend.load()).preferences;
  }
  async setPreferences(prefs: Preferences): Promise<Preferences> {
    return this.mutate((store) => {
      store.preferences = prefs;
      return store.preferences;
    });
  }

  // --- Sources ---
  async listSources(): Promise<Source[]> {
    return (await this.backend.load()).sources;
  }
  async upsertSource(source: Source): Promise<Source> {
    return this.mutate((store) => {
      const i = store.sources.findIndex((s) => s.id === source.id);
      if (i >= 0) store.sources[i] = source;
      else store.sources.push(source);
      return source;
    });
  }

  // --- Jobs ---
  async listJobs(): Promise<NormalizedJob[]> {
    return (await this.backend.load()).jobs;
  }
  async getJob(id: string): Promise<NormalizedJob | undefined> {
    return (await this.backend.load()).jobs.find((j) => j.id === id);
  }
  async findJobByCanonicalUrl(url: string): Promise<NormalizedJob | undefined> {
    return (await this.backend.load()).jobs.find((j) => j.canonicalUrl === url);
  }
  async putJob(job: NormalizedJob): Promise<NormalizedJob> {
    return this.mutate((store) => {
      const i = store.jobs.findIndex((j) => j.id === job.id);
      if (i >= 0) store.jobs[i] = job;
      else store.jobs.push(job);
      return job;
    });
  }

  // --- Verifications ---
  async addVerification(v: Verification): Promise<Verification> {
    return this.mutate((store) => {
      store.verifications.push(v);
      return v;
    });
  }
  async listVerifications(jobId?: string): Promise<Verification[]> {
    const all = (await this.backend.load()).verifications;
    return jobId ? all.filter((v) => v.jobId === jobId) : all;
  }

  // --- Change history ---
  async addChanges(changes: ChangeEntry[]): Promise<void> {
    if (changes.length === 0) return;
    await this.mutate((store) => {
      store.changes.push(...changes);
    });
  }
  async listChanges(jobId?: string): Promise<ChangeEntry[]> {
    const all = (await this.backend.load()).changes;
    return jobId ? all.filter((c) => c.jobId === jobId) : all;
  }

  // --- Saved jobs ---
  async listSaved(): Promise<SavedJob[]> {
    return (await this.backend.load()).saved;
  }
  async putSaved(saved: SavedJob): Promise<SavedJob> {
    return this.mutate((store) => {
      const i = store.saved.findIndex((s) => s.id === saved.id);
      if (i >= 0) store.saved[i] = saved;
      else store.saved.push(saved);
      return saved;
    });
  }
  async removeSaved(id: string): Promise<void> {
    await this.mutate((store) => {
      store.saved = store.saved.filter((s) => s.id !== id);
    });
  }

  // --- Notifications (idempotency ledger) ---
  async hasNotification(dedupeKey: string): Promise<boolean> {
    return (await this.backend.load()).notifications.some(
      (n) => n.dedupeKey === dedupeKey,
    );
  }
  async addNotification(n: Notification): Promise<Notification> {
    return this.mutate((store) => {
      if (!store.notifications.some((x) => x.dedupeKey === n.dedupeKey)) {
        store.notifications.push(n);
      }
      return n;
    });
  }
  async listNotifications(): Promise<Notification[]> {
    return (await this.backend.load()).notifications;
  }
}
