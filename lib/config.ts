import path from "node:path";
import { Repository } from "./repository";
import { type Preferences, preferencesSchema } from "./schema";

/** Where the file-backed repository persists (override with AUTOJOB_DATA_FILE). */
export const DATA_FILE =
  process.env.AUTOJOB_DATA_FILE ??
  path.join(process.cwd(), ".data", "store.json");

/** The default Michigan early-career profile the demo ships with. */
export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({
  locations: ["Michigan", "MI", "Dearborn", "Detroit", "Warren", "Novi", "Ann Arbor"],
  remote: "any",
  roleFamilies: [
    "automotive security",
    "embedded software",
    "validation",
    "cyber defense",
    "firmware",
  ],
  skills: [
    "python",
    "c",
    "c++",
    "can",
    "iso/sae 21434",
    "rtos",
    "wireshark",
    "splunk",
    "reverse engineering",
  ],
  seniority: "early",
  maxYears: 3,
  allowStretch: true,
  resumeText:
    "Early-career engineer focused on automotive cybersecurity and embedded software. " +
    "Experience with Python, C/C++, CAN/OBD-II, ISO/SAE 21434 concepts, and SOC tooling (Wireshark, Splunk).",
});

let singleton: Repository | null = null;

/** Process-wide file-backed repository used by the API routes. */
export function getRepository(): Repository {
  if (!singleton) singleton = Repository.file(DATA_FILE);
  return singleton;
}
