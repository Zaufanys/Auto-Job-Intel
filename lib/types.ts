export type JobStatus = "verified" | "uncertain" | "closed";

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  years: string;
  status: JobStatus;
  score: number;
  officialUrl: string;
  matched: string[];
  missing: string[];
  /** The exact source sentence (or signal) behind the extracted requirement / status. */
  evidence: string;
};
