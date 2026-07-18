import type {
  EvidenceSpan,
  JobRequirements,
  ParsedPosting,
  RawFetch,
  Source,
} from "./schema";

/**
 * Job posting parser.
 *
 * Pure, dependency-free extraction of a `ParsedPosting` from a raw HTML fetch.
 * The parser prefers schema.org `JobPosting` JSON-LD and falls back to lightweight
 * HTML heuristics. Every extracted requirement carries an `EvidenceSpan` so any
 * downstream claim can be traced back to the exact source sentence.
 */

/** Curated skill tokens. `match` is scanned case-insensitively; `label` is the nice casing. */
const SKILL_TOKENS: ReadonlyArray<{ match: string; label: string }> = [
  { match: "python", label: "Python" },
  { match: "c++", label: "C++" },
  { match: "can", label: "CAN" },
  { match: "obd-ii", label: "OBD-II" },
  { match: "iso/sae 21434", label: "ISO/SAE 21434" },
  { match: "rtos", label: "RTOS" },
  { match: "wireshark", label: "Wireshark" },
  { match: "splunk", label: "Splunk" },
  { match: "reverse engineering", label: "reverse engineering" },
  { match: "capl", label: "CAPL" },
  { match: "firmware", label: "firmware" },
  { match: "penetration testing", label: "penetration testing" },
  { match: "tara", label: "TARA" },
  { match: "embedded", label: "embedded" },
  { match: "battery management", label: "battery management" },
  { match: "aspice", label: "ASPICE" },
  // `C` is handled specially below to avoid matching every stray letter.
];

const BASIC_ENTITIES: ReadonlyArray<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&#39;/g, "'"],
  [/&quot;/g, '"'],
];

/** Strip HTML tags, decode a few basic entities, and collapse whitespace. */
function stripHtml(html: string): string {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    // Turn block-level breaks into spaces so sentences don't run together.
    .replace(/<\/(p|div|li|h[1-6]|br|section|article)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  for (const [pattern, replacement] of BASIC_ENTITIES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Split text into rough sentences for evidence quotes. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Find the first sentence matching `pattern`, else null. */
function sentenceFor(text: string, pattern: RegExp): string | null {
  for (const sentence of sentences(text)) {
    if (pattern.test(sentence)) return sentence;
  }
  return null;
}

/** Extract and parse every JSON-LD block, flattening arrays and `@graph`. */
function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptRe =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && Array.isArray((item as any)["@graph"])) {
          blocks.push(...(item as any)["@graph"]);
        } else {
          blocks.push(item);
        }
      }
    } catch {
      // Ignore malformed blocks; some sites ship broken JSON-LD.
    }
  }
  return blocks;
}

/** True when a JSON-LD node's `@type` is or includes "JobPosting". */
function isJobPosting(node: any): boolean {
  const type = node?.["@type"];
  if (!type) return false;
  return Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting";
}

/** Compose "Locality, Region" from a schema.org address (or nested jobLocation). */
function composeLocation(jobLocation: any): string | null {
  if (!jobLocation) return null;
  const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
  const address = loc?.address ?? loc;
  if (!address || typeof address !== "object") return null;
  const locality = address.addressLocality;
  const region = address.addressRegion;
  if (locality && region) return `${locality}, ${region}`;
  return locality ?? region ?? null;
}

/** Normalize an `identifier` (string or PropertyValue) to a string, else null. */
function extractIdentifier(identifier: any): string | null {
  if (!identifier) return null;
  if (typeof identifier === "string") return identifier;
  if (typeof identifier === "object" && identifier.value != null) {
    return String(identifier.value);
  }
  return null;
}

/** Detect a years-of-experience range from free text. Returns min/max and the matched sentence. */
function extractYears(
  text: string,
): { min: number | null; max: number | null; quote: string } | null {
  const candidates: Array<{ re: RegExp; pick: (m: RegExpMatchArray) => [number, number | null] }> = [
    // "0-3 years", "2–5 years", "3 to 5 years"
    {
      re: /(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*\+?\s*years?/i,
      pick: (m) => [Number(m[1]), Number(m[2])],
    },
    // "minimum of 3 years", "at least 2 years", "minimum 3 years"
    {
      re: /(?:minimum(?:\s+of)?|at\s+least)\s+(\d+)\s*\+?\s*years?/i,
      pick: (m) => [Number(m[1]), null],
    },
    // "2+ years", "3 or more years"
    {
      re: /(\d+)\s*(?:\+|\s+or\s+more)\s*years?/i,
      pick: (m) => [Number(m[1]), null],
    },
    // Bare "3 years of experience"
    {
      re: /(\d+)\s*years?\s+of\s+(?:experience|relevant)/i,
      pick: (m) => [Number(m[1]), Number(m[1])],
    },
  ];
  for (const { re, pick } of candidates) {
    const m = text.match(re);
    if (m) {
      const [min, max] = pick(m);
      const quote = sentenceFor(text, re) ?? m[0];
      return { min, max, quote };
    }
  }
  return null;
}

/** Scan for curated skills; return nice-cased labels in first-seen order. */
function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const { match, label } of SKILL_TOKENS) {
    if (lower.includes(match) && !found.includes(label)) {
      found.push(label);
    }
  }
  // Standalone "C" (word boundary, not part of C++/C#) — kept conservative.
  if (/\bC\b(?!\+\+|#)/.test(text) && !found.includes("C")) {
    found.push("C");
  }
  return found;
}

/** Detect education requirements and the sentence they came from. */
function extractEducation(text: string): { values: string[]; quote: string | null } {
  const values: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/bachelor/i, "Bachelor's degree"],
    [/\bb\.?s\.?\b/i, "B.S."],
    [/master/i, "Master's degree"],
    [/\bm\.?s\.?\b/i, "M.S."],
    [/degree\s+in/i, "degree"],
  ];
  let quote: string | null = null;
  for (const [re, label] of patterns) {
    if (re.test(text)) {
      if (!values.includes(label)) values.push(label);
      if (!quote) quote = sentenceFor(text, re);
    }
  }
  return { values, quote };
}

/** Detect a clearance / citizenship requirement. */
function extractClearance(text: string): { value: string; quote: string } | null {
  const re = /(security\s+clearance|us\s+citizen(?:ship)?|clearance)/i;
  const quote = sentenceFor(text, re);
  const m = text.match(re);
  if (m && quote) return { value: quote, quote };
  return null;
}

/** Infer remote posture from keywords. */
function detectRemote(text: string): "onsite" | "hybrid" | "remote" | "unknown" {
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return "hybrid";
  if (/\bon-?site\b|\bin-office\b|\bon\s+site\b/.test(lower)) return "onsite";
  if (/\bremote\b|\bwork\s+from\s+home\b|\bfully\s+remote\b/.test(lower)) return "remote";
  return "unknown";
}

/** Build the requirements block with evidence spans. */
function buildRequirements(
  descriptionText: string,
  location: string | null,
  source: string,
  fromJsonLd: boolean,
): JobRequirements {
  const evidence: EvidenceSpan[] = [];

  const years = extractYears(descriptionText);
  if (years) {
    evidence.push({ field: "years", quote: years.quote, source });
  }

  const skills = extractSkills(descriptionText);
  if (skills.length > 0) {
    const skillQuote =
      sentenceFor(descriptionText, new RegExp(escapeRe(skills[0]), "i")) ??
      skills.join(", ");
    evidence.push({ field: "skills", quote: skillQuote, source });
  }

  const education = extractEducation(descriptionText);
  if (education.values.length > 0) {
    evidence.push({
      field: "education",
      quote: education.quote ?? education.values.join(", "),
      source,
    });
  }

  const clearance = extractClearance(descriptionText);
  if (clearance) {
    evidence.push({ field: "clearance", quote: clearance.quote, source });
  }

  if (location) {
    const locSentence = sentenceFor(descriptionText, new RegExp(escapeRe(location), "i"));
    evidence.push({ field: "location", quote: locSentence ?? location, source });
  }

  const remote = detectRemote(descriptionText);

  // Confidence: JSON-LD + years is strongest; JSON-LD alone next; heuristic weakest.
  let confidence: number;
  if (fromJsonLd) {
    confidence = years ? 0.9 : 0.7;
  } else {
    confidence = 0.5;
  }

  return {
    yearsMin: years ? years.min : null,
    yearsMax: years ? years.max : null,
    education: education.values,
    skills,
    clearance: clearance ? clearance.value : null,
    location,
    remote,
    evidence,
    confidence,
  };
}

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the first `<h1>` text, else the `<title>`, else null. */
function extractHeuristicTitle(html: string): string | null {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = stripHtml(h1[1]);
    if (text) return text;
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    const text = stripHtml(title[1]);
    if (text) return text;
  }
  return null;
}

/**
 * Parse a raw HTML fetch into a `ParsedPosting`.
 *
 * Prefers schema.org JobPosting JSON-LD, falling back to HTML heuristics.
 * Returns `null` only if no title can be determined.
 */
export function parseJob(fetch: RawFetch, source: Source): ParsedPosting | null {
  const html = fetch.body ?? "";
  const evidenceSource = fetch.finalUrl;

  const jobPosting = extractJsonLd(html).find(isJobPosting) as any | undefined;

  if (jobPosting) {
    const title =
      typeof jobPosting.title === "string" && jobPosting.title.trim()
        ? stripHtml(jobPosting.title)
        : extractHeuristicTitle(html);
    if (!title) return null;

    const company =
      jobPosting.hiringOrganization?.name && String(jobPosting.hiringOrganization.name).trim()
        ? String(jobPosting.hiringOrganization.name)
        : source.company;

    const location = composeLocation(jobPosting.jobLocation);

    const postedAt =
      typeof jobPosting.datePosted === "string" && jobPosting.datePosted.trim()
        ? jobPosting.datePosted
        : null;

    const employmentType =
      jobPosting.employmentType != null
        ? Array.isArray(jobPosting.employmentType)
          ? jobPosting.employmentType.join(", ")
          : String(jobPosting.employmentType)
        : null;

    const externalId = extractIdentifier(jobPosting.identifier);

    // Description plus any structured requirement text feeds the extractors.
    const descriptionText = stripHtml(String(jobPosting.description ?? ""));
    const requirementText = [
      descriptionText,
      typeof jobPosting.experienceRequirements === "string"
        ? stripHtml(jobPosting.experienceRequirements)
        : "",
      typeof jobPosting.educationRequirements === "string"
        ? stripHtml(jobPosting.educationRequirements)
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    const canonicalUrl =
      typeof jobPosting.url === "string" && jobPosting.url.trim()
        ? jobPosting.url
        : fetch.finalUrl;

    const requirements = buildRequirements(requirementText, location, evidenceSource, true);

    return {
      externalId,
      canonicalUrl,
      title,
      company,
      location: location ?? "",
      postedAt,
      employmentType,
      descriptionText,
      requirements,
    };
  }

  // Heuristic fallback: no JSON-LD JobPosting present.
  const title = extractHeuristicTitle(html);
  if (!title) return null;

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const descriptionText = stripHtml(bodyMatch ? bodyMatch[1] : html);

  // Look for a "City, ST" pattern in the text or a location meta tag.
  const metaLoc = html.match(
    /<meta\b[^>]*(?:name|property)=["'][^"']*location[^"']*["'][^>]*content=["']([^"']+)["']/i,
  );
  const cityState = descriptionText.match(/\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?),\s*([A-Z]{2})\b/);
  const location = metaLoc ? metaLoc[1] : cityState ? cityState[0] : null;

  const requirements = buildRequirements(descriptionText, location, evidenceSource, false);

  return {
    externalId: null,
    canonicalUrl: fetch.finalUrl,
    title,
    company: source.company,
    location: location ?? "",
    postedAt: null,
    employmentType: null,
    descriptionText,
    requirements,
  };
}
