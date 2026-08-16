/**
 * PRD Quality Validator (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-129, FR-4)
 *
 * Heuristic post-insert scorer for PRDs created via inline mode. Checks the
 * same four rubric dimensions used by the Russian Judge (see scripts/prd/config.js
 * -> PRD_QUALITY_RUBRIC_CRITERIA) without a second LLM round-trip.
 *
 * Returns a deterministic 0-100 weighted score plus a per-dimension breakdown,
 * so the caller can log structured JSON and pick an enforcement action:
 *   - 'off'    — no-op (default, preserves legacy behavior)
 *   - 'warn'   — print the breakdown, exit 0
 *   - 'block'  — print the breakdown, exit non-zero
 *
 * The validator is pure / side-effect free. Enforcement decisions live in the
 * caller (scripts/prd/index.js).
 */

const PLACEHOLDER_RE = /\b(tbd|to be defined|to be determined|will be determined|placeholder|xxx|fixme)\b/i;
const DEFAULT_PASS_THRESHOLD = 70;

/**
 * PAT-LES-e6ebbba78e2d (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143), FR-5: an acceptance
 * criterion asserting an absence ("no other X exists") is as unverified as one asserting a
 * presence, unless the PRD states HOW the absence was checked. Warn-only by design (see
 * scanAbsenceClaims below) -- it must never affect scoreRequirementsDepth or block PRD save,
 * only prompt the author to state a verification method.
 *
 * Phrase list refined against 7920 real acceptance_criteria strings in the live DB (TESTING
 * sub-agent prospective review, evidence row 766d71cd-b6f1-432c-8529-c5055f495e7f):
 *   - "no other" (15 real hits, low false-positive) -- kept.
 *   - "only implementation" (4/4 hits were false positives, all "<word>-only implementation"
 *     compounds like "a route-only implementation") -- anchored with a negative lookbehind so
 *     a hyphenated qualifier no longer matches.
 *   - "does not exist elsewhere" (0 real hits) -- dropped as dead weight.
 *   - "the only" / "sole" / "nowhere else" -- the real recall gap TESTING found (52/12/1 real
 *     hits respectively for phrasing this SD's original draft list missed entirely) -- added.
 * Substring-redundancy audit: disjoint from PLACEHOLDER_RE; "the only" already covers "the
 * only implementation", so the lookbehind-anchored alternative only earns its keep for
 * non-"the"-preceded phrasing (e.g. "only implementation of X").
 */
const ABSENCE_CLAIM_RE = /\b(no other|the only|nowhere else)\b|\bsole\b|(?<![-\w])only\s+implementation\b/i;

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'object') return [value];
  return [];
}

function hasPlaceholderText(value) {
  if (!value) return false;
  const flat = typeof value === 'string' ? value : JSON.stringify(value);
  return PLACEHOLDER_RE.test(flat);
}

function scoreRequirementsDepth(prd) {
  const frs = coerceArray(prd.functional_requirements);
  const trs = coerceArray(prd.technical_requirements);
  const ac = coerceArray(prd.acceptance_criteria);

  const reasons = [];
  let score = 10;

  if (frs.length < 5) {
    score -= 4;
    reasons.push(`functional_requirements=${frs.length} (need >=5)`);
  }
  if (trs.length < 3) {
    score -= 3;
    reasons.push(`technical_requirements=${trs.length} (need >=3)`);
  }
  if (ac.length < 3) {
    score -= 2;
    reasons.push(`acceptance_criteria=${ac.length} (need >=3)`);
  }
  if (hasPlaceholderText(frs) || hasPlaceholderText(trs) || hasPlaceholderText(ac)) {
    score -= 4;
    reasons.push('placeholder text detected');
  }

  // FRs must have per-item acceptance_criteria arrays for implementation-readiness.
  const weakFr = frs.filter(fr => {
    if (!fr || typeof fr !== 'object') return true;
    const req = typeof fr.requirement === 'string' ? fr.requirement : '';
    const acs = coerceArray(fr.acceptance_criteria);
    return req.length < 20 || acs.length === 0;
  }).length;
  if (frs.length > 0 && weakFr / frs.length > 0.3) {
    score -= 2;
    reasons.push(`weak/sparse FRs=${weakFr}/${frs.length}`);
  }

  return { score: Math.max(0, score), reasons };
}

function scoreArchitectureQuality(prd) {
  const arch = prd.system_architecture;
  const impl = prd.implementation_approach;
  const reasons = [];
  let score = 10;

  if (!arch || (typeof arch === 'object' && Object.keys(arch).length === 0)) {
    score -= 6;
    reasons.push('system_architecture missing/empty');
  } else if (typeof arch === 'object') {
    const components = coerceArray(arch.components);
    if (!arch.overview || String(arch.overview).length < 40) {
      score -= 2;
      reasons.push('overview too short');
    }
    if (components.length === 0) {
      score -= 2;
      reasons.push('components missing');
    }
    if (!arch.data_flow) {
      score -= 1;
      reasons.push('data_flow missing');
    }
    if (!coerceArray(arch.integration_points).length) {
      score -= 1;
      reasons.push('integration_points missing');
    }
  }

  if (!impl || (typeof impl === 'object' && Object.keys(impl).length === 0)) {
    score -= 3;
    reasons.push('implementation_approach missing');
  }

  if (hasPlaceholderText(arch) || hasPlaceholderText(impl)) {
    score -= 2;
    reasons.push('placeholder text detected');
  }

  return { score: Math.max(0, score), reasons };
}

function scoreTestSophistication(prd) {
  const tests = coerceArray(prd.test_scenarios);
  const reasons = [];
  let score = 10;

  if (tests.length < 5) {
    score -= 5;
    reasons.push(`test_scenarios=${tests.length} (need >=5)`);
  }
  const types = new Set();
  for (const t of tests) {
    if (t && typeof t === 'object' && typeof t.test_type === 'string') {
      types.add(t.test_type.toLowerCase());
    }
  }
  if (types.size < 2) {
    score -= 2;
    reasons.push(`only ${types.size} test_type(s) represented`);
  }
  const describedCount = tests.filter(t => t && t.scenario && String(t.scenario).length > 15).length;
  if (tests.length > 0 && describedCount / tests.length < 0.8) {
    score -= 2;
    reasons.push('test scenarios lack description');
  }
  if (hasPlaceholderText(tests)) {
    score -= 2;
    reasons.push('placeholder text detected');
  }

  return { score: Math.max(0, score), reasons };
}

function scoreRiskAnalysis(prd) {
  const risks = coerceArray(prd.risks);
  const reasons = [];
  let score = 10;

  if (risks.length < 3) {
    score -= 5;
    reasons.push(`risks=${risks.length} (need >=3)`);
  }
  const missingMitigation = risks.filter(r => !r || !r.mitigation || String(r.mitigation).length < 15).length;
  if (risks.length > 0 && missingMitigation > 0) {
    score -= 3;
    reasons.push(`${missingMitigation} risk(s) missing/weak mitigation`);
  }
  const missingRollback = risks.filter(r => !r || !r.rollback_plan).length;
  if (risks.length > 0 && missingRollback / risks.length > 0.5) {
    score -= 2;
    reasons.push('majority of risks lack rollback_plan');
  }
  if (hasPlaceholderText(risks)) {
    score -= 2;
    reasons.push('placeholder text detected');
  }

  return { score: Math.max(0, score), reasons };
}

/**
 * PAT-LES-e6ebbba78e2d, FR-5: warn-only scan of acceptance_criteria for unverified
 * absence-claim phrasing. Deliberately NOT a score dimension -- see ABSENCE_CLAIM_RE's
 * docblock. Pure, side-effect free; the caller decides whether/how to surface `warnings`.
 *
 * @param {Object} prd
 * @returns {string[]} human-readable warnings, one per matched acceptance_criteria entry
 */
function scanAbsenceClaims(prd) {
  const ac = coerceArray(prd.acceptance_criteria);
  const warnings = [];
  ac.forEach((item, idx) => {
    const text = typeof item === 'string' ? item : (item && typeof item === 'object' ? JSON.stringify(item) : '');
    const match = ABSENCE_CLAIM_RE.exec(text);
    if (!match) return;
    const snippet = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    warnings.push(
      `ABSENCE_CLAIM_UNVERIFIED: acceptance_criteria[${idx}] contains "${match[0]}" — an unmeasured `
      + '"there is no other X" is as unverified as an unmeasured "there is an X". State how this was '
      + `checked (e.g. "grepped lib/**/*.js for X"), or soften the wording. Text: ${snippet}`
    );
  });
  return warnings;
}

/**
 * Evaluate a PRD object against the 4-dimension rubric.
 * @param {Object} prd - PRD row from product_requirements_v2
 * @returns {{
 *   score: number,                // 0-100 weighted
 *   passed: boolean,              // true when score >= threshold
 *   threshold: number,
 *   breakdown: Array<{dimension:string, weight:number, score:number, reasons:string[]}>
 * }}
 */
function validatePRDQuality(prd, opts = {}) {
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_PASS_THRESHOLD;
  const safePrd = prd && typeof prd === 'object' ? prd : {};

  const dimensions = [
    { dimension: 'requirements_depth', weight: 0.4, ...scoreRequirementsDepth(safePrd) },
    { dimension: 'architecture_quality', weight: 0.3, ...scoreArchitectureQuality(safePrd) },
    { dimension: 'test_sophistication', weight: 0.2, ...scoreTestSophistication(safePrd) },
    { dimension: 'risk_analysis', weight: 0.1, ...scoreRiskAnalysis(safePrd) }
  ];

  const weighted = dimensions.reduce((sum, d) => sum + d.score * 10 * d.weight, 0);
  const score = Math.round(weighted);

  return {
    score,
    passed: score >= threshold,
    threshold,
    breakdown: dimensions,
    // FR-5: warn-only, never folded into `score`/`passed` above.
    warnings: scanAbsenceClaims(safePrd)
  };
}

function resolveEnforcementMode() {
  const raw = (process.env.PRD_QUALITY_ENFORCEMENT_MODE || 'off').toLowerCase().trim();
  if (raw === 'warn' || raw === 'block' || raw === 'off') return raw;
  return 'off';
}

export {
  validatePRDQuality,
  resolveEnforcementMode,
  DEFAULT_PASS_THRESHOLD,
  scanAbsenceClaims,
  ABSENCE_CLAIM_RE
};
