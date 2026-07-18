import {
  type NormalizedJob,
  type Preferences,
  type MatchResult,
  type HardFilterResult,
} from "./schema";

/**
 * Deterministic, explainable job matcher.
 *
 * `matchJob` is a pure function: no network, no I/O, no dependencies beyond the
 * shared `./schema` types. It first applies HARD FILTERS (location, remote,
 * seniority, experience). Only jobs that clear every hard filter can earn a
 * high score; failing jobs are capped low so they sink to the bottom of a list.
 *
 * Every conclusion is surfaced in `explanation` so a candidate can see exactly
 * why a posting matched, what is missing (`gaps`), and what could not be
 * determined from the extracted requirements (`unknowns`).
 */

/** Score a job on how well it fits a candidate profile. */
export function matchJob(job: NormalizedJob, prefs: Preferences): MatchResult {
  const req = job.requirements;

  // --- Hard filters -------------------------------------------------------
  const jobIsRemote = req.remote === "remote";
  const prefsAllowRemote = prefs.remote === "remote" || prefs.remote === "any";

  const locationResult = evaluateLocation(job, prefs, jobIsRemote, prefsAllowRemote);
  const remoteResult = evaluateRemote(prefs, req.remote);
  const experienceResult = evaluateExperience(prefs, req.yearsMin);

  // Seniority mirrors the experience decision (both are driven by `yearsMin`);
  // it is reported separately so the explanation lists all four rule slots.
  const seniorityResult: HardFilterResult = {
    rule: "seniority",
    passed: experienceResult.result.passed,
    detail:
      req.yearsMin === null
        ? `Seniority level not stated; treating "${prefs.seniority}" preference as satisfied.`
        : experienceResult.result.passed
          ? `Requires ~${req.yearsMin} yr, compatible with a "${prefs.seniority}" candidate (max ${prefs.maxYears} yr).`
          : `Requires ~${req.yearsMin} yr, above a "${prefs.seniority}" candidate's ceiling of ${prefs.maxYears} yr.`,
  };

  const hardFilters: HardFilterResult[] = [
    locationResult.result,
    seniorityResult,
    experienceResult.result,
    remoteResult.result,
  ];

  const passedHardFilters = hardFilters.every((f) => f.passed);
  const isStretch = experienceResult.isStretch;

  // --- Matches / gaps / unknowns ------------------------------------------
  const prefsSkills = normalizeList(prefs.skills);
  const jobSkills = normalizeList(req.skills);

  const matched: string[] = [];
  const gaps: string[] = [];
  const unknowns: string[] = [];

  // Skill overlap: a prefs skill counts as matched when it appears (as a
  // case-insensitive substring, either direction) in a job-required skill.
  const matchedSkills: string[] = [];
  for (const skill of prefsSkills) {
    if (jobSkills.some((js) => js.value.includes(skill.value) || skill.value.includes(js.value))) {
      matchedSkills.push(skill.original);
      matched.push(`Skill match: ${skill.original}`);
    }
  }

  // Gaps: job-required skills the candidate has not listed in their profile.
  for (const js of jobSkills) {
    if (!prefsSkills.some((ps) => ps.value.includes(js.value) || js.value.includes(ps.value))) {
      gaps.push(`Missing required skill: ${js.original}`);
    }
  }

  // Role-family alignment: any preferred role family named in the title or
  // description is a strong positive signal.
  const haystack = `${job.title} ${job.descriptionText}`.toLowerCase();
  const matchedFamilies: string[] = [];
  for (const family of prefs.roleFamilies) {
    const token = family.trim().toLowerCase();
    if (token.length > 0 && haystack.includes(token)) {
      matchedFamilies.push(family);
      matched.push(`Role-family match: ${family}`);
    }
  }

  // Unknowns: fields the extractor could not determine.
  if (req.yearsMin === null) {
    unknowns.push("Years of experience not stated in the posting.");
  }
  if (req.remote === "unknown") {
    unknowns.push("Remote policy unknown for this posting.");
  }
  if (req.location === null || req.location.trim() === "") {
    unknowns.push("Structured location not confirmed; matched on the display location only.");
  }
  if (req.skills.length === 0) {
    unknowns.push("No required skills were extracted; skill overlap could not be assessed.");
  }
  if (req.confidence < 0.5) {
    unknowns.push(`Low extraction confidence (${req.confidence.toFixed(2)}); requirements may be incomplete.`);
  }

  if (isStretch) {
    gaps.push(
      `Stretch role: requires ~${req.yearsMin} yr, above your ${prefs.maxYears}-yr target.`,
    );
  }

  // On-target experience: a stated minimum at or below the candidate's cap.
  const experienceOnTarget =
    req.yearsMin !== null && !isStretch && req.yearsMin <= prefs.maxYears;

  // --- Score --------------------------------------------------------------
  const score = computeScore({
    passedHardFilters,
    isStretch,
    experienceOnTarget,
    matchedSkillCount: matchedSkills.length,
    jobSkillCount: jobSkills.length,
    gapCount: gaps.length,
    matchedFamilyCount: matchedFamilies.length,
    hasRoleFamilyPref: prefs.roleFamilies.length > 0,
  });

  return {
    jobId: job.id,
    score,
    passedHardFilters,
    isStretch,
    explanation: {
      hardFilters,
      matched,
      gaps,
      unknowns,
    },
  };
}

// ---------------------------------------------------------------------------
// Hard-filter helpers
// ---------------------------------------------------------------------------

function evaluateLocation(
  job: NormalizedJob,
  prefs: Preferences,
  jobIsRemote: boolean,
  prefsAllowRemote: boolean,
): { result: HardFilterResult } {
  const jobLocation = job.location.toLowerCase();
  const hit = prefs.locations.find(
    (loc) => loc.trim().length > 0 && jobLocation.includes(loc.trim().toLowerCase()),
  );

  if (hit) {
    return {
      result: {
        rule: "location",
        passed: true,
        detail: `Job location "${job.location}" matches your preferred location "${hit}".`,
      },
    };
  }

  if (jobIsRemote && prefsAllowRemote) {
    return {
      result: {
        rule: "location",
        passed: true,
        detail: `Job is remote and your preferences allow remote work, so location is satisfied.`,
      },
    };
  }

  return {
    result: {
      rule: "location",
      passed: false,
      detail: `Job location "${job.location}" is not in your preferred locations [${prefs.locations.join(", ")}] and the role is not remote-eligible.`,
    },
  };
}

function evaluateRemote(
  prefs: Preferences,
  jobRemote: NormalizedJob["requirements"]["remote"],
): { result: HardFilterResult } {
  if (prefs.remote === "any") {
    return {
      result: {
        rule: "remote",
        passed: true,
        detail: `You accept any work arrangement; the job's "${jobRemote}" policy is fine.`,
      },
    };
  }

  if (jobRemote === "unknown") {
    return {
      result: {
        rule: "remote",
        passed: true,
        detail: `Remote policy is unknown; passing the filter but this could not be confirmed.`,
      },
    };
  }

  if (jobRemote === prefs.remote) {
    return {
      result: {
        rule: "remote",
        passed: true,
        detail: `Job's "${jobRemote}" arrangement matches your "${prefs.remote}" preference.`,
      },
    };
  }

  return {
    result: {
      rule: "remote",
      passed: false,
      detail: `Job's "${jobRemote}" arrangement does not match your "${prefs.remote}" preference.`,
    },
  };
}

function evaluateExperience(
  prefs: Preferences,
  yearsMin: number | null,
): { result: HardFilterResult; isStretch: boolean } {
  // Unknown years: pass the hard filter, but the caller records an "unknown".
  if (yearsMin === null) {
    return {
      result: {
        rule: "experience",
        passed: true,
        detail: `Minimum years of experience not stated; passing the filter as unknown.`,
      },
      isStretch: false,
    };
  }

  if (yearsMin <= prefs.maxYears) {
    return {
      result: {
        rule: "experience",
        passed: true,
        detail: `Requires ${yearsMin} yr, within your ${prefs.maxYears}-yr maximum.`,
      },
      isStretch: false,
    };
  }

  // Above the cap but within the stretch window.
  if (prefs.allowStretch && yearsMin <= prefs.maxYears + 2) {
    return {
      result: {
        rule: "experience",
        passed: true,
        detail: `Requires ${yearsMin} yr, above your ${prefs.maxYears}-yr maximum but within the +2 stretch window.`,
      },
      isStretch: true,
    };
  }

  return {
    result: {
      rule: "experience",
      passed: false,
      detail: prefs.allowStretch
        ? `Requires ${yearsMin} yr, beyond your ${prefs.maxYears}-yr maximum and the +2 stretch window.`
        : `Requires ${yearsMin} yr, above your ${prefs.maxYears}-yr maximum (stretch roles disabled).`,
    },
    isStretch: false,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type ScoreInputs = {
  passedHardFilters: boolean;
  isStretch: boolean;
  experienceOnTarget: boolean;
  matchedSkillCount: number;
  jobSkillCount: number;
  gapCount: number;
  matchedFamilyCount: number;
  hasRoleFamilyPref: boolean;
};

/**
 * Map the match signals onto a 0..100 integer.
 *
 * Jobs that fail a hard filter are capped at 40 so they always rank below any
 * viable posting. Passing jobs start from a base and gain points for skill
 * coverage, role-family alignment, and on-target experience; they lose points
 * for stretch experience and unmet required skills (softly, and capped — early
 * career postings list many "nice to have" skills).
 */
function computeScore(inputs: ScoreInputs): number {
  if (!inputs.passedHardFilters) {
    // Failing jobs get a small, gap-scaled score, hard-capped at 40.
    const residual = Math.max(0, 20 - inputs.gapCount * 3);
    return clampInt(residual, 0, 40);
  }

  let score = 55; // base for a viable posting

  // Reward skill coverage: of the skills THIS job asks for, how many does the
  // candidate already list? (Dividing by job skills, not the candidate's whole
  // skill set, so a broad profile isn't penalized.)
  if (inputs.jobSkillCount > 0) {
    const coverage = inputs.matchedSkillCount / inputs.jobSkillCount;
    score += Math.round(coverage * 28); // up to +28 for full coverage
  } else if (inputs.matchedSkillCount > 0) {
    score += 10;
  }

  // Reward role-family alignment.
  if (inputs.matchedFamilyCount > 0) {
    score += 12;
  } else if (inputs.hasRoleFamilyPref) {
    // Wanted a role family but found none named in the posting.
    score -= 5;
  }

  // Reward a posting squarely in the candidate's experience band.
  if (inputs.experienceOnTarget) {
    score += 8;
  }

  // Penalize unmet required skills gently, and cap the total penalty so a long
  // wish-list of skills can't sink an otherwise strong, on-target match.
  const skillGaps = inputs.isStretch ? inputs.gapCount - 1 : inputs.gapCount;
  score -= Math.min(12, Math.max(0, skillGaps) * 3);

  // Stretch roles are viable but riskier.
  if (inputs.isStretch) {
    score -= 12;
  }

  return clampInt(score, 0, 100);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

type NormalizedToken = { original: string; value: string };

/** Trim, lowercase, and drop empties while keeping the original label. */
function normalizeList(list: string[]): NormalizedToken[] {
  const out: NormalizedToken[] = [];
  for (const item of list) {
    const value = item.trim().toLowerCase();
    if (value.length > 0) {
      out.push({ original: item.trim(), value });
    }
  }
  return out;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}
